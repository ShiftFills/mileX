import { Injectable, inject } from '@angular/core';
import { CartApiDetails, CartInsertPayload, CartItem, CartVariantDetails, Product } from '@shared/models';
import { Observable, map, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { AuthService } from '@core/services/auth.service';
const FALLBACK_IMAGE = '/images/latest-gadgets.svg';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) {
    return undefined;
  }
  return String(value).trim();
}

function requiredId(value: unknown, label: string): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`The shopping cart API returned an invalid ${label}.`);
  }
  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function amount(value: unknown, label: string, optional = false): number {
  if (optional && (value === null || value === undefined || value === '')) return 0;
  const parsed = optionalNumber(value);
  if (parsed === undefined || parsed < 0) {
    throw new Error(`The shopping cart API returned an invalid ${label}.`);
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
  const product: Product = {
    id: String(productId),
    name,
    description: description ?? 'Product description is not available.',
    price: unitPrice,
    currency: 'INR',
    imageUrl: imageUrl(value['PRODUCT_IMAGE']),
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

function mapCartResponse(response: unknown, requestedCustomerId: number): CartItem[] {
  if (!isRecord(response)) {
    throw new Error('The shopping cart API returned an invalid response.');
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
    throw new Error('The shopping cart API returned an invalid response.');
  }
  if (
    !successfulStatus ||
    (success !== undefined && !isSuccessFlag(success))
  ) {
    throw new Error(message ?? 'The shopping cart could not be loaded.');
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null) return [];
  if (!Array.isArray(data)) {
    throw new Error('The shopping cart API returned an invalid item list.');
  }

  const items = data.map((item) => mapCartItem(item));
  // Verify rows match the customer ID used to request the cart.
  if (items.some((item) => item.apiDetails?.customerId !== requestedCustomerId)) {
    throw new Error('The shopping cart API returned an item for a different customer.');
  }
  return items;
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

  /** Marks one cart row as "saved for later" (PUT wishlist/save_for_later with its CART_ID). */
  saveForLater(cartId: string): Observable<void> {
    const id = Number(cartId);
    if (!cartId.trim() || !Number.isSafeInteger(id) || id <= 0) {
      return throwError(() => new RangeError('Cart ID must be a positive safe integer.'));
    }
    return this.api
      .putText(API_ENDPOINTS.wishlist.saveForLater, { CART_ID: id })
      .pipe(map((response) => assertCartActionSucceeded(response, 'The item could not be saved for later.')));
  }

  /**
   * Deletes one cart row (DELETE shopping_cart/delete). All four IDs come from the row itself:
   * CART_ID, SELLER_ID and CUSTOMER_ID from the shopping_cart/get response, PRODUCT_ID from the product.
   */
  removeItem(item: CartItem): Observable<void> {
    const details = item.apiDetails;
    if (!details) {
      return throwError(() => new Error('This item is not in the saved shopping cart, so it cannot be deleted through the API.'));
    }
        const payload = {
      CART_ID: Number(details.cartId),
      PRODUCT_ID: Number(item.product.id),
      SELLER_ID: details.sellerId,
      CUSTOMER_ID: details.customerId,
      PRODUCT_VARIANT_ID: Number(details.variant?.id),
    };
    if (Object.values(payload).some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return throwError(() => new RangeError('Cart, product, seller and customer IDs must be positive safe integers.'));
    }
    return this.api
      .deleteText(API_ENDPOINTS.shoppingCart.delete, payload)
      .pipe(map((response) => assertCartActionSucceeded(response, 'The item could not be removed from the cart.')));
  }
}