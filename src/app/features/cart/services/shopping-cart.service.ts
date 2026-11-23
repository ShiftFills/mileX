import { Injectable, inject } from '@angular/core';
import {
  CartApiDetails, CartInsertPayload, CartItem, CartVariantDetails, Product, WishlistPage, WishlistRow,
} from '@shared/models';
import { Observable, map, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { AuthService } from '@core/services/auth.service';
// CHANGED (new): PRODUCT_IMAGE can be an S3 key ("products/<file>"), shown through the S3 image API.
import { isS3ImageKey } from '@core/services/s3-image.service';
const FALLBACK_IMAGE = '/images/latest-gadgets.svg';
/** API name used in shopping cart error messages. */
const SHOPPING_CART = 'shopping cart';
// CHANGED (new): API name used in the wishlist (move_to_cart/get) error messages.
const WISHLIST = 'wishlist';
/** CATEGORY_ID / PRODUCT_ID value that asks move_to_cart/get for every category and product. */
// CHANGED (new)
const ALL_IDS = -1;

/** Request body for DELETE shopping_cart/delete: every ID comes from the cart row itself. */
interface CartDeletePayload {
  CART_ID: number;
  PRODUCT_ID: number;
  SELLER_ID: number;
  CUSTOMER_ID: number;
  /** Always sent for a cart row; left out for a wishlist row that has no variant. */
  PRODUCT_VARIANT_ID?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) {
    return undefined;
  }
  return String(value).trim();
}

// CHANGED: `subject` names the API in the error (default: the shopping cart, as before).
function requiredId(value: unknown, label: string, subject = SHOPPING_CART): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`The ${subject} API returned an invalid ${label}.`);
  }
  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

// CHANGED: `subject` names the API in the error (default: the shopping cart, as before).
function amount(value: unknown, label: string, optional = false, subject = SHOPPING_CART): number {
  if (optional && (value === null || value === undefined || value === '')) return 0;
  const parsed = optionalNumber(value);
  if (parsed === undefined || parsed < 0) {
    throw new Error(`The ${subject} API returned an invalid ${label}.`);
  }
  return parsed;
}

function imageUrl(value: unknown): string {
  const path = text(value);
  if (!path) return FALLBACK_IMAGE;
  if (/^(?:https?:|blob:|data:)/i.test(path)) return path;
  return `/${path.replace(/^\/+/, '')}`;
}

function optionalVariant(record: Record<string, unknown>): CartVariantDetails | undefined {
  const id = text(record['VARIANT_ID']);
  const name = text(record['VARIANT_NAME']);
  const sku = text(record['VARIANT_SKU']);
  const barcode = text(record['BARCODE']);
  const color = text(record['COLOUR_NAME']);
  const size = text(record['SIZE_NAME']);
  const material = text(record['MATERIAL_NAME']);
  if (!id && !name && !sku && !barcode && !color && !size && !material) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(sku ? { sku } : {}),
    ...(barcode ? { barcode } : {}),
    ...(color ? { color } : {}),
    ...(size ? { size } : {}),
    ...(material ? { material } : {}),
  };
}

function isSuccessFlag(value: unknown): boolean {
  return value === true || value === 1 ||
    (typeof value === 'string' && ['TRUE', '1', 'SUCCESS'].includes(value.trim().toUpperCase()));
}

