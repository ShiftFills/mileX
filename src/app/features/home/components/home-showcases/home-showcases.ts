import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCard } from '@shared/components/product-card/product-card';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { WishlistService } from '@core/services/wishlist.service';

@Component({
  selector: 'app-home-showcases',
  imports: [ProductCard, RouterLink],
  templateUrl: './home-showcases.html',
  styleUrl: './home-showcases.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeShowcases {
  protected readonly routes = APP_ROUTES;
  protected readonly wishlist = inject(WishlistService);
  private readonly productService = inject(ProductCatalogService);

  protected readonly bestDeals = this.productService.products.slice(0, 15);
  protected readonly recommended = this.productService.products.slice(5, 15);
  protected readonly shelves = [
    {
      title: 'Home and outdoor',
      image: '/images/home-outdoor.svg',
      category: 'home-living',
      itemName: 'Soft chairs',
      price: 2000,
      productImage: '/images/soft-chair.svg',
    },
    {
      title: 'Consumer electronics and gadgets',
      image: '/images/consumer-electronics.svg',
      category: 'electronics',
      itemName: 'Smart watches',
      price: 1000,
      productImage: '/images/smart-watch.svg',
    },
  ];

  protected toggleWishlist(productId: string): void {
    this.wishlist.toggle(productId);
  }
}
