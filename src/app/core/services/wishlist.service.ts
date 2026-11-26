import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { APP_ROUTES } from '@core/constants/app-routes';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { Product, WishlistAction, WishlistItem, WishlistPage } from '@shared/models';
import { EMPTY, Observable, expand, finalize, map, tap, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ProductCatalogService, mapProduct } from './product-catalog.service';
import { StorageService } from './storage.service';
import { ToastService } from './toast.service';

// CHANGED: rewritten for the wishlist APIs (POST wishlist/manage, GET wishlist/get). The hearts used to save cart rows
// for later (PUT wishlist/save_for_later, DELETE shopping_cart/delete) and read them from shopping_cart/get.

/** Rows per wishlist/get request when the hearts read the customer's whole wishlist (sync). */
const SYNC_PAGE_SIZE = 100;
/** At most this many wishlist/get pages per sync, should the API ignore OFFSET and keep sending full pages. */
const MAX_SYNC_PAGES = 20;
const NO_KEYS: ReadonlySet<string> = new Set();

/** The products a heart can be for: the product card's fields that name its default variant. */
type HeartProduct = Pick<Product, 'id' | 'variantId' | 'variantOptions'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) return undefined;
  return String(value).trim();
}

/** A positive whole number (number or numeric text), else undefined. */
function positiveId(value: unknown): number | undefined {
  const raw = text(value);
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const raw = text(value);
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The key of one wishlist item: its PRODUCT_ID and PRODUCT_VARIANT_ID (a product alone is not an item). */
function itemKey(productId: string | number, variantId: string | number): string {
  return `${Number(productId)}:${Number(variantId)}`;
}

/**
 * The VARIANT_ID a heart sends for a product card when no variant was chosen (Products listing, search, related
 * products, an offer's products; Product View before its variants load): the Product View's default, i.e. the first of
 * its VARIANTS in stock, else the first one; else the VARIANT_ID of the product's own products/get row (the variant
 * Add to Cart sends); null for a product without one.
 */
function defaultVariantId(product: HeartProduct): string | null {
  const options = product.variantOptions ?? [];
  const option = options.find((candidate) => candidate.inStock) ?? options[0];
  if (option) return option.id;
  const rowVariant = product.variantId;
  return rowVariant !== undefined && Number.isSafeInteger(rowVariant) && rowVariant > 0 ? String(rowVariant) : null;
}

/** True for a `status` / `success` value that reports success (true, 1, 200, "SUCCESS", …). */
function isSuccessful(value: unknown): boolean {
  return value === true || value === 1 || value === 200 || value === 201 ||
    (typeof value === 'string' && ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(value.trim().toUpperCase()));
}

/** Checks a wishlist response's `status` / `success` envelope; throws its message (or `fallback`) on failure. */
function assertSuccessfulEnvelope(response: unknown, fallback: string): Record<string, unknown> {
  if (!isRecord(response)) throw new Error('The wishlist API returned an invalid response.');
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  if (status === undefined && success === undefined) throw new Error('The wishlist API returned an invalid response.');
  if ((status !== undefined && !isSuccessful(status)) || (success !== undefined && !isSuccessful(success))) {
    throw new Error(text(response['message'] ?? response['MESSAGE']) ?? fallback);
  }
  return response;
}

/**
 * One wishlist/get row. PRODUCT_ID and PRODUCT_VARIANT_ID (else MATCHED_VARIANT_ID) must be positive whole numbers:
 * they identify the item, and Remove sends them back. The product is mapped from the row's own fields, like a
 * products/get record. A row of another customer is rejected.
 */
function mapWishlistItem(value: unknown, customerId: number): WishlistItem {
  if (!isRecord(value)) throw new Error('The wishlist API returned an invalid item.');
  const productId = positiveId(value['PRODUCT_ID']);
  const variantId = positiveId(value['PRODUCT_VARIANT_ID']) ?? positiveId(value['MATCHED_VARIANT_ID']);
  if (productId === undefined || variantId === undefined) {
    throw new Error('The wishlist API returned an item without a valid product or variant ID.');
  }
  const rowCustomerId = positiveId(value['CUSTOMER_ID']);
  if (rowCustomerId !== undefined && rowCustomerId !== customerId) {
    throw new Error('The wishlist API returned an item for a different customer.');
  }
  const product = mapProduct(value);
  if (!product) throw new Error('The wishlist API returned an item without a product name or price.');
  const wishlistId = text(value['WISHLIST_ID']);
  return {
    ...(wishlistId ? { wishlistId } : {}),
    productId,
    variantId,
    product: { ...product, variantId },
  };
}

/**
 * One wishlist/get page (`data: null` is an empty one). Without a reported total_records, the page is the last one
 * when it has fewer rows than LIMIT, which also gives the total.
 */
function mapWishlistPage(response: unknown, customerId: number, limit: number, offset: number): WishlistPage {
  const envelope = assertSuccessfulEnvelope(response, 'The wishlist could not be loaded.');
  const data = envelope['data'] ?? envelope['DATA'];
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    throw new Error('The wishlist API returned an invalid item list.');
  }
  const rows: unknown[] = Array.isArray(data) ? data : [];
  const items = rows.map((row) => mapWishlistItem(row, customerId));
  const reported = optionalNumber(envelope['total_records'] ?? envelope['TOTAL_RECORDS']);
  const total = reported !== undefined && Number.isSafeInteger(reported) && reported >= 0
    ? reported
    : rows.length < limit
      ? offset + rows.length
      : undefined;
  return {
    items,
    hasNext: total !== undefined ? offset + rows.length < total : rows.length === limit,
    ...(total !== undefined ? { total } : {}),
  };
}

