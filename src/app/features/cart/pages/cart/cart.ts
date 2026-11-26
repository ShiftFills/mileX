import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CHECKOUT_STEPS, FREE_SHIPPING_THRESHOLD, PINCODE_PATTERN } from '@core/constants/checkout';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { ToastService } from '@core/services/toast.service';
import { WishlistService } from '@core/services/wishlist.service';
import { ShoppingCartService } from '@features/cart/services/shopping-cart.service';
import { OfferService } from '@features/offers/services/offer.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper } from '@shared/components/stepper/stepper';
import { CartItem } from '@shared/models';
import { eventValue } from '@shared/utils/form-events';
import { finalize, of, switchMap, tap } from 'rxjs';

/** Stock counts at or below this are surfaced as "Only N left". */
const LOW_STOCK_LIMIT = 10;
const DEFAULT_MAX_QUANTITY = 10;

type PincodeState = 'idle' | 'available' | 'invalid';
type PendingCartAction = 'save' | 'remove';

@Component({
  selector: 'app-cart',
  imports: [Alert, Badge, Button, Card, CurrencyPipe, Input, LoadingSpinner, PageHeading, Stepper],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // CHANGED (new): each cart and saved-for-later row shows its product's own image (signed S3 URL).
  providers: [ProductImageDisplayService],
})
export class Cart {
  protected readonly cart = inject(CartService);
  protected readonly catalog = inject(ProductCatalogService);
  // CHANGED (new)
  protected readonly productImages = inject(ProductImageDisplayService);
  private readonly auth = inject(AuthService);
  private readonly shoppingCart = inject(ShoppingCartService);
  private readonly wishlist = inject(WishlistService);
  private readonly offers = inject(OfferService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly routes = APP_ROUTES;
  protected readonly steps = CHECKOUT_STEPS;
  protected readonly freeShippingThreshold = FREE_SHIPPING_THRESHOLD;
  private readonly apiCartStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  private readonly apiCartError = signal('');
  /** CART_IDs with a save-for-later or delete request in flight; blocks repeat clicks on the same row. */
  private readonly pendingCartActions = signal<ReadonlyMap<string, PendingCartAction>>(new Map());
  protected readonly isCustomer = computed(() =>
    this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER',
  );
  // CHANGED (new): true when a customer session has no CUSTOMER_ID (for example a session created
  // before CUSTOMER_ID was stored). Retrying can never fix that; the user has to sign in again.
  protected readonly needsSignIn = computed(
    () => this.isCustomer() && this.auth.customerId() === undefined,
  );
  protected readonly pageStatus = computed(() =>
    this.isCustomer() ? this.apiCartStatus() : this.catalog.status(),
  );
  protected readonly pageError = computed(() =>
    this.isCustomer() ? this.apiCartError() : this.catalog.error(),
  );

  // ---- Order summary ----
  // CHANGED: every total below counts the purchasable rows only (delisted products are left out).
  /** List price (before product discounts) of everything in the cart. */
  protected readonly listTotal = computed(() =>
    this.cart.purchasableItems().reduce((sum, { product, quantity }) => sum + (product.originalPrice ?? product.price) * quantity, 0),
  );
  // CHANGED: every row's product discount is MRP − price (see lineProductDiscount), as on checkout.
  protected readonly productDiscount = computed(() =>
    this.cart.purchasableItems().reduce((sum, item) => sum + this.lineProductDiscount(item), 0),
  );
  protected readonly cartDiscount = computed(() =>
    this.cart.purchasableItems().reduce(
      (sum, item) => sum + (item.apiDetails ? this.scaledAmount(item.apiDetails.cartDiscount, item) : 0),
      0,
    ),
  );
  protected readonly taxTotal = computed(() =>
    this.cart.purchasableItems().reduce(
      (sum, item) => sum + (item.apiDetails ? this.scaledAmount(item.apiDetails.tax, item) : 0),
      0,
    ),
  );
  protected readonly couponInput = signal('');
  protected readonly couponError = signal('');
  private readonly appliedCode = signal('');
  /** The applied coupon, dropped automatically if the cart no longer qualifies for it. */
  protected readonly coupon = computed(() => {
    const code = this.appliedCode();
    if (!code) return null;
    const result = this.offers.applyCoupon(code, this.cart.subtotal());
    return 'discount' in result ? result : null;
  });
  protected readonly orderTotal = computed(() => {
    const apiTotal = this.cart.purchasableItems().reduce(
      (sum, item) =>
        sum +
        (item.apiDetails
          ? this.scaledAmount(item.apiDetails.totalAmount, item)
          : item.product.price * item.quantity),
      0,
    );
    const baseTotal = this.isCustomer() ? apiTotal : this.cart.subtotal();
    return Math.max(0, baseTotal - (this.coupon()?.discount ?? 0));
  });
  protected readonly totalSavings = computed(
    () => this.productDiscount() + this.cartDiscount() + (this.coupon()?.discount ?? 0),
  );
  protected readonly qualifiesForFreeShipping = computed(() => this.orderTotal() > FREE_SHIPPING_THRESHOLD);

  // ---- Delivery check ----
  protected readonly pincode = signal('');
  protected readonly pincodeState = signal<PincodeState>('idle');

  constructor() {
    // CHANGED: the cart loads the catalog itself (CartService no longer loads it on every page) so the
    // saved cart rows are restored with the latest product values. load() is a no-op once loaded.
    this.catalog.load();
    if (this.isCustomer()) this.loadCustomerCart();
    // CHANGED (new): Save for later skips the wishlist add for a variant that is already saved (one wishlist/get read
    // per session, shared with the hearts).
    this.wishlist.sync();
    // CHANGED (new): loads the S3 image URLs of the rows on screen whenever the cart or saved list changes
    // (one request per distinct key; cached URLs make none).
    effect(() => {
      const products = [...this.cart.items(), ...this.cart.savedItems()].map((item) => item.product);
      untracked(() => this.productImages.show(products));
    });
  }

  protected variantOf(item: CartItem): {
    name?: string;
    color?: string;
    size?: string;
    material?: string;
  } {
    const variant = item.apiDetails?.variant;
    const productVariant = item.product.variantDetails?.split('·')[0]?.trim();
    return {
      ...(variant?.name || productVariant ? { name: variant?.name ?? productVariant } : {}),
      ...(variant?.color ? { color: variant.color } : {}),
      ...(variant?.size ? { size: variant.size } : {}),
      ...(variant?.material ? { material: variant.material } : {}),
    };
  }

  /** The product was delisted (inactive): shown as no longer available and left out of the totals. */
  // CHANGED (new)
  protected isDelisted(item: CartItem): boolean {
    return item.product.isActive === false;
  }

  protected stockNote(item: CartItem): string {
    const left = item.product.stockLeft;
    return left !== undefined && left <= LOW_STOCK_LIMIT ? `In stock (Only ${left} left)` : 'In stock';
  }

  protected maxQuantity(item: CartItem): number {
    return Math.max(
      1,
      Math.min(
        item.product.stockLeft ?? DEFAULT_MAX_QUANTITY,
        item.product.maxOrderQuantity ?? DEFAULT_MAX_QUANTITY,
      ),
    );
  }

  protected setQuantity(item: CartItem, quantity: number): void {
    // CHANGED: a delisted row's quantity cannot change (it can only be removed).
    if (this.isBusy(item) || this.isDelisted(item)) return;
    if (quantity < 1 || quantity > this.maxQuantity(item)) return;
    this.cart.setQuantity(item.product.id, quantity, item.apiDetails?.cartId);
  }

  protected isSaving(item: CartItem): boolean {
    return this.pendingAction(item) === 'save';
  }

  protected isRemoving(item: CartItem): boolean {
    return this.pendingAction(item) === 'remove';
  }

  /** True while any API request for this row is in flight. */
  protected isBusy(item: CartItem): boolean {
    return this.pendingAction(item) !== undefined;
  }

  /**
   * Save for later moves an API row to the wishlist: POST wishlist/manage `{ PRODUCT_ID, PRODUCT_VARIANT_ID,
   * ACTION: "ADD" }` with the row's product and variant (skipped when that variant is already in the wishlist), then
   * DELETE shopping_cart/delete for the row. The row leaves the cart only after both succeeded.
   */
  // CHANGED: the wishlist API (wishlist/manage) replaces PUT wishlist/save_for_later, which marked the cart row as
  // saved for later; the row is then deleted from the cart, as Save for later used to take it out of the cart.
  protected saveForLater(item: CartItem): void {
    const cartId = item.apiDetails?.cartId;
    if (cartId === undefined) {
      // Local-only row (guest, or added on this device): it has no CART_ID, so the API cannot be called.
      // CHANGED: hasOnDevice (has() now takes the product and its variant).
      if (!this.wishlist.hasOnDevice(item.product.id)) this.wishlist.toggle(item.product.id);
      this.cart.remove(item.product.id);
      return;
    }
    if (this.pendingCartActions().has(cartId)) return;
    const variantId = item.apiDetails?.variant?.id;
    if (!variantId) {
      this.toast.showError(`${item.product.name} cannot be saved to your wishlist right now. Variant details are missing.`);
      return;
    }

    this.setPending(cartId, 'save');
    let saved = false;
    const addToWishlist = this.wishlist.has(item.product, variantId)
      ? of(undefined)
      : this.wishlist.manage(item.product.id, variantId, 'ADD');
    addToWishlist.pipe(
      tap(() => (saved = true)),
      switchMap(() => this.shoppingCart.removeItem(item)),
      finalize(() => this.setPending(cartId, null)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        this.cart.remove(item.product.id, cartId);
        this.toast.showSuccess(`${item.product.name} was moved to your wishlist.`);
      },
      error: (error: unknown) => {
        const message = this.catalog.getErrorMessage(error);
        // Saved, but the cart row is still there: say so, so it is not saved again by mistake.
        this.toast.showError(
          saved ? `${item.product.name} was saved to your wishlist, but could not be removed from your cart. ${message}` : message,
        );
      },
    });
  }

