import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CHECKOUT_STEPS, FREE_SHIPPING_THRESHOLD, PINCODE_PATTERN } from '@core/constants/checkout';
import { CartService } from '@core/services/cart.service';
import { WishlistService } from '@core/services/wishlist.service';
import { OfferService } from '@features/offers/services/offer.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Input } from '@shared/components/input/input';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper } from '@shared/components/stepper/stepper';
import { Product } from '@shared/models';
import { eventValue } from '@shared/utils/form-events';

/** Stock counts at or below this are surfaced as "Only N left". */
const LOW_STOCK_LIMIT = 10;
const DEFAULT_MAX_QUANTITY = 10;

type PincodeState = 'idle' | 'available' | 'invalid';

@Component({
  selector: 'app-cart',
  imports: [Alert, Badge, Button, Card, CurrencyPipe, Input, PageHeading, Stepper],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cart {
  protected readonly cart = inject(CartService);
  private readonly wishlist = inject(WishlistService);
  private readonly offers = inject(OfferService);
  private readonly router = inject(Router);

  protected readonly routes = APP_ROUTES;
  protected readonly steps = CHECKOUT_STEPS;
  protected readonly freeShippingThreshold = FREE_SHIPPING_THRESHOLD;

  // ---- Order summary ----
  /** List price (before product discounts) of everything in the cart. */
  protected readonly listTotal = computed(() =>
    this.cart.items().reduce((sum, { product, quantity }) => sum + (product.originalPrice ?? product.price) * quantity, 0),
  );
  protected readonly productDiscount = computed(() => this.listTotal() - this.cart.subtotal());
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
  protected readonly orderTotal = computed(() => this.cart.subtotal() - (this.coupon()?.discount ?? 0));
  protected readonly totalSavings = computed(() => this.productDiscount() + (this.coupon()?.discount ?? 0));
  protected readonly qualifiesForFreeShipping = computed(() => this.orderTotal() > FREE_SHIPPING_THRESHOLD);

  // ---- Delivery check ----
  protected readonly pincode = signal('');
  protected readonly pincodeState = signal<PincodeState>('idle');

  constructor() {
    // Demo cart matching the design: a single item for first-time visitors.
    this.cart.seedDemoItems(['women-printed-maxi-dress-1']);
  }

  protected variantOf(product: Product): { color?: string; colorHex?: string; size?: string } {
    const color = product.colors?.[0];
    return { color: color?.name, colorHex: color?.hex, size: product.sizes?.[0] };
  }

  protected stockNote(product: Product): string {
    const left = product.stockLeft;
    return left !== undefined && left <= LOW_STOCK_LIMIT ? `In stock (Only ${left} left)` : 'In stock';
  }

  protected maxQuantity(product: Product): number {
    return product.stockLeft ?? DEFAULT_MAX_QUANTITY;
  }

  protected setQuantity(product: Product, quantity: number): void {
    if (quantity < 1 || quantity > this.maxQuantity(product)) return;
    this.cart.setQuantity(product.id, quantity);
  }

  protected saveForLater(product: Product): void {
    if (!this.wishlist.has(product.id)) this.wishlist.toggle(product.id);
    this.cart.remove(product.id);
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
    void this.router.navigate([this.routes.deliveryAddress]);
  }

  protected browseProducts(): void {
    void this.router.navigate([this.routes.products]);
  }
}
