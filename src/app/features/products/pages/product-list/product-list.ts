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
  protected readonly sortBy = signal('featured');
  protected readonly listingStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly listingError = signal<string | null>(null);
  protected readonly pageData = signal<PaginatedResponse<Product> | null>(null);
  protected readonly categories = signal<ProductLookupOption[]>([]);
  protected readonly categoriesStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly categoriesError = signal<string | null>(null);
  private readonly retryCount = signal(0);
  private readonly knownTotal = signal<number | null>(null);
  private readonly requestedPage = computed(() => {
    const page = Number(this.query().get('page'));
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
  });
  private readonly pageRequest = computed(() => ({
    page: this.requestedPage(),
    search: (this.query().get('q') ?? '').trim().toLowerCase(),
    category: this.query().get('category') ?? '',
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
    const category = query.get('category');
    const results = (this.pageData()?.items ?? []).filter((product) => {
      const matchesSearch =
        !search || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(search);
      return matchesSearch &&
        (!category || product.category === category || product.category === `category-${category}`);
    });
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
            previous.search === current.search &&
            previous.category === current.category &&
            previous.retry === current.retry,
        ),
        tap(() => {
          this.listingStatus.set('loading');
          this.listingError.set(null);
          this.pageData.set(null);
        }),
        switchMap(({ page }) =>
          this.productService.loadPage(page, PAGE_SIZE).pipe(
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
      this.sortBy.set(select.value);
      void this.router.navigate([this.routes.products], {
        queryParams: { ...this.currentQuery(), page: null },
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
