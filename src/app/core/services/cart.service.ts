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
  private readonly _savedItems = signal<CartItem[]>([]);
  /** Saved cart rows (ID and quantity) from storage, restored once a page loads the catalog. */
  // CHANGED: a field (was a constructor local) so `count` can include rows that are not restored yet.
  private readonly storedItems = this.readStoredItems();
  private fetchedItems: CartItem[] | null = null;
  // CHANGED: a signal (was a boolean) so `badgeCount` updates when the saved rows are restored.
  private readonly localItemsLoaded = signal(false);

  /** Active cart rows only. Rows saved for later live in `savedItems` and never reach totals. */
  readonly items = this._items.asReadonly();
  /** Cart rows the backend reports as SAVE_FOR_LATER = 1, plus rows saved during this session. */
  readonly savedItems = this._savedItems.asReadonly();
  readonly count = computed(() => this._items().reduce((sum, item) => sum + item.quantity, 0));
  /**
   * The header cart badge: `count`, plus (until a page loads the catalog and restores the saved rows)
   * the saved rows not already in the cart, counted from storage the same way the restore merges them.
   */
  // CHANGED (new): the catalog is no longer loaded on every page just to restore the cart for this badge.
  readonly badgeCount = computed(() => {
    if (this.localItemsLoaded()) return this.count();
    const cartProductIds = new Set(this._items().map((item) => item.product.id));
    return this.storedItems.reduce(
      (sum, { id, quantity }) => (cartProductIds.has(id) ? sum : sum + quantity),
      this.count(),
    );
  });
  readonly hasUnavailableItems = computed(() =>
    this._items().some((item) => !item.product.inStock),
  );
  readonly subtotal = computed(() =>
    this._items().reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  );
  readonly shippingCost = computed(() => this.shippingFor(this.subtotal(), this.count()));
  readonly total = computed(() => this.subtotal() + this.shippingCost());

  /**
   * Restores the saved rows with the latest product values as soon as the catalog is loaded.
   * The catalog is loaded by the pages that show cart or catalog products (cart, checkout, payment,
   * delivery address, wishlist, product detail), not here.
   */
  // CHANGED: removed `this.catalog.load()`. CartService is created by the storefront header, so it sent the
  // unfiltered products/get on every page, including the Home page, which has its own products request.
  constructor() {
    this.catalog.productsLoaded$.pipe(take(1)).subscribe((catalogProducts) => {
      const products = new Map(catalogProducts.map((product) => [product.id, product]));
      const localItems = this.storedItems.flatMap(({ id, quantity }) => {
        const product = products.get(id);
        return product ? [{ product, quantity: Math.min(quantity, this.maxQuantity(product)) }] : [];
      });
      this.localItemsLoaded.set(true);
      this.save(
        this.fetchedItems ? this.mergeFetchedAndLocalItems(this.fetchedItems, localItems) : localItems,
      );
    });
  }

  /**
   * The shipping rule: free above FREE_SHIPPING_THRESHOLD or when there is nothing to ship,
   * otherwise 50. `shippingCost` uses it for the whole cart; a single-item order uses it for that item.
   */
  shippingFor(subtotal: number, itemCount: number): number {
    return subtotal > FREE_SHIPPING_THRESHOLD || !itemCount ? 0 : 50;
  }

  /**
   * The active rows a checkout is for: the whole cart when `cartId` is null, otherwise only the row
   * with that CART_ID (Buy Now / single product). Empty when that row is not in the cart.
   */
  checkoutItems(cartId: string | null): CartItem[] {
    const items = this._items();
    return cartId === null ? items : items.filter((item) => item.apiDetails?.cartId === cartId);
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

  setQuantity(productId: string, quantity: number, cartId?: string): void {
    if (!Number.isInteger(quantity) || quantity < 1) {
      this.remove(productId, cartId);
      return;
    }
    const matches = (item: CartItem): boolean =>
      cartId !== undefined ? item.apiDetails?.cartId === cartId : item.product.id === productId;
    const product = this._items().find(matches)?.product;
    if (!product || quantity > this.maxQuantity(product)) return;
    this.save(
      this._items().map((item) => matches(item) ? { ...item, quantity } : item),
    );
  }

  remove(productId: string, cartId?: string): void {
    this.save(
      this._items().filter((item) =>
        cartId !== undefined ? item.apiDetails?.cartId !== cartId : item.product.id !== productId,
      ),
    );
  }

  mergeFetchedItems(items: CartItem[]): void {
    const activeItems = items.filter((item) => !item.apiDetails?.saveForLater);
    this._savedItems.set(this.uniqueByCartId(items.filter((item) => item.apiDetails?.saveForLater)));
    this.fetchedItems = activeItems;
    const localItems = this._items().filter((item) => !item.apiDetails);
    if (!this.localItemsLoaded()) {
      this._items.set(activeItems);
      return;
    }
    this.save(this.mergeFetchedAndLocalItems(activeItems, localItems));
  }

  /**
   * Call after the save-for-later API succeeds: moves the API cart row out of the active list
   * (which updates count, subtotal and total) and into the saved list without duplicating it.
   */
  moveToSavedForLater(cartId: string): void {
    const item = this._items().find((entry) => entry.apiDetails?.cartId === cartId);
    if (!item?.apiDetails) return;
    const savedItem: CartItem = { ...item, apiDetails: { ...item.apiDetails, saveForLater: true } };
    this._savedItems.update((saved) =>
      saved.some((entry) => entry.apiDetails?.cartId === cartId) ? saved : [...saved, savedItem],
    );
    this.save(this._items().filter((entry) => entry.apiDetails?.cartId !== cartId));
  }

  clear(): void {
    this.save([]);
  }

  private save(items: CartItem[]): void {
    this._items.set(items);
    this.storage.set(STORAGE_KEYS.cart, items);
    if (this.fetchedItems !== null) {
      this.fetchedItems = items.filter((item) => item.apiDetails !== undefined);
    }
  }

  private mergeFetchedAndLocalItems(
    fetchedItems: CartItem[],
    localItems: CartItem[],
  ): CartItem[] {
    const fetchedProductIds = new Set(fetchedItems.map((item) => item.product.id));
    return [
      ...fetchedItems,
      ...localItems.filter((item) => !fetchedProductIds.has(item.product.id)),
    ];
  }

  private uniqueByCartId(items: CartItem[]): CartItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      const cartId = item.apiDetails?.cartId;
      if (cartId === undefined) return true;
      if (seen.has(cartId)) return false;
      seen.add(cartId);
      return true;
    });
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