function mapCartItem(value: unknown): CartItem {
  if (!isRecord(value)) {
    throw new Error('The shopping cart API returned an invalid cart item.');
  }

  const cartId = text(value['CART_ID']);
  const productId = requiredId(value['PRODUCT_ID'], 'product ID');
  const sellerId = requiredId(value['SELLER_ID'], 'seller ID');
  const customerId = requiredId(value['CUSTOMER_ID'], 'customer ID');
  const quantity = requiredId(value['CART_QUANTITY'], 'cart quantity');
  const name = text(value['PRODUCT_NAME']);
  if (!cartId || !name) {
    throw new Error('The shopping cart API returned an item without a cart ID or product name.');
  }

  const unitPrice = amount(value['UNIT_PRICE'], 'unit price');
  const hasTotalAmount =
    value['TOTAL_AMOUNT'] !== undefined &&
    value['TOTAL_AMOUNT'] !== null &&
    value['TOTAL_AMOUNT'] !== '';
  const totalAmount = hasTotalAmount
    ? amount(value['TOTAL_AMOUNT'], 'total amount')
    : unitPrice * quantity;
  const mrp = amount(value['MRP'], 'MRP', true);
  const stock = optionalNumber(value['PRODUCT_STOCK_QUANTITY']);
  const maxOrderQuantity = optionalNumber(value['MAXIMUM_ORDER_QUANTITY']);
  const variant = optionalVariant(value);
  const productSku = text(value['PRODUCT_CODE_SKU']);
  const cartSku = text(value['SKU']);
  const variantText = [
    variant?.name,
    variant?.color,
    variant?.size ? `Size ${variant.size}` : undefined,
    variant?.material,
  ].filter(Boolean).join(' · ');
  const description = text(value['PRODUCT_DESCRIPTION']);
  // CHANGED (new): an S3 key is kept as imageKey (the page loads its signed URL) instead of being turned into
  // the broken relative URL "/products/<file>". Legacy paths ("uploads/products/...") keep their URL as before.
  const productImage = text(value['PRODUCT_IMAGE']);
  const imageKey = productImage && isS3ImageKey(productImage) ? productImage : undefined;
  const product: Product = {
    id: String(productId),
    name,
    description: description ?? 'Product description is not available.',
    price: unitPrice,
    currency: 'INR',
    // CHANGED: the stock image for an S3 key; screens that load S3 images use imageKey instead.
    imageUrl: imageKey ? FALLBACK_IMAGE : imageUrl(productImage),
    ...(imageKey ? { imageKey } : {}),
    category: 'uncategorized',
    inStock: stock === undefined || stock > 0,
    ...(productSku ? { sku: productSku } : cartSku ? { sku: cartSku } : {}),
    ...(mrp > 0 ? { originalPrice: mrp } : {}),
    ...(variantText ? { variantDetails: variantText } : {}),
    ...(stock !== undefined ? { stockLeft: stock } : {}),
    ...(maxOrderQuantity !== undefined && maxOrderQuantity > 0
      ? { maxOrderQuantity }
      : {}),
  };
  const apiDetails: CartApiDetails = {
    cartId,
    sellerId,
    customerId,
    ...(cartSku ? { cartSku } : {}),
    ...(productSku ? { productSku } : {}),
    originalQuantity: quantity,
    unitPrice,
    cartDiscount: amount(value['CART_DISCOUNT'], 'cart discount', true),
    productDiscount: amount(value['PRODUCT_DISCOUNT'], 'product discount', true),
    tax: amount(value['TAX'], 'tax', true),
    totalAmount,
    saveForLater: isSuccessFlag(value['SAVE_FOR_LATER']),
    ...(variant ? { variant } : {}),
  };

  return { product, quantity, apiDetails };
}

/**
 * Checks the `status` / `success` envelope of a list of cart rows (shopping_cart/get, move_to_cart/get) and returns
 * its `data` rows (none for `data: null`). `subject` names the API in the errors.
 */
// CHANGED: moved out of mapCartResponse so move_to_cart/get gets the same checks; the cart's messages are unchanged.
function responseRows(response: unknown, subject: string): unknown[] {
  if (!isRecord(response)) {
    throw new Error(`The ${subject} API returned an invalid response.`);
  }
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  const message = text(response['message'] ?? response['MESSAGE']);
  const successfulStatus =
    status === undefined ||
    status === true ||
    status === 1 ||
    status === 200 ||
    status === 201 ||
    (typeof status === 'string' &&
      ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(status.trim().toUpperCase()));
  if (status === undefined && success === undefined) {
    throw new Error(`The ${subject} API returned an invalid response.`);
  }
  if (
    !successfulStatus ||
    (success !== undefined && !isSuccessFlag(success))
  ) {
    throw new Error(message ?? `The ${subject} could not be loaded.`);
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null) return [];
  if (!Array.isArray(data)) {
    throw new Error(`The ${subject} API returned an invalid item list.`);
  }
  return data;
}

function mapCartResponse(response: unknown, requestedCustomerId: number): CartItem[] {
  const items = responseRows(response, SHOPPING_CART).map((item) => mapCartItem(item));
  // Verify rows match the customer ID used to request the cart.
  if (items.some((item) => item.apiDetails?.customerId !== requestedCustomerId)) {
    throw new Error('The shopping cart API returned an item for a different customer.');
  }
  return items;
}

