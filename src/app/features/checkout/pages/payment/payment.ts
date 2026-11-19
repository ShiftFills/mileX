import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CHECKOUT_STEPS, FREE_SHIPPING_THRESHOLD } from '@core/constants/checkout';
import { AddressService } from '@core/services/address.service';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { PaymentMethodService } from '@core/services/payment-method.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';
import { ShoppingCartService } from '@features/cart/services/shopping-cart.service';
import { OrderService } from '@features/orders/services/order.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper } from '@shared/components/stepper/stepper';
import { CartItem, PlaceOrderPayload, PlaceOrderResult, Product } from '@shared/models';
import { finalize } from 'rxjs';

/** Which logos the template shows for a method; the API only returns the id and the name. */
export type PaymentMethodKind = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod';

interface PaymentMethodStyle {
  kind: PaymentMethodKind;
  description: string;
}

/** A payment method from the API, plus the display-only extras the API does not provide. */
interface PaymentMethodOption {
  /** PAYMENT_METHOD_ID */
  id: number;
  /** PAYMENT_METHOD_NAME */
  name: string;
  /** Empty for a method this page has no description for. */
  description: string;
  /** Null for a method this page has no logos for: the row is shown with its name only. */
  kind: PaymentMethodKind | null;
}

/**
 * Description and logos by PAYMENT_METHOD_ID. This is only decoration: which methods are offered,
 * and their names, always come from the API. A method that is not listed here still appears.
 */
const METHOD_STYLES: Readonly<Record<number, PaymentMethodStyle>> = {
  1: { kind: 'cod', description: 'Pay at the time of delivery' },
  2: { kind: 'upi', description: 'Pay using Google Pay, PhonePe, Paytm & more' },
  3: { kind: 'card', description: 'Visa, Mastercard, RuPay & more' },
  4: { kind: 'card', description: 'Visa, Mastercard, RuPay & more' },
  5: { kind: 'netbanking', description: 'Pay using your bank account' },
  6: { kind: 'wallet', description: 'Pay using Paytm, PhonePe, Amazon Pay & more' },
};

/** Display order (UPI first, as before). Methods not listed here follow, in the order the API sent them. */
const DISPLAY_ORDER: readonly number[] = [2, 3, 4, 5, 6, 1];

/**
 * Cash on Delivery is recognised by the NAME the payment_method API returns, never by an id:
 * nothing is paid online, so the order can be placed straight away.
 */
const COD_NAME = /^\s*(?:cash\s*on\s*delivery|cod)\s*$/i;

/** A CART_ID in the checkout URL must be a positive whole number. */
const CART_ID_PATTERN = /^[1-9]\d{0,14}$/;

const PLACE_ORDER_FAILED = 'The order could not be placed. Please try again.';

function displayRank(id: number): number {
  const index = DISPLAY_ORDER.indexOf(id);
  return index === -1 ? DISPLAY_ORDER.length : index;
}

