import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { ProductCard } from '@shared/components/product-card/product-card';
import { PageHeader } from '@shared';
import { Alert } from '@shared/components/alert/alert';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Pagination } from '@shared/components/pagination/pagination';
import { SearchBox } from '@shared/components/search-box/search-box';
import { Select } from '@shared/components/select/select';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductLookupOption } from '@core/services/product-catalog.service';
import { PaginatedResponse, Product } from '@shared/models';
import { ProductService } from '../../services/product.service';
import { WishlistService } from '../../services/wishlist.service';

const PAGE_SIZE = 5;
// CHANGED (new): valid sort values, used to read the sort from the URL.
const SORT_OPTIONS = ['price-low', 'price-high', 'name'] as const;

@Component({
  selector: 'app-product-list',
  imports: [Alert, LoadingSpinner, PageHeader, Pagination, ProductCard, RouterLink, SearchBox, Select],
  templateUrl: './product-list.html',
  styleUrl: './product-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly wishlist = inject(WishlistService);
  protected readonly routes = APP_ROUTES;
  protected readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  /** Sort lives in the URL (?sort=...) so refresh and back/forward keep it. */
  // CHANGED: sort now lives in the URL (?sort=...) instead of a plain signal, so refresh and back/forward keep it.
  protected readonly sortBy = computed(() => {
    const sort = this.query().get('sort') ?? '';
    return (SORT_OPTIONS as readonly string[]).includes(sort) ? sort : 'featured';
  });
  protected readonly listingStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly listingError = signal<string | null>(null);
  protected readonly pageData = signal<PaginatedResponse<Product> | null>(null);
  protected readonly categories = signal<ProductLookupOption[]>([]);
  protected readonly categoriesStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly categoriesError = signal<string | null>(null);
  private readonly retryCount = signal(0);
  private readonly knownTotal = signal<number | null>(null);
  /** Category of the previous request; used to discard totals that belonged to another category. */
  // CHANGED (new): used to clear the remembered total when the category changes.
  private lastRequestedCategory: string | null = null;
  private readonly requestedPage = computed(() => {
    const page = Number(this.query().get('page'));
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
  });
  // CHANGED: `search` was removed from the request object, so typing a search no longer reloads the page.
  // Only values sent to the API belong here. Search and sort are applied to the loaded page in
  // `products`, so changing them must not trigger a reload.
  private readonly pageRequest = computed(() => ({
    page: this.requestedPage(),
    category: (this.query().get('category') ?? '').trim(),
    retry: this.retryCount(),
  }));
  protected readonly currentPage = computed(() => this.pageData()?.page ?? this.requestedPage());
  protected readonly totalPages = computed(
    () =>
      this.pageData()?.totalPages ??
      (this.knownTotal() === null
        ? undefined
        : Math.ceil(this.knownTotal()! / this.pageSize())),
  );
  protected readonly pageSize = computed(() => this.pageData()?.pageSize ?? PAGE_SIZE);
  protected readonly totalProducts = computed(
    () => this.pageData()?.total ?? this.knownTotal() ?? undefined,
  );
  protected readonly hasProducts = computed(() => (this.totalProducts() ?? 0) > 0);
  protected readonly hasNextPage = computed(() => {
    const totalPages = this.totalPages();
    return totalPages !== undefined
      ? this.currentPage() < totalPages
      : (this.pageData()?.hasNext ?? false);
  });
  protected readonly categoryOptions = computed(() => {
    return this.categories().map((category) => ({ value: category.id, label: category.label }));
  });
  protected readonly products = computed(() => {
    const query = this.query();
    const search = (query.get('q') ?? '').trim().toLowerCase();
    // CHANGED: the in-browser category filter was removed; the server filters by CATEGORY_ID.
    // Category filtering now happens on the server (CATEGORY_ID), so only search is applied here.
    const results = (this.pageData()?.items ?? []).filter(
      (product) =>
        !search || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(search),
    );
    return [...results].sort((a, b) => {
      if (this.sortBy() === 'price-low') return a.price - b.price;
      if (this.sortBy() === 'price-high') return b.price - a.price;
      if (this.sortBy() === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  });

  constructor() {
    this.loadCategories();
    toObservable(this.pageRequest)
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous.page === current.page &&
            previous.category === current.category &&
            previous.retry === current.retry,
        ),
        tap(({ category }) => {
          // A total remembered from another category would show wrong pagination, so drop it.
          // CHANGED (new): a total remembered from another category is dropped when the category changes.
          if (category !== this.lastRequestedCategory) {
            this.knownTotal.set(null);
            this.lastRequestedCategory = category;
          }
          this.listingStatus.set('loading');
          this.listingError.set(null);
          this.pageData.set(null);
        }),
        switchMap(({ page, category }) =>
          // CHANGED: the selected category is now passed to the API (server-side filtering and pagination).
          this.productService.loadPage(page, PAGE_SIZE, category || null).pipe(
            tap((pageData) => {
              if (pageData.total !== undefined) this.knownTotal.set(pageData.total);
              if (
                pageData.page > 1 &&
                pageData.items.length === 0 &&
                pageData.totalPages !== undefined &&
                pageData.page > pageData.totalPages
              ) {
                this.knownTotal.set(
                  pageData.total ?? (pageData.page - 1) * pageData.pageSize,
                );
                this.goToPage(Math.max(1, pageData.totalPages));
                return;
              }
              this.pageData.set(pageData);
              this.listingStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.listingError.set(this.productService.getErrorMessage(error));
              this.listingStatus.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  protected search(searchTerm: string): void {
    void this.router.navigate([this.routes.products], {
      queryParams: { ...this.currentQuery(), q: searchTerm || null, page: null },
    });
  }

  protected setCategory(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) {
      void this.router.navigate([this.routes.products], {
        queryParams: { ...this.currentQuery(), category: select.value || null, page: null },
      });
    }
  }

  protected goToPage(page: number): void {
    void this.router.navigate([this.routes.products], {
      queryParams: { ...this.currentQuery(), page: page === 1 ? null : String(page) },
    });
  }

  protected toggleWishlist(productId: string): void {
    this.wishlist.toggle(productId);
  }

  protected updateSort(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) {
      void this.router.navigate([this.routes.products], {
        queryParams: {
          ...this.currentQuery(),
          // CHANGED: the selected sort is written to the URL (?sort=...).
          sort: select.value === 'featured' ? null : select.value,
          page: null,
        },
      });
    }
  }

  protected retryLoad(): void {
    this.retryCount.update((count) => count + 1);
  }

  protected retryCategories(): void {
    this.loadCategories();
  }

  private loadCategories(): void {
    this.categoriesStatus.set('loading');
    this.categoriesError.set(null);
    this.productService.loadCategories().pipe(
      tap((categories) => {
        this.categories.set(categories);
        this.categoriesStatus.set('success');
      }),
      catchError((error: unknown) => {
        this.categoriesError.set(this.productService.getErrorMessage(error));
        this.categoriesStatus.set('error');
        return EMPTY;
      }),
      takeUntilDestroyed(),
    ).subscribe();
  }

  private currentQuery(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const key of this.query().keys) {
      const value = this.query().get(key);
      if (value) values[key] = value;
    }
    return values;
  }
}