  protected removeItem(item: CartItem): void {
    const cartId = item.apiDetails?.cartId;
    if (cartId === undefined) {
      // Local-only row (guest, or added on this device): nothing exists in the backend cart to delete.
      this.cart.remove(item.product.id);
      return;
    }
    if (this.pendingCartActions().has(cartId)) return;

    this.setPending(cartId, 'remove');
    this.shoppingCart.removeItem(item).pipe(
      finalize(() => this.setPending(cartId, null)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: () => {
        // Removes only this CART_ID, so other rows (even for the same product) stay. Count, discounts,
        // tax, subtotal and total are computed from the remaining items and update automatically.
        this.cart.remove(item.product.id, cartId);
        this.toast.showSuccess(`${item.product.name} was removed from your cart.`);
      },
      error: (error: unknown) => this.toast.showError(this.catalog.getErrorMessage(error)),
    });
  }

  /**
   * The row's saving against MRP: (MRP − price) × quantity, the struck-through price minus the price shown on the
   * row. The cart API's PRODUCT_DISCOUNT is not used: it is the product's DISCOUNT column, which is 0.00 on most
   * discounted products and is a per-unit amount, not a line total.
   */
  // CHANGED: API rows use the same rule as local rows and the checkout pages (was PRODUCT_DISCOUNT for API rows).
  protected lineProductDiscount(item: CartItem): number {
    return Math.max(0, (item.product.originalPrice ?? item.product.price) - item.product.price) * item.quantity;
  }

