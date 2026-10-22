import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductCard } from '@shared/components/product-card/product-card';
import { PageHeader } from '@shared';
import { WishlistService } from '../../services/wishlist.service';

@Component({
  selector: 'app-wishlist',
  imports: [PageHeader, ProductCard, RouterLink],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wishlist {
  protected readonly wishlist = inject(WishlistService);
  protected readonly routes = APP_ROUTES;

  protected remove(productId: string): void {
    this.wishlist.toggle(productId);
  }
}