/** Checkout step 3: choose how to pay and review the order summary. */
@Component({
  selector: 'app-payment',
  imports: [Alert, Button, Card, CurrencyPipe, LoadingSpinner, PageHeading, RouterLink, Stepper],
  templateUrl: './payment.html',
  styleUrl: './payment.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentPage {
  protected readonly cart = inject(CartService);
  protected readonly catalog = inject(ProductCatalogService);
  private readonly paymentMethods = inject(PaymentMethodService);
  private readonly addressBook = inject(AddressService);
  private readonly orders = inject(OrderService);
  private readonly shoppingCart = inject(ShoppingCartService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly routes = APP_ROUTES;
  protected readonly steps = CHECKOUT_STEPS;
  protected readonly freeShippingThreshold = FREE_SHIPPING_THRESHOLD;

  /**
   * `?cartId=` is set for a single-product order (Buy Now): only that cart row is ordered and
   * summarised. Without it the whole cart is ordered (CART_ID 0). A malformed value orders nothing.
   */
  private readonly cartIdParam = inject(ActivatedRoute).snapshot.queryParamMap.get('cartId');
  private readonly cartIdValid = this.cartIdParam === null || CART_ID_PATTERN.test(this.cartIdParam);

  /** Loading state of the payment_method API: 'idle' | 'loading' | 'success' | 'error'. */
  protected readonly methodsStatus = this.paymentMethods.status;
  protected readonly methodsError = this.paymentMethods.error;

  /** Loading state of the cart re-read a single-product order needs after a page reload. */
  protected readonly cartSync = signal<'idle' | 'loading' | 'error'>('idle');
  protected readonly cartSyncError = signal('');

  /** The methods from the API in display order. Empty while loading, on error, or when none are offered. */
  protected readonly methods = computed<readonly PaymentMethodOption[]>(() =>
    this.paymentMethods
      .methods()
      .map((method) => {
        const style = METHOD_STYLES[method.PAYMENT_METHOD_ID];
        return {
          id: method.PAYMENT_METHOD_ID,
          name: method.PAYMENT_METHOD_NAME,
          description: style?.description ?? '',
          kind: style?.kind ?? null,
        };
      })
      .sort((a, b) => displayRank(a.id) - displayRank(b.id)),
  );

  /** The id the customer picked; null until they pick one. */
  private readonly chosenMethodId = signal<number | null>(null);
  /** True while the place_order request is running: blocks a second submission. */
  protected readonly placing = signal(false);
  /** Set once the order is placed; the success panel shows it. */
  protected readonly orderResult = signal<PlaceOrderResult | null>(null);

  /**
   * PAYMENT_METHOD_ID of the selected method. Until the customer picks one it is the first method
   * in the list (UPI), and a pick that is no longer offered after a reload falls back to it.
   * Null while there is nothing to select.
   */
  protected readonly selectedMethodId = computed<number | null>(() => {
    const methods = this.methods();
    const chosen = this.chosenMethodId();
    if (chosen !== null && methods.some((method) => method.id === chosen)) return chosen;
    return methods[0]?.id ?? null;
  });

  /** Cash on Delivery has nothing to pay online, so the button says what it actually does. */
  protected readonly isCod = computed(() => {
    const id = this.selectedMethodId();
    const method = this.methods().find((entry) => entry.id === id);
    return method !== undefined && COD_NAME.test(method.name);
  });

  // ---- Order summary: the cart rows this checkout is for ----
  /** The whole cart, or just the one row of a single-product order. */
  protected readonly lines = computed(() =>
    this.cartIdValid ? this.cart.checkoutItems(this.cartIdParam) : [],
  );
  protected readonly hasUnavailableItems = computed(() =>
    this.lines().some((line) => !line.product.inStock),
  );
  protected readonly listTotal = computed(() =>
    this.lines().reduce((sum, { product, quantity }) => sum + (product.originalPrice ?? product.price) * quantity, 0),
  );
  protected readonly subtotal = computed(() =>
    this.lines().reduce((sum, { product, quantity }) => sum + product.price * quantity, 0),
  );
  protected readonly productDiscount = computed(() => this.listTotal() - this.subtotal());
  /** SHIPPING_CHARGES: the cart's own shipping rule applied to these rows. */
  protected readonly shippingCharges = computed(() =>
    this.cart.shippingFor(this.subtotal(), this.lines().reduce((sum, line) => sum + line.quantity, 0)),
  );
  protected readonly orderTotal = computed(() => this.subtotal() + this.shippingCharges());
  protected readonly qualifiesForFreeShipping = computed(() => this.subtotal() > FREE_SHIPPING_THRESHOLD);

  /** Everything the order needs is present and nothing is already being sent. */
  protected readonly canPlaceOrder = computed(
    () =>
      !this.placing() &&
      this.isCod() &&
      this.methodsStatus() === 'success' &&
      this.lines().length > 0 &&
      !this.hasUnavailableItems(),
  );

  constructor() {
    // The selected address lives in memory only, so after a reload (or when arriving directly)
    // there is none: send the customer back to choose one instead of guessing.
    if (!this.addressBook.selected()) {
      this.toast.showError('Choose a delivery address to continue.');
      void this.router.navigate([this.routes.deliveryAddress], { queryParamsHandling: 'preserve' });
      return;
    }
    // CHANGED: loads the catalog for the cart rows (CartService no longer loads it on every page).
    this.catalog.load();
    this.paymentMethods.load();
    if (this.cartIdParam !== null && this.cartIdValid && !this.cart.checkoutItems(this.cartIdParam).length) {
      this.loadCartRow();
    }
  }

  protected selectMethod(id: number): void {
    this.chosenMethodId.set(id);
  }

  protected variantOf(product: Product): { color?: string; size?: string } {
    return { color: product.colors?.[0]?.name, size: product.sizes?.[0] && `Size ${product.sizes[0]}` };
  }

  /**
   * BILLING_ADDRESS_ID. The order contract has a billing address field but this app has no
   * separate billing address, so the delivery address is used. Change it here only, if the
   * backend ever needs something else.
   */
  private billingAddressId(deliveryAddressId: number): number {
    return deliveryAddressId;
  }

  /** Places the order (POST place_order). Only Cash on Delivery is supported for now. */
  protected placeOrder(): void {
    if (this.placing() || !this.canPlaceOrder()) return;
    const address = this.addressBook.selected();
    const methodId = this.selectedMethodId();
    if (!address || methodId === null) {
      this.toast.showError('Choose a delivery address to continue.');
      void this.router.navigate([this.routes.deliveryAddress], { queryParamsHandling: 'preserve' });
      return;
    }

    const deliveryAddressId = Number(address.id);
    const payload: PlaceOrderPayload = {
      CART_ID: this.cartIdParam === null ? 0 : Number(this.cartIdParam),
      DELIVERY_ADDRESS_ID: deliveryAddressId,
      BILLING_ADDRESS_ID: this.billingAddressId(deliveryAddressId),
      PAYMENT_METHOD: methodId,
      SHIPPING_CHARGES: this.shippingCharges(),
    };
    const orderedLines = this.lines();

    this.placing.set(true);
    this.orders
      .placeOrder(payload)
      .pipe(finalize(() => this.placing.set(false)))
      .subscribe({
        next: (result) => {
          this.removeOrderedLines(orderedLines);
          this.orderResult.set(result);
          this.toast.showSuccess(result.message);
        },
        error: (error: unknown) =>
          this.toast.showError(this.orders.placeOrderErrorMessage(error) || PLACE_ORDER_FAILED),
      });
  }

  /** The whole cart is emptied after a CART_ID 0 order; a single-product order removes only its row. */
  private removeOrderedLines(lines: readonly CartItem[]): void {
    if (this.cartIdParam === null) {
      this.cart.clear();
      return;
    }
    for (const line of lines) this.cart.remove(line.product.id, line.apiDetails?.cartId);
  }

  /** A single-product order needs the cart row's CART_ID, which only the server cart carries. */
  private loadCartRow(): void {
    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      this.cartSync.set('error');
      this.cartSyncError.set('A valid customer ID is unavailable. Sign in again to continue.');
      return;
    }
    this.cartSync.set('loading');
    this.shoppingCart.getCart(customerId).subscribe({
      next: (items) => {
        this.cart.mergeFetchedItems(items);
        this.cartSync.set('idle');
      },
      error: (error: unknown) => {
        this.cartSyncError.set(
          error instanceof Error ? error.message : 'The shopping cart could not be loaded.',
        );
        this.cartSync.set('error');
      },
    });
  }

  protected retryLoad(): void {
    this.catalog.load();
  }

  protected retryMethods(): void {
    this.paymentMethods.load();
  }
}