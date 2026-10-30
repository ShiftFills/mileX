import { Injectable, computed, inject, signal } from '@angular/core';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { ProductCatalogService } from './product-catalog.service';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly storage = inject(StorageService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly productIds = signal(this.readProductIds());

  readonly products = computed(() => {
    const savedIds = new Set(this.productIds());
    return this.catalog.products().filter((product) => savedIds.has(product.id));
  });

  has(productId: string): boolean {
    return this.productIds().includes(productId);
  }

  toggle(productId: string): void {
    const ids = this.productIds();
    const next = ids.includes(productId)
      ? ids.filter((id) => id !== productId)
      : [...ids, productId];
    this.productIds.set(next);
    this.storage.set(STORAGE_KEYS.wishlist, next);
  }

  private readProductIds(): string[] {
    const stored = this.storage.get<unknown>(STORAGE_KEYS.wishlist);
    if (!Array.isArray(stored)) return [];

    return [...new Set(stored.filter((id): id is string => typeof id === 'string'))];
  }
}
