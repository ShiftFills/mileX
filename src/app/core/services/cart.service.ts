import { Injectable, computed, inject, signal } from '@angular/core';
import { FREE_SHIPPING_THRESHOLD } from '@core/constants/checkout';
import { CartItem } from '@shared/models';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { ProductCatalogService } from './product-catalog.service';
import { StorageService } from './storage.service';
import { take } from 'rxjs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storage = inject(StorageService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly _items = signal<CartItem[]>([]);

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().reduce((sum, item) => sum + item.quantity, 0));
  readonly hasUnavailableItems = computed(() =>
    this._items().some((item) => !item.product.inStock),
  );
  readonly subtotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  );
  readonly shippingCost = computed(() =>
    this.subtotal() > FREE_SHIPPING_THRESHOLD || !this.count() ? 0 : 50,
  );
  readonly total = computed(() => this.subtotal() + this.shippingCost());

  constructor() {
    this.catalog.productsLoaded$.pipe(take(1)).subscribe((catalogProducts) => {
      const products = new Map(catalogProducts.map((product) => [product.id, product]));
      const items = this.readStoredItems().flatMap(({ id, quantity }) => {
        const product = products.get(id);
        return product ? [{ product, quantity: Math.min(quantity, this.maxQuantity(product)) }] : [];
      });
      this._items.set(items);
      this.storage.set(STORAGE_KEYS.cart, items);
    });
    this.catalog.load();
  }

  add(product: CartItem['product'], quantity = 1): void {
    if (!product.inStock || !Number.isInteger(quantity) || quantity < 1) return;
    const items = this._items();
    const existing = items.find((item) => item.product.id === product.id);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > this.maxQuantity(product)) return;
    this.save(
      existing
        ? items.map((item) =>
            item.product.id === product.id ? { ...item, quantity: nextQuantity } : item,
          )
        : [...items, { product, quantity: nextQuantity }],
    );
  }

  setQuantity(productId: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.remove(productId);
      return;
    }
    const product = this._items().find((item) => item.product.id === productId)?.product;
    if (!product || quantity > this.maxQuantity(product)) return;
    this.save(
      this._items().map((item) =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    );
  }

  remove(productId: string): void {
    this.save(this._items().filter((item) => item.product.id !== productId));
  }

  clear(): void {
    this.save([]);
  }

  private save(items: CartItem[]): void {
    this._items.set(items);
    this.storage.set(STORAGE_KEYS.cart, items);
  }

  private maxQuantity(product: CartItem['product']): number {
    return Math.max(
      1,
      Math.min(
        product.stockLeft ?? Number.MAX_SAFE_INTEGER,
        product.maxOrderQuantity ?? Number.MAX_SAFE_INTEGER,
      ),
    );
  }

  private readStoredItems(): { id: string; quantity: number }[] {
    const stored = this.storage.get<unknown>(STORAGE_KEYS.cart);
    if (!Array.isArray(stored)) return [];

    return stored.flatMap((entry): { id: string; quantity: number }[] => {
      if (!isRecord(entry) || !isRecord(entry['product'])) return [];

      const id = entry['product']['id'];
      const quantity = entry['quantity'];
      if (
        typeof id !== 'string' ||
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        return [];
      }

      return [{ id, quantity }];
    });
  }
}
