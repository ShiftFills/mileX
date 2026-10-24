import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CHECKOUT_STEPS, FREE_SHIPPING_THRESHOLD } from '@core/constants/checkout';
import { CartService } from '@core/services/cart.service';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper } from '@shared/components/stepper/stepper';
import { Product } from '@shared/models';

export type PaymentMethodId = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cod';

interface PaymentMethodOption {
  id: PaymentMethodId;
  title: string;
  description: string;
}

/** Methods in display order; the logos shown on the right of each row live in the template. */
const PAYMENT_METHODS: readonly PaymentMethodOption[] = [
  { id: 'upi', title: 'UPI', description: 'Pay using Google Pay, PhonePe, Paytm & more' },
  { id: 'card', title: 'Credit / Debit Card', description: 'Visa, Mastercard, RuPay & more' },
  { id: 'netbanking', title: 'Net Banking', description: 'Pay using your bank account' },
  { id: 'wallet', title: 'Wallet', description: 'Pay using Paytm, PhonePe, Amazon Pay & more' },
  { id: 'cod', title: 'Cash on Delivery (COD)', description: 'Pay at the time of delivery' },
];

/** Checkout step 3: choose how to pay and review the order summary. */
@Component({
  selector: 'app-payment',
  imports: [Button, Card, CurrencyPipe, PageHeading, RouterLink, Stepper],
  templateUrl: './payment.html',
  styleUrl: './payment.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentPage {
  protected readonly cart = inject(CartService);

  protected readonly routes = APP_ROUTES;
  protected readonly steps = CHECKOUT_STEPS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly freeShippingThreshold = FREE_SHIPPING_THRESHOLD;

  protected readonly selectedMethod = signal<PaymentMethodId>('upi');
  protected readonly placed = signal(false);

  // ---- Order summary (same maths as the delivery address step) ----
  protected readonly listTotal = computed(() =>
    this.cart.items().reduce((sum, { product, quantity }) => sum + (product.originalPrice ?? product.price) * quantity, 0),
  );
  protected readonly productDiscount = computed(() => this.listTotal() - this.cart.subtotal());
  protected readonly orderTotal = this.cart.subtotal;
  protected readonly qualifiesForFreeShipping = computed(() => this.orderTotal() > FREE_SHIPPING_THRESHOLD);
  /** Cash on delivery has nothing to pay online, so the button says what it actually does. */
  protected readonly isCod = computed(() => this.selectedMethod() === 'cod');

  constructor() {
    // Demo cart matching the design: a single item for first-time visitors.
    this.cart.seedDemoItems(['women-printed-maxi-dress-1']);
  }

  protected selectMethod(id: PaymentMethodId): void {
    this.selectedMethod.set(id);
  }

  protected variantOf(product: Product): { color?: string; size?: string } {
    return { color: product.colors?.[0]?.name, size: product.sizes?.[0] && `Size ${product.sizes[0]}` };
  }

  /** Demo checkout: like the existing `/checkout` page, nothing is sent to a server. */
  protected pay(): void {
    if (!this.cart.items().length) return;
    this.placed.set(true);
    this.cart.clear();
  }
}
