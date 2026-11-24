import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { ShoppingCartService } from '@features/cart/services/shopping-cart.service';
import { CartItem, Product, WishlistRow } from '@shared/models';
import { Observable, finalize, map, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { CartService } from './cart.service';
import { ProductCatalogService } from './product-catalog.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';

/** The variant a cart row is for (its VARIANT_ID), or null. */
function rowVariantId(item: CartItem): string | null {
  return item.apiDetails?.variant?.id ?? null;
}

/**
 * The VARIANT_ID a heart sends for a product that is not in the cart, when no variant was chosen (Home, Products
 * listing, related products, an offer's products; Product View without a variant list): the Product View's default,
 * i.e. the first of its VARIANTS in stock, else the first one (so its only variant when it has one); else the
 * VARIANT_ID of the product's own products/get row (the variant Add to Cart sends); null for a product without one.
 */
// CHANGED (new)
// CHANGED: falls back to the product row's VARIANT_ID (it sent null when products/get had no VARIANTS list).
function defaultVariantId(product: Product): string | null {
  const options = product.variantOptions ?? [];
  const option = options.find((candidate) => candidate.inStock) ?? options[0];
  if (option) return option.id;
  const rowVariant = product.variantId;
  return rowVariant !== undefined && Number.isSafeInteger(rowVariant) && rowVariant > 0 ? String(rowVariant) : null;
}

/** A cart row as the shopping_cart/delete call of a wishlist row needs it (its own IDs). */
// CHANGED (new)
function asWishlistRow(item: CartItem): WishlistRow | null {
  const details = item.apiDetails;
  if (!details) return null;
  const variantId = Number(rowVariantId(item));
  return {
    cartId: details.cartId,
    productId: Number(item.product.id),
    ...(Number.isSafeInteger(variantId) && variantId > 0 ? { variantId } : {}),
    sellerId: details.sellerId,
    customerId: details.customerId,
    quantity: item.quantity,
    unitPrice: details.unitPrice,
    discount: details.cartDiscount,
    tax: details.tax,
    totalAmount: details.totalAmount,
  };
}

/**
 * The wishlist hearts.
 * - The hearts (`toggleProduct`) always use the server wishlist: a customer's cart rows saved for later
 *   (shopping_cart/get rows with SAVE_FOR_LATER = 1, kept in CartService). A heart saves with PUT
 *   wishlist/save_for_later `{ CART_ID, VARIANT_ID }`: the CART_ID of the product's row in the customer's cart (null
 *   for a product that has none) and the variant. The heart never calls shopping_cart/insert. A signed-out visitor is
 *   sent to Login first.
 * - Product IDs saved on this device earlier (`products`, `toggle`) are still shown, and can be removed, on the
 *   Wishlist screen; a signed-out visitor's hearts still show them filled.
 */
// CHANGED: the hearts use the server wishlist (they used to save on this device only, for everyone).
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly storage = inject(StorageService);
  private readonly catalog = inject(ProductCatalogService);
  // CHANGED (new)
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);
  private readonly shoppingCart = inject(ShoppingCartService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly productIds = signal(this.readProductIds());
  /** Products whose heart request is in flight (one at a time per product). */
  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  /** The customer whose cart rows were read for the hearts (once per signed-in customer). */
  private syncedCustomerId: number | null = null;

  /** True for a signed-in customer: the hearts use the server wishlist. */
  // CHANGED (new)
  private readonly isCustomer = computed(
    () => this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER',
  );

  /** Products saved on this device (the Wishlist screen's "Saved on this device" list, and guests). */
  readonly products = computed(() => {
    const savedIds = new Set(this.productIds());
    return this.catalog.products().filter((product) => savedIds.has(product.id));
  });

  /** A filled heart: saved on the server (customer, any variant of the product) or on this device (guest). */
  // CHANGED: a customer's hearts follow their saved-for-later cart rows.
  has(productId: string): boolean {
    if (!this.isCustomer()) return this.productIds().includes(productId);
    return this.cart.savedItems().some((item) => item.product.id === productId);
  }

  /** True while the heart request for this product is in flight. */
  // CHANGED (new)
  isPending(productId: string): boolean {
    return this.pendingIds().has(productId);
  }

  /** The device wishlist (guests): adds or removes a product ID on this device. */
  toggle(productId: string): void {
    const ids = this.productIds();
    const next = ids.includes(productId)
      ? ids.filter((id) => id !== productId)
      : [...ids, productId];
    this.productIds.set(next);
    this.storage.set(STORAGE_KEYS.wishlist, next);
  }

  /**
   * Reads the signed-in customer's cart rows once (shopping_cart/get), so the hearts show what is saved after a
   * page reload. Screens with hearts call it; later changes (cart, wishlist, hearts) keep CartService up to date.
   */
  // CHANGED (new)
  sync(): void {
    const customerId = this.auth.customerId();
    if (!this.isCustomer() || customerId === undefined || this.syncedCustomerId === customerId) return;
    this.syncedCustomerId = customerId;
    this.shoppingCart.getCart(customerId).subscribe({
      next: (items) => this.cart.mergeFetchedItems(items),
      // Read again on the next screen with hearts.
      error: () => (this.syncedCustomerId = null),
    });
  }

  /**
   * A heart was tapped; it always goes through the API, as Add to Cart does. Signed out: Login, then back to this
   * page. Signed in but not as a customer: an error. Customers:
   * - Filled heart: removes the product's saved row (DELETE shopping_cart/delete, the Wishlist screen's Remove).
   * - Empty heart: PUT wishlist/save_for_later `{ CART_ID, VARIANT_ID }`, nothing else (no shopping_cart/insert):
   *   - CART_ID: the product's row in the customer's cart (shopping_cart/get) for that variant, else its row without
   *     a variant; null when the product is not in the cart.
   *   - VARIANT_ID: `variantId` (the screen's selected variant), else the cart row's, else the product's default.
   * It changes only after the API succeeded; a toast reports the result.
   */
  // CHANGED (new)
  // CHANGED: only PUT wishlist/save_for_later (the shopping_cart/insert before it is removed); VARIANT_ID is always the
  // selected variant.
  toggleProduct(product: Product, variantId?: string | null): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate([APP_ROUTES.login], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (!this.isCustomer()) {
      this.toast.showError('Only customer accounts can save items to the wishlist.');
      return;
    }
    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      this.toast.showError('Sign in again to use your wishlist.');
      return;
    }
    if (this.isPending(product.id)) return;

    const saved = this.rowFor(this.cart.savedItems(), product.id, variantId);
    const inCart = saved ? undefined : this.rowFor(this.cart.items(), product.id, variantId);
    const request = saved
      ? this.removeSaved(product, saved)
      : inCart
        ? this.save(product, inCart, variantId)
        : this.saveWithoutCartRow(product, variantId ?? defaultVariantId(product), customerId);
    this.setPending(product.id, true);
    request.pipe(finalize(() => this.setPending(product.id, false))).subscribe({
      next: (message) => this.toast.showSuccess(message),
      error: (error: unknown) => this.toast.showError(this.catalog.getErrorMessage(error)),
    });
  }

  /**
   * The product's row among these cart rows (API rows only, they have a CART_ID): the one for `variantId` when it is
   * given, else its row without a variant (null: only that one); without `variantId`, the first row of the product.
   * A row of another variant is never used.
   */
  // CHANGED: falls back to the product's row without a variant (its CART_ID is sent with the selected VARIANT_ID).
  private rowFor(items: readonly CartItem[], productId: string, variantId: string | null | undefined): CartItem | undefined {
    const rows = items.filter((item) => item.apiDetails && item.product.id === productId);
    if (variantId === undefined) return rows[0];
    return rows.find((item) => rowVariantId(item) === variantId) ?? rows.find((item) => rowVariantId(item) === null);
  }

  /**
   * Saves the product's cart row: PUT wishlist/save_for_later with its CART_ID and VARIANT_ID (`variantId`, the
   * screen's selected variant, else the row's own; null without a variant). The row moves from the cart to the
   * wishlist, as Save for later does on the Cart page.
   */
  // CHANGED: optional `variantId` (the selected variant).
  private save(product: Product, row: CartItem, variantId?: string | null): Observable<string> {
    const cartId = row.apiDetails?.cartId ?? '';
    return this.shoppingCart.saveForLater(cartId, variantId ?? rowVariantId(row)).pipe(
      map(() => {
        this.cart.moveToSavedForLater(cartId);
        return `${product.name} was saved to your wishlist.`;
      }),
    );
  }

  /**
   * A product with no row in the customer's cart: PUT wishlist/save_for_later with CART_ID null (there is none to
   * send; none is invented and no cart row is created) and its VARIANT_ID. The cart is then read again
   * (shopping_cart/get), and the heart fills only when the backend now has the product saved; a backend that refuses
   * the request reports its own message.
   */
  // CHANGED: restored; it replaces the shopping_cart/insert + save flow (no insert from the heart).
  private saveWithoutCartRow(product: Product, variantId: string | null, customerId: number): Observable<string> {
    return this.shoppingCart.saveForLater(null, variantId).pipe(
      switchMap(() => this.shoppingCart.getCart(customerId)),
      map((items) => {
        this.cart.mergeFetchedItems(items);
        if (!this.has(product.id)) {
          throw new Error(`${product.name} was not saved: it is not in your cart, so there is no CART_ID to save.`);
        }
        return `${product.name} was saved to your wishlist.`;
      }),
    );
  }

  /** Removes a saved row (DELETE shopping_cart/delete with its own IDs). */
  private removeSaved(product: Product, saved: CartItem): Observable<string> {
    const row = asWishlistRow(saved);
    if (!row) return throwError(() => new Error(`${product.name} could not be removed from your wishlist.`));
    return this.shoppingCart.removeSavedItem(row).pipe(
      map(() => {
        this.cart.dropSavedItem(row.cartId);
        return `${product.name} was removed from your wishlist.`;
      }),
    );
  }

  private setPending(productId: string, pending: boolean): void {
    this.pendingIds.update((ids) => {
      const next = new Set(ids);
      if (pending) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  private readProductIds(): string[] {
    const stored = this.storage.get<unknown>(STORAGE_KEYS.wishlist);
    if (!Array.isArray(stored)) return [];

    return [...new Set(stored.filter((id): id is string => typeof id === 'string'))];
  }
}
