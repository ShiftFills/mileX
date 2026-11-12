import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { ProductCard } from '@shared/components/product-card/product-card';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductCatalogService, ProductLookupOption } from '@core/services/product-catalog.service';
import { Alert } from '@shared/components/alert/alert';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Product } from '@shared/models';
import { WishlistService } from '@core/services/wishlist.service';

/** How many category shelves the home page shows. */
// CHANGED (new): shelf constants. Shelves are now built per category from the API instead of grouping one unfiltered product list.
const SHELF_COUNT = 2;
/** How many products each shelf shows. */
const SHELF_PRODUCTS = 8;
/** Categories are checked in order; empty ones are skipped, so look at a few more than SHELF_COUNT. */
const SHELF_CANDIDATES = 4;

interface CategoryShelf {
  title: string;
  image: string;
  category: string;
  categoryId: string;
  products: Product[];
}

@Component({
  selector: 'app-home-showcases',
  imports: [Alert, LoadingSpinner, ProductCard, RouterLink],
  templateUrl: './home-showcases.html',
  styleUrl: './home-showcases.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeShowcases {
  protected readonly routes = APP_ROUTES;
  readonly categories = input<readonly ProductLookupOption[]>([]);
  protected readonly wishlist = inject(WishlistService);
  private readonly productService = inject(ProductCatalogService);
  protected readonly catalogStatus = this.productService.status;
  protected readonly catalogError = this.productService.error;

  protected readonly bestDeals = computed(() => this.productService.products().slice(0, 15));
  protected readonly recommended = computed(() =>
    [...this.productService.products()].sort((a, b) => a.price - b.price).slice(0, 10),
  );

  /**
   * Category shelves. Each shelf asks the API for that category's own products (CATEGORY_ID),
   * so a category appears here whenever it has products, regardless of what the unfiltered
   * product list happens to contain.
   */
  protected readonly shelves = signal<readonly CategoryShelf[]>([]);

  constructor() {
    this.productService.load();

    // CHANGED: each shelf loads its own category's products with loadPage(1, 8, categoryId); empty categories are skipped.
    toObservable(this.categories)
      .pipe(
        switchMap((categories) => {
          const candidates = categories.slice(0, SHELF_CANDIDATES);
          if (!candidates.length) return of<CategoryShelf[]>([]);
          return forkJoin(
            candidates.map((category) =>
              // loadPage is cached per category, so revisiting the home page costs no extra calls.
              this.productService.loadPage(1, SHELF_PRODUCTS, category.id).pipe(
                map(
                  (page): CategoryShelf => ({
                    title: category.label,
                    image: '/images/Section - HeroPromoBanner.svg',
                    category: `category-${category.id}`,
                    categoryId: category.id,
                    products: page.items.slice(0, SHELF_PRODUCTS),
                  }),
                ),
                // One failing category must not hide the others.
                catchError(() => of(null)),
              ),
            ),
          ).pipe(
            map((shelves) =>
              shelves
                .filter((shelf): shelf is CategoryShelf => shelf !== null && shelf.products.length > 0)
                .slice(0, SHELF_COUNT),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((shelves) => this.shelves.set(shelves));
  }

  protected toggleWishlist(productId: string): void {
    this.wishlist.toggle(productId);
  }

  protected retryLoad(): void {
    this.productService.load();
  }
}