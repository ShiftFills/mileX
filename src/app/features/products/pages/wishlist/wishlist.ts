import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { PRODUCT_CATEGORY_LABELS } from '@core/constants/product-categories';
import { CartService } from '@core/services/cart.service';
import { Card } from '@shared/components/card/card';
import { Filter, FilterOption } from '@shared/components/filter/filter';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { ProductCard } from '@shared/components/product-card/product-card';
import { Product } from '@shared/models';
import { WishlistService } from '../../services/wishlist.service';

const ALL = 'all';
const WISHLIST_CATEGORY_ORDER = ['fashion', 'electronics', 'home-living', 'beauty'] as const;
/** Items pre-saved for first-time visitors so the page matches the design. */
const DEMO_WISHLIST_IDS = [
  'women-floral-maxi-dress-1',
  'women-floral-maxi-dress-2',
  'women-floral-maxi-dress-3',
  'women-floral-maxi-dress-4',
  'women-floral-maxi-dress-5',
  'white-sneakers-1',
  'smart-watch-2',
  'laptop-2',
  'headphones-2',
  'home-decor-planter-set-1',
  'skincare-combo-1',
  'leather-handbag-1',
];

@Component({
  selector: 'app-wishlist',
  imports: [Card, Filter, PageHeading, ProductCard, RouterLink],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Wishlist {
  protected readonly wishlist = inject(WishlistService);
  private readonly cart = inject(CartService);
  protected readonly routes = APP_ROUTES;

  private readonly selectedCategory = signal(ALL);
  protected readonly notice = signal('');

  protected readonly filterOptions = computed<FilterOption[]>(() => {
    const products = this.wishlist.products();
    const counts = new Map<string, number>();
    for (const { category } of products) counts.set(category, (counts.get(category) ?? 0) + 1);
    return [
      { value: ALL, label: 'All', count: products.length },
      ...WISHLIST_CATEGORY_ORDER.map((category) => ({
        value: category,
        label: PRODUCT_CATEGORY_LABELS[category] ?? category,
        count: counts.get(category) ?? 0,
      })),
    ];
  });

  /** Falls back to "All" when the last item of the selected category is removed. */
  protected readonly activeCategory = computed(() => {
    const selected = this.selectedCategory();
    return this.filterOptions().some((option) => option.value === selected && option.count) ? selected : ALL;
  });

  /** Filtered products displayed in the responsive product grid. */
  protected readonly products = computed<Product[]>(() => {
    const category = this.activeCategory();
    const products = this.wishlist
      .products()
      .filter((product) => category === ALL || product.category === category);
    return products;
  });

  constructor() {
    this.wishlist.seedDemoItems(DEMO_WISHLIST_IDS);
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected remove(productId: string): void {
    this.wishlist.toggle(productId);
  }

  protected addToCart(product: Product): void {
    this.cart.add(product);
    this.notice.set(`${product.name} added to your cart`);
  }
}
