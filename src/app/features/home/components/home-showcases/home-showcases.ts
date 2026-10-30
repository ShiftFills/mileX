import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCard } from '@shared/components/product-card/product-card';
import { APP_ROUTES } from '@core/constants/app-routes';
import { productCategoryLabel } from '@core/constants/product-categories';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { Alert } from '@shared/components/alert/alert';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Product } from '@shared/models';
import { WishlistService } from '@core/services/wishlist.service';

@Component({
  selector: 'app-home-showcases',
  imports: [Alert, LoadingSpinner, ProductCard, RouterLink],
  templateUrl: './home-showcases.html',
  styleUrl: './home-showcases.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeShowcases {
  protected readonly routes = APP_ROUTES;
  protected readonly wishlist = inject(WishlistService);
  private readonly productService = inject(ProductCatalogService);
  protected readonly catalogStatus = this.productService.status;
  protected readonly catalogError = this.productService.error;

  protected readonly bestDeals = computed(() => this.productService.products().slice(0, 15));
  protected readonly recommended = computed(() =>
    [...this.productService.products()].sort((a, b) => a.price - b.price).slice(0, 10),
  );
  protected readonly shelves = computed(() => {
    const groups = new Map<string, Product[]>();
    for (const product of this.productService.products()) {
      const products = groups.get(product.category) ?? [];
      products.push(product);
      groups.set(product.category, products);
    }

    return [...groups].slice(0, 2).map(([category, products]) => ({
      title: productCategoryLabel(category),
      image: '/images/Section - HeroPromoBanner.svg',
      category,
      products: products.slice(0, 8),
    }));
  });

  constructor() {
    this.productService.load();
  }

  protected toggleWishlist(productId: string): void {
    this.wishlist.toggle(productId);
  }

  protected retryLoad(): void {
    this.productService.load();
  }
}
