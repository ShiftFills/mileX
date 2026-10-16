import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CartService } from '@core/services/cart.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Breadcrumb } from '@shared/components/breadcrumb/breadcrumb';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Input } from '@shared/components/input/input';
import { WishlistService } from '../../services/wishlist.service';
import { ProductService } from '../../services/product.service';

@Component({
  selector: 'app-product-detail',
  imports: [Alert, Badge, Breadcrumb, Button, Card, CurrencyPipe, Input, RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetail {
  protected readonly routes = APP_ROUTES;
  protected readonly id = input.required<string>();
  protected readonly quantity = signal(1);
  protected readonly addedToCart = signal(false);
  protected readonly wishlist = inject(WishlistService);
  protected readonly cart = inject(CartService);
  private readonly productService = inject(ProductService);
  protected readonly product = computed(() => this.productService.findById(this.id()));

  protected addToCart(): void {
    const product = this.product();
    if (product) {
      this.cart.add(product, this.quantity());
      this.addedToCart.set(true);
    }
  }

  protected updateQuantity(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      const value = Number(input.value);
      if (Number.isInteger(value) && value > 0) {
        this.quantity.set(value);
      } else {
        input.value = String(this.quantity());
      }
    }
  }

  protected toggleWishlist(): void {
    const product = this.product();
    if (product) this.wishlist.toggle(product.id);
  }
}
