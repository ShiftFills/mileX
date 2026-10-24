import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CartService } from '@core/services/cart.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { ProductCard } from '@shared/components/product-card/product-card';
import { Product } from '@shared/models';
import { ProductGallery } from '../../components/product-gallery/product-gallery';
import { ProductInfoTabs } from '../../components/product-info-tabs/product-info-tabs';
import { ProductService } from '../../services/product.service';
import { WishlistService } from '../../services/wishlist.service';

const PINCODE_PATTERN = /^[1-9]\d{5}$/;
const RELATED_COUNT = 4;

@Component({
  selector: 'app-product-detail',
  imports: [Alert, Badge, Button, Card, CurrencyPipe, Dialog, Input, ProductCard, ProductGallery, ProductInfoTabs, RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetail {
  protected readonly routes = APP_ROUTES;
  protected readonly id = input.required<string>();
  protected readonly quantity = signal(1);
  protected readonly addedToCart = signal(false);
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
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);

  protected readonly product = computed(() => this.productService.findById(this.id()));
  protected readonly images = computed(() => {
    const item = this.product();
    return item ? (item.images?.length ? item.images : [item.imageUrl]) : [];
  });
  protected readonly colorName = computed(() => this.selectedColor() ?? this.product()?.colors?.[0]?.name ?? '');
  protected readonly maxQuantity = computed(() => this.product()?.stockLeft ?? 10);
  protected readonly discountPercent = computed(() => {
    const item = this.product();
    return item?.originalPrice && item.originalPrice > item.price
      ? Math.round((1 - item.price / item.originalPrice) * 100)
      : 0;
  });
  protected readonly related = computed<Product[]>(() => {
    const current = this.product();
    if (!current) return [];
    const others = this.productService.products.filter((item) => item.id !== current.id);
    const sameCategory = others.filter((item) => item.category === current.category);
    const rest = others.filter((item) => item.category !== current.category);
    return [...sameCategory, ...rest].slice(0, RELATED_COUNT);
  });

  constructor() {
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

  protected addToCart(): boolean {
    const item = this.product();
    if (!item) return false;
    if (item.sizes?.length && !this.selectedSize()) {
      this.selectionError.set('Please select a size.');
      return false;
    }
    this.cart.add(item, this.quantity());
    this.addedToCart.set(true);
    return true;
  }

  protected buyNow(): void {
    if (this.addToCart()) void this.router.navigateByUrl(this.routes.checkout);
  }

  protected addRelatedToCart(id: string): void {
    const item = this.productService.findById(id);
    if (item) this.cart.add(item, 1);
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
