import { Injectable, computed, inject, signal } from '@angular/core';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { ProductCatalogService } from './product-catalog.service';
import { StorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly storage = inject(StorageService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly productIds = signal(this.readProductIds());

  readonly products = computed(() =>
    this.catalog.products.filter((product) => this.productIds().includes(product.id)),
  );

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

    const availableIds = new Set(this.catalog.products.map((product) => product.id));
    return [
      ...new Set(
        stored.filter((id): id is string => typeof id === 'string' && availableIds.has(id)),
      ),
    ];
  }
}