  protected lineCartDiscount(item: CartItem): number {
    return item.apiDetails ? this.scaledAmount(item.apiDetails.cartDiscount, item) : 0;
  }

  protected lineTax(item: CartItem): number {
    return item.apiDetails ? this.scaledAmount(item.apiDetails.tax, item) : 0;
  }

  protected lineTotal(item: CartItem): number {
    return item.apiDetails
      ? this.scaledAmount(item.apiDetails.totalAmount, item)
      : item.product.price * item.quantity;
  }

  protected updateCoupon(event: Event): void {
    this.couponInput.set(eventValue(event) ?? '');
    this.couponError.set('');
  }

  protected applyCoupon(event: Event): void {
    event.preventDefault();
    const result = this.offers.applyCoupon(this.couponInput(), this.cart.subtotal());
    if ('error' in result) {
      this.couponError.set(result.error);
      return;
    }
    this.appliedCode.set(result.code);
    this.couponInput.set('');
    this.couponError.set('');
  }

  protected removeCoupon(): void {
    this.appliedCode.set('');
  }

  protected updatePincode(event: Event): void {
    const digits = (eventValue(event) ?? '').replace(/\D/g, '').slice(0, 6);
    if (event.target instanceof HTMLInputElement) event.target.value = digits;
    this.pincode.set(digits);
    this.pincodeState.set('idle');
  }

  protected checkPincode(event: Event): void {
    event.preventDefault();
    this.pincodeState.set(PINCODE_PATTERN.test(this.pincode()) ? 'available' : 'invalid');
  }

  protected proceedToCheckout(): void {
    if (this.cart.hasUnavailableItems()) return;
    void this.router.navigate([this.routes.deliveryAddress]);
  }

  protected browseProducts(): void {
    void this.router.navigate([this.routes.products]);
  }

  protected retryLoad(): void {
    // CHANGED: with a missing CUSTOMER_ID, "Try again" used to re-read the same missing value and fail
    // forever. Now it clears the stale session and sends the user to Login, returning to the cart after.
    if (this.needsSignIn()) {
      this.auth.clearSession();
      void this.router.navigate([this.routes.login], { queryParams: { returnUrl: this.routes.cart } });
      return;
    }
    if (this.isCustomer()) {
      this.loadCustomerCart();
      return;
    }
    this.catalog.load();
  }

  private loadCustomerCart(): void {
    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      this.apiCartStatus.set('error');
      this.apiCartError.set('A valid customer ID is unavailable. Sign in again to load your cart.');
      return;
    }

    this.apiCartStatus.set('loading');
    this.apiCartError.set('');
    this.shoppingCart.getCart(customerId).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: (items) => {
        this.cart.mergeFetchedItems(items);
        this.apiCartStatus.set('success');
      },
      error: (error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'The shopping cart could not be loaded.';
        this.apiCartError.set(message);
        this.apiCartStatus.set('error');
        this.toast.showError(message);
      },
    });
  }

  private pendingAction(item: CartItem): PendingCartAction | undefined {
    const cartId = item.apiDetails?.cartId;
    return cartId === undefined ? undefined : this.pendingCartActions().get(cartId);
  }

  private setPending(cartId: string, action: PendingCartAction | null): void {
    this.pendingCartActions.update((actions) => {
      const next = new Map(actions);
      if (action) next.set(cartId, action);
      else next.delete(cartId);
      return next;
    });
  }

  private scaledAmount(amount: number, item: CartItem): number {
    const originalQuantity = item.apiDetails?.originalQuantity ?? item.quantity;
    if (originalQuantity <= 0) return 0;
    // Scale API line amounts when the existing local quantity control changes quantity.
    return Math.round((amount * item.quantity / originalQuantity + Number.EPSILON) * 100) / 100;
  }
}