/**
 * One move_to_cart/get row. CART_ID, PRODUCT_ID, SELLER_ID, CUSTOMER_ID and QUANTITY must be positive whole numbers
 * (Remove and Move to Cart send them back). PRODUCT_VARIANT_ID is optional: a product saved without a variant
 * (null, 0, …) is still shown, from the product itself.
 */
// CHANGED (new)
function mapWishlistRow(value: unknown): WishlistRow {
  if (!isRecord(value)) {
    throw new Error('The wishlist API returned an invalid item.');
  }
  const quantity = requiredId(value['QUANTITY'], 'quantity', WISHLIST);
  const unitPrice = amount(value['UNIT_PRICE'], 'unit price', false, WISHLIST);
  const hasTotalAmount =
    value['TOTAL_AMOUNT'] !== undefined && value['TOTAL_AMOUNT'] !== null && value['TOTAL_AMOUNT'] !== '';
  const sku = text(value['SKU']);
  const variantId = optionalNumber(value['PRODUCT_VARIANT_ID']);
  // CHANGED (new): PRODUCT_NAME when the API sends it (move_to_cart/get does not; the page then names the row by
  // its product from products/get).
  const productName = text(value['PRODUCT_NAME']);
  return {
    cartId: String(requiredId(value['CART_ID'], 'cart ID', WISHLIST)),
    productId: requiredId(value['PRODUCT_ID'], 'product ID', WISHLIST),
    ...(variantId !== undefined && Number.isSafeInteger(variantId) && variantId > 0 ? { variantId } : {}),
    sellerId: requiredId(value['SELLER_ID'], 'seller ID', WISHLIST),
    customerId: requiredId(value['CUSTOMER_ID'], 'customer ID', WISHLIST),
    ...(productName ? { productName } : {}),
    ...(sku ? { sku } : {}),
    quantity,
    unitPrice,
    discount: amount(value['DISCOUNT'], 'discount', true, WISHLIST),
    tax: amount(value['TAX'], 'tax', true, WISHLIST),
    totalAmount: hasTotalAmount ? amount(value['TOTAL_AMOUNT'], 'total amount', false, WISHLIST) : unitPrice * quantity,
  };
}

/**
 * One move_to_cart/get page. Rows another customer owns are rejected (as in the cart); a row that reports
 * SAVE_FOR_LATER = 0 is no longer saved and is left out. Without a reported total_records, the page is the
 * last one when it has fewer rows than LIMIT, which also gives the total.
 */
// CHANGED (new)
function mapWishlistResponse(response: unknown, customerId: number, limit: number, offset: number): WishlistPage {
  const data = responseRows(response, WISHLIST);
  const rows = data
    .filter((row) => !isRecord(row) || row['SAVE_FOR_LATER'] === undefined || isSuccessFlag(row['SAVE_FOR_LATER']))
    .map((row) => mapWishlistRow(row));
  if (rows.some((row) => row.customerId !== customerId)) {
    throw new Error('The wishlist API returned an item for a different customer.');
  }

  const reported = isRecord(response)
    ? optionalNumber(response['total_records'] ?? response['TOTAL_RECORDS'])
    : undefined;
  const total = reported !== undefined && Number.isSafeInteger(reported) && reported >= 0
    ? reported
    : data.length < limit
      ? offset + data.length
      : undefined;
  return {
    rows,
    hasNext: total !== undefined ? offset + data.length < total : data.length === limit,
    ...(total !== undefined ? { total } : {}),
  };
}

const CART_ACTION_FAILURE = /\b(?:failure|failed|error|could not|unable|invalid|not found)\b/i;

/**
 * The save-for-later and delete endpoints' bodies are not documented, so accept plain text or a
 * JSON envelope. A non-2xx HTTP status already errors in HttpClient; this only catches a 2xx
 * response that reports failure.
 */
