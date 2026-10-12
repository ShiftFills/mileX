import { Injectable, computed, inject, signal } from '@angular/core';
import { CartItem } from '@shared/models';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { ProductCatalogService } from './product-catalog.service';
import { StorageService } from './storage.service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storage = inject(StorageService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly _items = signal<CartItem[]>(this.readItems());

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().reduce((sum, item) => sum + item.quantity, 0));
  readonly subtotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  );
  readonly shippingCost = computed(() => (this.subtotal() > 999 || !this.count() ? 0 : 99));
  readonly total = computed(() => this.subtotal() + this.shippingCost());

  add(product: CartItem['product'], quantity = 1): void {
    if (!product.inStock || !Number.isInteger(quantity) || quantity < 1) return;
    const items = this._items();
    const existing = items.find((item) => item.product.id === product.id);
    this.save(
      existing
        ? items.map((item) =>
            item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item,
          )
        : [...items, { product, quantity }],
    );
  }

  setQuantity(productId: string, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.remove(productId);
      return;
    }
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

  private readItems(): CartItem[] {
    const stored = this.storage.get<unknown>(STORAGE_KEYS.cart);
    if (!Array.isArray(stored)) return [];

    return stored.flatMap((entry): CartItem[] => {
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

      const product = this.catalog.findById(id);
      return product ? [{ product, quantity }] : [];
    });
  }
}
