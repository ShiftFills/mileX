import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Product } from '@shared/models';
import { Button } from '../button/button';
import { Card } from '../card/card';

@Component({
  selector: 'app-product-card',
  imports: [Button, Card, CurrencyPipe, RouterLink],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCard {
  protected readonly routes = APP_ROUTES;
  readonly product = input.required<Product>();
  readonly wishlisted = input(false);
  readonly showAddToCart = input(false);
  /** `wishlist`: framed photo, rating above price, full-width Add to Cart (wishlist page design). */
  readonly variant = input<'default' | 'wishlist'>('default');
  readonly wishlistToggle = output<string>();
  readonly addToCart = output<string>();

  protected onAddToCart(): void {
    this.addToCart.emit(this.product().id);
  }

  protected toggleWishlist(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.wishlistToggle.emit(this.product().id);
  }
}
