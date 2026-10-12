import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProductCard } from '@shared/components/product-card/product-card';
import { PageHeader } from '@shared';
import { SearchBox } from '@shared/components/search-box/search-box';
import { Select } from '@shared/components/select/select';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductService } from '../../services/product.service';
import { WishlistService } from '../../services/wishlist.service';

@Component({
  selector: 'app-product-list',
  imports: [PageHeader, ProductCard, RouterLink, SearchBox, Select],
  templateUrl: './product-list.html',
  styleUrl: './product-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  protected readonly wishlist = inject(WishlistService);
  protected readonly routes = APP_ROUTES;
  protected readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly sortBy = signal('featured');
  protected readonly products = computed(() => {
    const query = this.query();
    const search = (query.get('q') ?? '').trim().toLowerCase();
    const category = query.get('category');
    const results = this.productService.products.filter((product) => {
      const matchesSearch =
        !search || `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(search);
      return matchesSearch && (!category || product.category === category);
    });

    return [...results].sort((a, b) => {
      if (this.sortBy() === 'price-low') return a.price - b.price;
      if (this.sortBy() === 'price-high') return b.price - a.price;
      if (this.sortBy() === 'name') return a.name.localeCompare(b.name);
      return 0;
    });
  });

  protected search(searchTerm: string): void {
    void this.router.navigate([this.routes.products], {
      queryParams: { ...this.currentQuery(), q: searchTerm || null },
    });
  }

  protected setCategory(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) {
      void this.router.navigate([this.routes.products], {
        queryParams: { ...this.currentQuery(), category: select.value || null },
      });
    }
  }

  protected toggleWishlist(productId: string): void {
    this.wishlist.toggle(productId);
  }

  protected updateSort(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) this.sortBy.set(select.value);
  }

  private currentQuery(): Record<string, string> {
    const values: Record<string, string> = {};
    for (const key of this.query().keys) {
      const value = this.query().get(key);
      if (value) values[key] = value;
    }
    return values;
  }
}
