import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ProductCard } from '@shared/components/product-card/product-card';
import { APP_ROUTES } from '@core/constants/app-routes';
import {
  ProductCatalogService,
  ProductListingFilters,
  ProductLookupOption,
} from '@core/services/product-catalog.service';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { Alert } from '@shared/components/alert/alert';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Product } from '@shared/models';
import { WishlistService } from '@core/services/wishlist.service';

/**
 * Home page products: active products of every category, brand and seller, i.e.
 * `products/get?PRODUCT_ID=-1&CATEGORY_ID=-1&BRAND_ID=-1&SELLER_ID=-1&STATUS=ACTIVE&LIMIT=10&OFFSET=0`.
 * Omitted category and brand are sent as -1 by loadListingPage. Category shelves send the same
 * request with their own CATEGORY_ID.
 */
// CHANGED (new): replaces the unfiltered products/get request (productService.load()) on the Home page.
const HOME_PRODUCT_FILTERS: ProductListingFilters = { sellerId: -1, status: 'ACTIVE' };
/** How many products the Home page request loads (LIMIT). Page 1 is OFFSET=0. */
const HOME_PRODUCTS = 10;

/** Up to `limit` products. STATUS=ACTIVE is filtered by the API; an inactive row is still never shown. */
// CHANGED (new): shared by the Home products and the category shelves.
function activeProducts(items: readonly Product[], limit: number): Product[] {
  return items.filter((product) => product.isActive !== false).slice(0, limit);
}

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
  // CHANGED (new): each product's own S3 image, handled like the All Products table.
  providers: [ProductImageDisplayService],
  templateUrl: './home-showcases.html',
  styleUrl: './home-showcases.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeShowcases {
  protected readonly routes = APP_ROUTES;
  readonly categories = input<readonly ProductLookupOption[]>([]);
  protected readonly wishlist = inject(WishlistService);
  // CHANGED (new): the image of each product card and shelf item (signed S3 URL from its PRODUCT_IMAGE).
  protected readonly productImages = inject(ProductImageDisplayService);
  private readonly productService = inject(ProductCatalogService);
  private readonly destroyRef = inject(DestroyRef);
  // CHANGED: Home keeps its own request state. The shared catalog (load/status/error/products) is still
  // used by cart, checkout and wishlist, so it is no longer touched here.
  protected readonly catalogStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly catalogError = signal<string | null>(null);

  /** The Home page products, in API order. */
  protected readonly bestDeals = signal<readonly Product[]>([]);
  protected readonly recommended = computed(() =>
    [...this.bestDeals()].sort((a, b) => a.price - b.price),
  );

  /**
   * Category shelves. Each shelf asks the API for that category's own products (CATEGORY_ID),
   * so a category appears here whenever it has products, regardless of what the unfiltered
   * product list happens to contain.
   */
  protected readonly shelves = signal<readonly CategoryShelf[]>([]);

  constructor() {
    this.loadProducts();
    // CHANGED (new): a signed-in customer's saved items fill their hearts (one shopping_cart/get per session).
    this.wishlist.sync();

    // CHANGED: each shelf sends the Home products request (HOME_PRODUCT_FILTERS) with its own CATEGORY_ID
    // instead of loadPage(1, 8, categoryId); empty categories are skipped.
    toObservable(this.categories)
      .pipe(
        switchMap((categories) => {
          const candidates = categories.slice(0, SHELF_CANDIDATES);
          if (!candidates.length) return of<CategoryShelf[]>([]);
          return forkJoin(
            candidates.map((category) =>
              // Page requests are cached per category, so revisiting the home page costs no extra calls.
              this.productService
                .loadListingPage({ ...HOME_PRODUCT_FILTERS, categoryId: Number(category.id) }, 1, SHELF_PRODUCTS)
                .pipe(
                  map(
                    (page): CategoryShelf => ({
                      title: category.label,
                      image: '/images/Section - HeroPromoBanner.svg',
                      category: `category-${category.id}`,
                      categoryId: category.id,
                      products: activeProducts(page.items, SHELF_PRODUCTS),
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
      .subscribe((shelves) => {
        this.shelves.set(shelves);
        // CHANGED (new): one URL request per distinct image key (keys already loaded make none).
        this.productImages.show(shelves.flatMap((shelf) => shelf.products));
      });
  }

  // CHANGED: takes the product. The wishlist API saves its cart row (wishlist/save_for_later with that row's CART_ID
  // and VARIANT_ID); a signed-out visitor is sent to Login first.
  protected toggleWishlist(product: Product): void {
    this.wishlist.toggleProduct(product);
  }

  protected retryLoad(): void {
    this.loadProducts();
  }

  /** Loads Best Deals / Recommended Items. The page request is cached, so revisiting Home costs no extra call. */
  // CHANGED (new): one loadListingPage request with HOME_PRODUCT_FILTERS, replacing productService.load().
  private loadProducts(): void {
    this.catalogStatus.set('loading');
    this.catalogError.set(null);
    this.productService.loadListingPage(HOME_PRODUCT_FILTERS, 1, HOME_PRODUCTS).pipe(
      tap((page) => {
        this.bestDeals.set(activeProducts(page.items, HOME_PRODUCTS));
        // CHANGED (new): Best Deals and Recommended Items show the same products, so one call covers both.
        this.productImages.show(this.bestDeals());
        this.catalogStatus.set('success');
      }),
      catchError((error: unknown) => {
        this.catalogError.set(this.productService.getErrorMessage(error));
        this.catalogStatus.set('error');
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }
}