/**
 * Checks a POST wishlist/manage response (`{ status: true, message, data: { CUSTOMER_ID, PRODUCT_ID,
 * PRODUCT_VARIANT_ID } }`): it must report success, for the product and variant that were sent.
 */
function assertManaged(response: unknown, productId: number, variantId: number, action: WishlistAction): void {
  const envelope = assertSuccessfulEnvelope(
    response,
    action === 'ADD' ? 'The item could not be added to your wishlist.' : 'The item could not be removed from your wishlist.',
  );
  const data = envelope['data'] ?? envelope['DATA'];
  if (!isRecord(data)) return;
  const returnedProduct = positiveId(data['PRODUCT_ID']);
  const returnedVariant = positiveId(data['PRODUCT_VARIANT_ID']);
  if (
    (returnedProduct !== undefined && returnedProduct !== productId) ||
    (returnedVariant !== undefined && returnedVariant !== variantId)
  ) {
    throw new Error('The wishlist API returned a different product.');
  }
}

/**
 * The wishlist, shared by every screen with a heart (Products listing and search, Product View, related products,
 * an offer's products, the Wishlist screen and the cart's Save for later):
 * - Signed-in customers: the server wishlist. An item is a PRODUCT_ID with its PRODUCT_VARIANT_ID. POST
 *   wishlist/manage adds or removes one (ACTION "ADD" / "REMOVE"); GET wishlist/get lists them a page at a time.
 *   Which items are saved is kept here (`has`), from wishlist/get and from every successful add or remove, so all
 *   hearts stay in step without asking the API again.
 * - Signed-out visitors: a heart sends them to Login. Product IDs saved on this device earlier (`products`, `toggle`)
 *   are still shown, and can be removed, on the Wishlist screen; a visitor's hearts show them filled.
 */
