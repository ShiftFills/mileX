import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Product } from '@shared/models';
import { Button } from '../button/button';
import { Card } from '../card/card';

@Component({
  selector: 'app-product-card',
  imports: [Button, Card, CurrencyPipe, NgTemplateOutlet, RouterLink],
  templateUrl: './product-card.html',
  styleUrl: './product-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCard {
  protected readonly routes = APP_ROUTES;
  readonly product = input.required<Product>();
  readonly wishlisted = input(false);
  /** Shows the wishlist heart (default); false hides it, e.g. on the Home page. */
  // CHANGED (new): opt-out, so every screen that does not set it keeps its heart.
  readonly showWishlist = input(true);
  readonly showAddToCart = input(false);
  /** `wishlist`: framed photo, rating above price, full-width Add to Cart (wishlist page design). */
  readonly variant = input<'default' | 'wishlist'>('default');
  readonly wishlistToggle = output<string>();
  readonly addToCart = output<string>();
  /**
   * Image to show instead of `product().imageUrl`: a URL, or null for the "no image" placeholder (e.g. while an
   * S3 URL loads, or when the product has no usable image). Left unset, the card shows `product().imageUrl`.
   */
  // CHANGED (new): opt-in, so screens that do not set it are unchanged.
  readonly imageSrc = input<string | null | undefined>(undefined);
  /** Shows the placeholder as loading (with `imageSrc` null). */
  readonly imageLoading = input(false);
  /** The image (its URL) could not be displayed. */
  readonly imageError = output<string>();
  // CHANGED (new): opt-in inputs for the wishlist's saved items; their defaults leave every other screen unchanged.
  /** Extra lines under the name (e.g. brand, variant and quantity). */
  readonly details = input<readonly string[]>([]);
  /** Text of the Add to Cart button (e.g. "Move to Cart"). */
  readonly addToCartLabel = input('Add to Cart');
  /** The card's request in flight: that button shows a spinner and both buttons are disabled. */
  readonly pendingAction = input<'wishlist' | 'add' | null>(null);
  /** Disables both buttons without a spinner (e.g. while another card's request is in flight). */
  readonly actionsDisabled = input(false);
  /** The product can no longer be bought (e.g. delisted): image and price greyed out, no link to its page. */
  readonly unavailable = input(false);

  protected readonly buttonsDisabled = computed(() => this.actionsDisabled() || this.pendingAction() !== null);

  protected readonly image = computed(() => {
    const src = this.imageSrc();
    return src === undefined ? this.product().imageUrl : src;
  });

  protected onAddToCart(): void {
    this.addToCart.emit(this.product().id);
  }

  protected toggleWishlist(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.wishlistToggle.emit(this.product().id);
  }
}
