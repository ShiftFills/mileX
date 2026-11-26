import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { WishlistService } from '@core/services/wishlist.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Pagination } from '@shared/components/pagination/pagination';
import { ProductCard } from '@shared/components/product-card/product-card';
import { Offer, OfferStatus, Product } from '@shared/models';
import { OfferService, isPercentageOffer, offerTypeLabel } from '../../services/offer.service';

const STATUS_TONES: Record<OfferStatus, BadgeTone> = {
  Active: 'success',
  Upcoming: 'info',
  Expired: 'neutral',
};
const COPIED_RESET_MS = 2000;
/** Products per page: two rows of the Home page's five-card grid (Home loads 10 products as well). */
const PAGE_SIZE = 10;

/**
 * One product of the offer, from products/get?PRODUCT_ID=<id>&STATUS=ACTIVE: its card, `unavailable` when the API
 * has no active product with that ID (delisted), or `error` when the request failed.
 */
type ProductState = Product | 'unavailable' | 'error';

const isProduct = (state: ProductState | undefined): state is Product => typeof state === 'object';

/**
 * One offer's products as product cards, like the Home page's product lists.
 * - The offer and its products (IDs and names): offer_discount/get?OFFER_ID=<id> (OfferService.loadOffer).
 * - Each product's card (price, MRP, % OFF, image, variants): products/get?PRODUCT_ID=<id>&STATUS=ACTIVE
 *   (ProductCatalogService.loadProduct, as on Product Details), for the products of the page on screen only.
 * Signed-in customers only, like the Offers & Discounts listing (the offers API needs a customer's token).
 */
// CHANGED (new)
@Component({
  selector: 'app-offer-products',
  imports: [Alert, Badge, CurrencyPipe, DatePipe, DecimalPipe, LoadingSpinner, Pagination, ProductCard, RouterLink],
  // Each product's own S3 image, as on the Home page.
  providers: [ProductImageDisplayService],
  templateUrl: './offer-products.html',
  styleUrl: './offer-products.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferProducts {
  protected readonly routes = APP_ROUTES;
  /** The OFFER_ID, bound from the `:id` route param (withComponentInputBinding). */
  readonly id = input.required<string>();
  private readonly auth = inject(AuthService);
  private readonly offerService = inject(OfferService);
  private readonly catalog = inject(ProductCatalogService);
  protected readonly wishlist = inject(WishlistService);
  protected readonly productImages = inject(ProductImageDisplayService);

  protected readonly isSignedIn = this.auth.isAuthenticated;
  protected readonly isCustomer = computed(() => this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER');

  // ---- The offer ----
  protected readonly status = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly error = signal('');
  /** The offer (null: not found, or not loaded yet). */
  protected readonly offer = signal<Offer | null>(null);
  private readonly offerRetry = signal(0);
  protected readonly percentage = computed(() => {
    const offer = this.offer();
    return offer !== null && isPercentageOffer(offer);
  });
  protected readonly typeLabel = computed(() => offerTypeLabel(this.offer()?.offerType ?? ''));
  protected readonly statusTone = computed(() => STATUS_TONES[this.offer()?.status ?? 'Active']);
  protected readonly copied = signal(false);
  private resetTimer?: ReturnType<typeof setTimeout>;

  // ---- Its products, a page at a time ----
  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly productCount = computed(() => this.offer()?.products.length ?? 0);
  protected readonly currentPage = computed(() =>
    Math.min(this.page(), Math.max(1, Math.ceil(this.productCount() / PAGE_SIZE))),
  );
  /** PRODUCT_IDs of the page on screen, in the offer's order. */
  private readonly pageIds = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return (this.offer()?.products ?? []).slice(start, start + PAGE_SIZE).map((product) => product.id);
  });
  /** Every product loaded so far, by PRODUCT_ID (going back to a page makes no new request). */
  private readonly productStates = signal<ReadonlyMap<string, ProductState>>(new Map());
  private readonly productRetry = signal(0);
  protected readonly productsLoading = signal(false);
  /** The cards of the page on screen. */
  protected readonly products = computed(() => {
    const states = this.productStates();
    return this.pageIds().flatMap((id) => {
      const state = states.get(id);
      return isProduct(state) ? [state] : [];
    });
  });
  /** How many products of the page are not sold right now, and how many could not be loaded. */
  protected readonly unavailableCount = computed(() => this.countOnPage('unavailable'));
  protected readonly failedCount = computed(() => this.countOnPage('error'));

  constructor() {
    // A signed-in customer's saved items fill their hearts (one wishlist/get read per session), as on Products.
    // CHANGED: wishlist/get (it read the saved cart rows from shopping_cart/get).
    this.wishlist.sync();

    // The offer: again for another OFFER_ID, or on Try again. Guests and other accounts make no request.
    toObservable(computed(() => ({ id: this.id(), retry: this.offerRetry() })))
      .pipe(
        switchMap(({ id }) => {
          this.offer.set(null);
          this.error.set('');
          this.page.set(1);
          const offerId = Number(id);
          if (!this.isCustomer()) return EMPTY;
          if (!id.trim() || !Number.isSafeInteger(offerId) || offerId <= 0) {
            // Not an offer ID: there is nothing to load, so the page shows "Offer not found".
            this.status.set('success');
            return EMPTY;
          }
          this.status.set('loading');
          return this.offerService.loadOffer(offerId).pipe(
            tap((offer) => {
              this.offer.set(offer);
              this.status.set('success');
            }),
            catchError((error: unknown) => {
              this.error.set(this.catalog.getErrorMessage(error));
              this.status.set('error');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // The cards of the page on screen: its products not loaded yet (or failed) are requested together.
    toObservable(computed(() => ({ ids: this.pageIds(), retry: this.productRetry() })))
      .pipe(
        switchMap(({ ids }) => {
          const known = this.productStates();
          const missing = ids.filter((id) => {
            const state = known.get(id);
            return state === undefined || state === 'error';
          });
          this.productsLoading.set(missing.length > 0);
          if (!missing.length) return EMPTY;
          return forkJoin(
            missing.map((id) =>
              this.catalog.loadProduct(id).pipe(
                map((product): ProductState => product ?? 'unavailable'),
                // One failing product must not hide the others.
                catchError(() => of<ProductState>('error')),
                map((state) => [id, state] as const),
              ),
            ),
          ).pipe(
            tap((loaded) => {
              this.productStates.update((states) => {
                const next = new Map(states);
                for (const [id, state] of loaded) next.set(id, state);
                return next;
              });
              this.productImages.show(loaded.flatMap(([, state]) => (isProduct(state) ? [state] : [])));
              this.productsLoading.set(false);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected retry(): void {
    if (this.status() !== 'loading') this.offerRetry.update((count) => count + 1);
  }

  protected retryProducts(): void {
    if (!this.productsLoading()) this.productRetry.update((count) => count + 1);
  }

  protected setPage(page: number): void {
    this.page.set(page);
  }

  protected toggleWishlist(product: Product): void {
    this.wishlist.toggleProduct(product);
  }

  protected async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return; // Clipboard blocked (insecure context / permissions): leave the code selectable.
    }
    this.copied.set(true);
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.copied.set(false), COPIED_RESET_MS);
  }

  private countOnPage(state: 'unavailable' | 'error'): number {
    const states = this.productStates();
    return this.pageIds().filter((id) => states.get(id) === state).length;
  }
}