function assertCartActionSucceeded(response: string, defaultError: string): void {
  const body = response.trim();
  if (!body) return;

  if (body.startsWith('{') || body.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined) {
      if (!isRecord(parsed)) return;
      const status = parsed['status'] ?? parsed['STATUS'];
      const success = parsed['success'] ?? parsed['SUCCESS'];
      const error = parsed['error'] ?? parsed['ERROR'];
      const message = text(parsed['message'] ?? parsed['MESSAGE'] ?? error);
      const failedStatus =
        status !== undefined &&
        status !== null &&
        status !== true &&
        status !== 1 &&
        status !== 200 &&
        status !== 201 &&
        !(
          typeof status === 'string' &&
          ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(status.trim().toUpperCase())
        );
      const failedFlag = success !== undefined && success !== null && !isSuccessFlag(success);
      const reportedError = error === true || (typeof error === 'string' && error.trim() !== '');
      if (failedStatus || failedFlag || reportedError) {
        throw new Error(message ?? defaultError);
      }
      return;
    }
  }

  if (CART_ACTION_FAILURE.test(body)) throw new Error(body);
}

@Injectable({ providedIn: 'root' })
export class ShoppingCartService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  getCart(customerId: number): Observable<CartItem[]> {
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new RangeError('Customer ID must be a positive safe integer.');
    }
    return this.api
      .get<unknown>(API_ENDPOINTS.shoppingCart.get, { CUSTOMER_ID: customerId })
      .pipe(map((response) => mapCartResponse(response, customerId)));
  }

  /**
   * Adds a product to the logged-in customer's cart (POST shopping_cart/insert).
   * CUSTOMER_ID is the customer ID (auth.customerId()) and CREATED_BY is the user ID
   * (auth.userId()); they are different values and are never substituted for each other.
   * The caller supplies the rest, including DISCOUNT, TAX and TOTAL_AMOUNT: no pricing rules
   * are applied here.
   */
  addItem(item: Omit<CartInsertPayload, 'CUSTOMER_ID' | 'CREATED_BY'>): Observable<void> {
    const customerId = this.auth.customerId();
    const createdBy = this.auth.userId();
    if (customerId === undefined || createdBy === undefined) {
      return throwError(() => new Error('Sign in as a customer to add items to your cart.'));
    }

    const payload: CartInsertPayload = {
      ...item,
      CUSTOMER_ID: customerId,
      CREATED_BY: createdBy,
    };

    const ids = [
      payload.PRODUCT_ID,
      payload.SELLER_ID,
      payload.PRODUCT_VARIANT_ID,
      payload.QUANTITY,
      payload.CUSTOMER_ID,
      payload.CREATED_BY,
    ];
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return throwError(
        () => new RangeError('Product, seller, variant, quantity, customer and user IDs must be positive whole numbers.'),
      );
    }

    const amounts = [payload.UNIT_PRICE, payload.DISCOUNT, payload.TAX, payload.TOTAL_AMOUNT];
    if (amounts.some((value) => !Number.isFinite(value) || value < 0)) {
      return throwError(() => new RangeError('Price, discount, tax and total amount must be valid numbers.'));
    }

    return this.api
      .postText(API_ENDPOINTS.shoppingCart.insert, payload)
      .pipe(map((response) => assertCartActionSucceeded(response, 'The item could not be added to the cart.')));
  }

  /**
   * One page of the signed-in customer's wishlist: their cart rows saved for later, from
   * GET move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=…&OFFSET=… (-1: every category and product).
   * The API takes no CUSTOMER_ID (the access token identifies the customer); rows for any other customer are
   * rejected, as in getCart.
   */
  // CHANGED (new)
  // CHANGED: move_to_cart/get (with CATEGORY_ID=-1 and PRODUCT_ID=-1) replaces wishlist/get; same rows.
  getWishlist(limit: number, offset: number): Observable<WishlistPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
      return throwError(() => new RangeError('LIMIT must be a positive and OFFSET a non-negative safe integer.'));
    }
    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      return throwError(() => new Error('Sign in as a customer to see your wishlist.'));
    }
    return this.api
      .get<unknown>(API_ENDPOINTS.moveToCart.get, {
        CATEGORY_ID: ALL_IDS,
        PRODUCT_ID: ALL_IDS,
        LIMIT: limit,
        OFFSET: offset,
      })
      .pipe(map((response) => mapWishlistResponse(response, customerId, limit, offset)));
  }

  /**
   * Saves to the wishlist: PUT wishlist/save_for_later with `{ CART_ID, VARIANT_ID }`. VARIANT_ID is the variant, or
   * null for a product without one. CART_ID is the cart row's, or null for a product that has no cart row (the
   * wishlist heart on a product that is not in the cart).
   */
  // CHANGED: also sends VARIANT_ID (it used to send `{ CART_ID }` only); CART_ID may be null.
  saveForLater(cartId: string | null, variantId: string | number | null | undefined): Observable<void> {
    const variant = variantId === null || variantId === undefined || String(variantId).trim() === '' ? null : Number(variantId);
    if (variant !== null && (!Number.isSafeInteger(variant) || variant <= 0)) {
      return throwError(() => new RangeError('Variant ID must be a positive safe integer.'));
    }
    if (cartId === null) {
      return this.api
        .putText(API_ENDPOINTS.wishlist.saveForLater, { CART_ID: null, VARIANT_ID: variant })
        .pipe(map((response) => assertCartActionSucceeded(response, 'The item could not be saved for later.')));
    }
    return this.putCartId(
      API_ENDPOINTS.wishlist.saveForLater,
      cartId,
      'The item could not be saved for later.',
      { VARIANT_ID: variant },
    );
  }

  /** Moves one saved-for-later row back to the cart (PUT move_to_cart/update with its CART_ID). */
  // CHANGED (new)
  moveToCart(cartId: string): Observable<void> {
    return this.putCartId(API_ENDPOINTS.moveToCart.update, cartId, 'The item could not be moved to your cart.');
  }

  /**
   * Deletes one cart row (DELETE shopping_cart/delete). All four IDs come from the row itself:
   * CART_ID, SELLER_ID and CUSTOMER_ID from the shopping_cart/get response, PRODUCT_ID from the product.
   */
  // CHANGED: the request is sent by deleteCartRow; payload, checks and messages are unchanged.
  removeItem(item: CartItem): Observable<void> {
    const details = item.apiDetails;
    if (!details) {
      return throwError(() => new Error('This item is not in the saved shopping cart, so it cannot be deleted through the API.'));
    }
    return this.deleteCartRow({
      CART_ID: Number(details.cartId),
      PRODUCT_ID: Number(item.product.id),
      SELLER_ID: details.sellerId,
      CUSTOMER_ID: details.customerId,
      PRODUCT_VARIANT_ID: Number(details.variant?.id),
    }, 'The item could not be removed from the cart.');
  }

  /**
   * Deletes one wishlist row: the same DELETE shopping_cart/delete as removeItem, with the row's own IDs.
   * PRODUCT_VARIANT_ID is sent when the row has a variant; a row without one sends the other four IDs only.
   */
  // CHANGED (new)
  removeSavedItem(row: WishlistRow): Observable<void> {
    return this.deleteCartRow({
      CART_ID: Number(row.cartId),
      PRODUCT_ID: row.productId,
      SELLER_ID: row.sellerId,
      CUSTOMER_ID: row.customerId,
      ...(row.variantId !== undefined ? { PRODUCT_VARIANT_ID: row.variantId } : {}),
    }, 'The item could not be removed from your wishlist.');
  }

  /** PUT `{ CART_ID, ...extra }` to a cart-row endpoint (wishlist/save_for_later, move_to_cart/update). */
  // CHANGED (new): shared by saveForLater and moveToCart.
  private putCartId(
    path: string,
    cartId: string,
    defaultError: string,
    extra: Record<string, number | null> = {},
  ): Observable<void> {
    const id = Number(cartId);
    if (!cartId.trim() || !Number.isSafeInteger(id) || id <= 0) {
      return throwError(() => new RangeError('Cart ID must be a positive safe integer.'));
    }
    return this.api
      .putText(path, { CART_ID: id, ...extra })
      .pipe(map((response) => assertCartActionSucceeded(response, defaultError)));
  }

  // CHANGED (new): shared by removeItem and removeSavedItem.
  private deleteCartRow(payload: CartDeletePayload, defaultError: string): Observable<void> {
    if (Object.values(payload).some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return throwError(() => new RangeError('Cart, product, seller and customer IDs must be positive safe integers.'));
    }
    return this.api
      .deleteText(API_ENDPOINTS.shoppingCart.delete, payload)
      .pipe(map((response) => assertCartActionSucceeded(response, defaultError)));
  }
}