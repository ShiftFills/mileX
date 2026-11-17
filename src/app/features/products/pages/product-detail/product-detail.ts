import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ToastService } from '@core/services/toast.service';
import { ShoppingCartService } from '@features/cart/services/shopping-cart.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { ProductCard } from '@shared/components/product-card/product-card';
import { Product } from '@shared/models';
import { finalize } from 'rxjs';
import { ProductGallery } from '../../components/product-gallery/product-gallery';
import { ProductInfoTabs } from '../../components/product-info-tabs/product-info-tabs';
import { ProductService } from '../../services/product.service';
import { WishlistService } from '../../services/wishlist.service';

const PINCODE_PATTERN = /^[1-9]\d{5}$/;
const RELATED_COUNT = 4;

/** DISCOUNT, TAX and TOTAL_AMOUNT sent to shopping_cart/insert. */
interface CartAmounts {
  discount: number;
  tax: number;
  total: number;
}

@Component({
  selector: 'app-product-detail',
  imports: [Alert, Badge, Button, Card, CurrencyPipe, Dialog, Input, LoadingSpinner, ProductCard, ProductGallery, ProductInfoTabs, RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetail {
  protected readonly routes = APP_ROUTES;
  protected readonly id = input.required<string>();
  protected readonly quantity = signal(1);
  protected readonly addedToCart = signal(false);
  /** True while the shopping_cart/insert request is in flight; blocks duplicate clicks. */
  protected readonly adding = signal(false);
  protected readonly selectedColor = signal<string | null>(null);
  protected readonly selectedSize = signal<string | null>(null);
  protected readonly pincode = signal('');
  protected readonly deliveryMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly sizeGuideOpen = signal(false);
  protected readonly selectionError = signal('');
  protected readonly sizeChart = [
    { size: 'S', bust: '34', waist: '28' },
    { size: 'M', bust: '36', waist: '30' },
    { size: 'L', bust: '38', waist: '32' },
    { size: 'XL', bust: '40', waist: '34' },
    { size: 'XXL', bust: '42', waist: '36' },
  ];

  protected readonly wishlist = inject(WishlistService);
  protected readonly cart = inject(CartService);
  private readonly shoppingCart = inject(ShoppingCartService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  protected readonly catalogStatus = this.productService.status;
  protected readonly catalogError = this.productService.error;

  protected readonly product = computed(() => this.productService.findById(this.id()));
  protected readonly images = computed(() => {
    const item = this.product();
    return item ? (item.images?.length ? item.images : [item.imageUrl]) : [];
  });
  protected readonly colorName = computed(() => this.selectedColor() ?? this.product()?.colors?.[0]?.name ?? '');
  protected readonly maxQuantity = computed(() => {
    const item = this.product();
    return Math.max(1, Math.min(item?.stockLeft ?? 10, item?.maxOrderQuantity ?? 10));
  });
  protected readonly discountPercent = computed(() => {
    const item = this.product();
    return item?.originalPrice && item.originalPrice > item.price
      ? Math.round((1 - item.price / item.originalPrice) * 100)
      : 0;
  });
  protected readonly related = computed<Product[]>(() => {
    const current = this.product();
    if (!current) return [];
    const others = this.productService.products().filter((item) => item.id !== current.id);
    const sameCategory = others.filter((item) => item.category === current.category);
    const rest = others.filter((item) => item.category !== current.category);
    return [...sameCategory, ...rest].slice(0, RELATED_COUNT);
  });

  constructor() {
    this.productService.load();
    // The same component instance is reused when navigating between products (e.g. "You may also like").
    effect(() => {
      this.id();
      untracked(() => this.resetSelection());
    });
  }

  protected selectColor(name: string): void {
    this.selectedColor.set(name);
  }

  protected selectSize(size: string): void {
    this.selectedSize.set(size);
    this.selectionError.set('');
  }

  protected changeQuantity(step: number): void {
    this.quantity.update((value) => Math.min(this.maxQuantity(), Math.max(1, value + step)));
  }

  protected updateQuantity(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const value = Number(input.value);
    if (Number.isInteger(value) && value >= 1 && value <= this.maxQuantity()) {
      this.quantity.set(value);
    } else {
      input.value = String(this.quantity());
    }
  }

  protected addToCart(): void {
    const item = this.product();
    if (!item || !this.hasValidSelection(item)) return;
    this.submitToCart(item, this.quantity(), () => this.addedToCart.set(true));
  }

  protected buyNow(): void {
    const item = this.product();
    if (!item || !this.hasValidSelection(item)) return;
    // Go to checkout only after the cart API has accepted the item.
    this.submitToCart(item, this.quantity(), () => {
      void this.router.navigateByUrl(this.routes.checkout);
    });
  }

  protected addRelatedToCart(id: string): void {
    const item = this.productService.findById(id);
    if (item) this.submitToCart(item, 1);
  }

  protected retryLoad(): void {
    this.productService.load();
  }

  protected toggleWishlist(id = this.product()?.id): void {
    if (id) this.wishlist.toggle(id);
  }

  protected updatePincode(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.pincode.set(input.value.replace(/\D/g, '').slice(0, 6));
      this.deliveryMessage.set(null);
    }
  }

  protected checkDelivery(): void {
    this.deliveryMessage.set(
      PINCODE_PATTERN.test(this.pincode())
        ? { ok: true, text: `Delivery available to ${this.pincode()} in 3 - 5 days.` }
        : { ok: false, text: 'Enter a valid 6-digit pincode.' },
    );
  }

  private hasValidSelection(item: Product): boolean {
    if (item.sizes?.length && !this.selectedSize()) {
      this.selectionError.set('Please select a size.');
      return false;
    }
    return true;
  }

  /**
   * Sends the product to the customer's cart through POST shopping_cart/insert,
   * then refreshes the cart from shopping_cart/get. `onAdded` runs after a successful insert.
   */
  private submitToCart(item: Product, quantity: number, onAdded?: () => void): void {
    if (this.adding()) return;

    if (!this.auth.isAuthenticated()) {
      void this.router.navigate([this.routes.login], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (this.auth.customerId() === undefined) {
      this.toast.showError('Only customer accounts can add items to the cart.');
      return;
    }
    if (item.sellerId === undefined) {
      this.toast.showError('This product cannot be added to the cart right now. Seller details are missing.');
      return;
    }
    if (item.variantId === undefined) {
      this.toast.showError('This product cannot be added to the cart right now. Variant details are missing.');
      return;
    }

    const amounts = this.cartAmounts(item, quantity);
    this.adding.set(true);
    this.shoppingCart
      .addItem({
        PRODUCT_ID: Number(item.id),
        SELLER_ID: item.sellerId,
        PRODUCT_VARIANT_ID: item.variantId,
        QUANTITY: quantity,
        UNIT_PRICE: item.price,
        DISCOUNT: amounts.discount,
        TAX: amounts.tax,
        TOTAL_AMOUNT: amounts.total,
      })
      .pipe(
        finalize(() => this.adding.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess(`${item.name} added to your cart.`);
          this.refreshCart();
          onAdded?.();
        },
        error: (error: unknown) => this.toast.showError(this.errorMessage(error)),
      });
  }

  /**
   * TEMPORARY PLACEHOLDER: the discount, tax and total rules are NOT confirmed yet.
   * This is the only place that decides DISCOUNT, TAX and TOTAL_AMOUNT. It currently sends
   * 0 discount, 0 tax and unit price x quantity. Do not use these values for real orders
   * until the confirmed calculation replaces this method.
   */
  private cartAmounts(item: Product, quantity: number): CartAmounts {
    return { discount: 0, tax: 0, total: item.price * quantity };
  }

  /** Re-reads the customer's cart so the header count and the cart page show the new row. */
  private refreshCart(): void {
    const customerId = this.auth.customerId();
    if (customerId === undefined) return;
    this.shoppingCart
      .getCart(customerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.cart.mergeFetchedItems(items),
        // The item was already added; a failed refresh is picked up when the cart page opens.
        error: () => undefined,
      });
  }

  private errorMessage(error: unknown): string {
    const fallback = 'The item could not be added to the cart. Please try again.';
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'string' && body.trim()) {
        try {
          const parsed: unknown = JSON.parse(body);
          if (typeof parsed === 'object' && parsed !== null) {
            const record = parsed as Record<string, unknown>;
            const message = record['message'] ?? record['MESSAGE'];
            if (typeof message === 'string' && message.trim()) return message.trim();
          }
        } catch {
          return body.trim();
        }
      }
      return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }

  private resetSelection(): void {
    this.quantity.set(1);
    this.addedToCart.set(false);
    this.selectedColor.set(null);
    this.selectedSize.set(null);
    this.pincode.set('');
    this.deliveryMessage.set(null);
    this.selectionError.set('');
  }
}