@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly api = inject(ApiService);
  private readonly storage = inject(StorageService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly productIds = signal(this.readProductIds());
  /** The saved items (PRODUCT_ID:PRODUCT_VARIANT_ID keys) and the customer they belong to. */
  private readonly saved = signal<{ customerId: number; keys: ReadonlySet<string> } | null>(null);
  /** Products whose heart request is in flight (one at a time per product). */
  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  /** The customer whose whole wishlist was read for the hearts (once per signed-in customer). */
  private syncedCustomerId: number | null = null;

  /** True for a signed-in customer: the hearts use the server wishlist. */
  private readonly isCustomer = computed(
    () => this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER',
  );

  /** The signed-in customer's saved items; none for anyone else (another customer's are never shown). */
  private readonly savedKeys = computed(() => {
    const saved = this.saved();
    return saved && this.isCustomer() && saved.customerId === this.auth.customerId() ? saved.keys : NO_KEYS;
  });

  /** Products saved on this device (the Wishlist screen's "Saved on this device" list, and guests). */
  readonly products = computed(() => {
    const savedIds = new Set(this.productIds());
    return this.catalog.products().filter((product) => savedIds.has(product.id));
  });

  /**
   * A filled heart. Customers: the product's variant the heart is for (`variantId`, else the product's default
   * variant) is in their wishlist; another saved variant of the product does not fill it. Guests: the product is
   * saved on this device.
   */
  has(product: HeartProduct, variantId?: string | number | null): boolean {
    if (!this.isCustomer()) return this.productIds().includes(product.id);
    const variant = this.heartVariant(product, variantId);
    return variant !== null && this.savedKeys().has(itemKey(product.id, variant));
  }

  /** True when this product ID is saved on this device (the device wishlist). */
  hasOnDevice(productId: string): boolean {
    return this.productIds().includes(productId);
  }

  /** True while the heart request for this product is in flight. */
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
   * Reads the signed-in customer's whole wishlist once (GET wishlist/get, SYNC_PAGE_SIZE rows a page), so the hearts
   * show what is saved after a page reload. Screens with hearts call it; later adds and removes keep it up to date.
   */
  sync(): void {
    const customerId = this.auth.customerId();
    if (!this.isCustomer() || customerId === undefined || this.syncedCustomerId === customerId) return;
    this.syncedCustomerId = customerId;
    this.loadPage(SYNC_PAGE_SIZE, 0)
      .pipe(
        expand((page, index) =>
          page.hasNext && index + 1 < MAX_SYNC_PAGES
            ? this.loadPage(SYNC_PAGE_SIZE, (index + 1) * SYNC_PAGE_SIZE)
            : EMPTY,
        ),
      )
      // Each page fills its hearts (loadPage); a failed read is tried again on the next screen with hearts.
      .subscribe({ error: () => (this.syncedCustomerId = null) });
  }

  /**
   * One page of the signed-in customer's wishlist: GET wishlist/get?LIMIT=…&OFFSET=… (the access token identifies the
   * customer). Its items fill their hearts.
   */
  loadPage(limit: number, offset: number): Observable<WishlistPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
      return throwError(() => new RangeError('LIMIT must be a positive and OFFSET a non-negative safe integer.'));
    }
    const customerId = this.auth.customerId();
    if (!this.isCustomer() || customerId === undefined) {
      return throwError(() => new Error('Sign in as a customer to see your wishlist.'));
    }
    return this.api
      .get<unknown>(API_ENDPOINTS.wishlist.get, { LIMIT: limit, OFFSET: offset })
      .pipe(
        map((response) => mapWishlistPage(response, customerId, limit, offset)),
        tap((page) => this.updateKeys(customerId, (keys) => {
          for (const item of page.items) keys.add(itemKey(item.productId, item.variantId));
        })),
      );
  }

  /**
   * Adds or removes one product variant: POST wishlist/manage `{ PRODUCT_ID, PRODUCT_VARIANT_ID, ACTION }`. Only a
   * response that reports success (for that product and variant) changes the saved state, and with it every heart
   * for that variant. Used by the hearts, the Wishlist screen and the cart's Save for later.
   */
  manage(productId: string | number, variantId: string | number, action: WishlistAction): Observable<void> {
    const product = positiveId(productId);
    const variant = positiveId(variantId);
    if (product === undefined || variant === undefined) {
      return throwError(() => new RangeError('Product and variant IDs must be positive whole numbers.'));
    }
    const customerId = this.auth.customerId();
    if (!this.isCustomer() || customerId === undefined) {
      return throwError(() => new Error('Sign in as a customer to use your wishlist.'));
    }
    return this.api
      .post<unknown>(API_ENDPOINTS.wishlist.manage, { PRODUCT_ID: product, PRODUCT_VARIANT_ID: variant, ACTION: action })
      .pipe(
        map((response) => assertManaged(response, product, variant, action)),
        tap(() => this.updateKeys(customerId, (keys) => {
          if (action === 'ADD') keys.add(itemKey(product, variant));
          else keys.delete(itemKey(product, variant));
        })),
      );
  }

  /**
   * A heart was tapped. Signed out: Login, then back to this page. Signed in but not as a customer: an error.
   * Customers: POST wishlist/manage for the product's variant the heart is for (`variantId`, the screen's selected
   * variant, else the product's default; without either, the product's saved variant): ACTION "REMOVE" for a filled
   * heart, "ADD" for an empty one. One request at a time per product; the heart changes only after the API succeeded,
   * and a toast reports the result.
   */
  toggleProduct(product: Product, variantId?: string | null): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate([APP_ROUTES.login], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (!this.isCustomer()) {
      this.toast.showError('Only customer accounts can save items to the wishlist.');
      return;
    }
    if (this.auth.customerId() === undefined) {
      this.toast.showError('Sign in again to use your wishlist.');
      return;
    }
    if (this.isPending(product.id)) return;

    const variant = this.heartVariant(product, variantId);
    if (variant === null) {
      this.toast.showError(`${product.name} cannot be saved to your wishlist right now. Variant details are missing.`);
      return;
    }
    const action: WishlistAction = this.savedKeys().has(itemKey(product.id, variant)) ? 'REMOVE' : 'ADD';
    this.setPending(product.id, true);
    this.manage(product.id, variant, action)
      .pipe(finalize(() => this.setPending(product.id, false)))
      .subscribe({
        next: () =>
          this.toast.showSuccess(
            action === 'ADD'
              ? `${product.name} was added to your wishlist.`
              : `${product.name} was removed from your wishlist.`,
          ),
        error: (error: unknown) => this.toast.showError(this.catalog.getErrorMessage(error)),
      });
  }

  /**
   * The variant a heart is for: `variantId`, else the product's default variant; without either, the product's saved
   * variant (so its filled heart can still remove it); null when there is none.
   */
  private heartVariant(product: HeartProduct, variantId: string | number | null | undefined): string | null {
    const chosen = positiveId(variantId);
    if (chosen !== undefined) return String(chosen);
    const fallback = defaultVariantId(product);
    if (fallback !== null) return fallback;
    const prefix = `${Number(product.id)}:`;
    const saved = [...this.savedKeys()].find((key) => key.startsWith(prefix));
    return saved ? saved.slice(prefix.length) : null;
  }

  /** Changes this customer's saved items (another customer's are dropped first). */
  private updateKeys(customerId: number, change: (keys: Set<string>) => void): void {
    this.saved.update((saved) => {
      const keys = new Set(saved?.customerId === customerId ? saved.keys : []);
      change(keys);
      return { customerId, keys };
    });
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
