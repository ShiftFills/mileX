import { Product } from './product.model';

export interface CartVariantDetails {
  id?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  color?: string;
  size?: string;
  material?: string;
}

export interface CartApiDetails {
  cartId: string;
  sellerId: number;
  customerId: number;
  cartSku?: string;
  productSku?: string;
  originalQuantity: number;
  unitPrice: number;
  cartDiscount: number;
  productDiscount: number;
  tax: number;
  totalAmount: number;
  saveForLater: boolean;
  variant?: CartVariantDetails;
}

export interface CartItem {
  product: Product;
  quantity: number;
  apiDetails?: CartApiDetails;
}

/**
 * One move_to_cart/get row: a cart row saved for later (SAVE_FOR_LATER = 1). It carries IDs and amounts only;
 * the product's name, image and variant come from the product APIs (PRODUCT_ID, PRODUCT_VARIANT_ID).
 */
// CHANGED (new)
export interface WishlistRow {
  cartId: string;
  productId: number;
  /** PRODUCT_VARIANT_ID; absent when the row has no variant (null, 0 or not a positive whole number). */
  variantId?: number;
  sellerId: number;
  customerId: number;
  // CHANGED (new): PRODUCT_NAME, when the API sends it. move_to_cart/get does not: the name comes from products/get.
  productName?: string;
  sku?: string;
  quantity: number;
  /** UNIT_PRICE: the unit price the item was added at (already the product's selling price). */
  unitPrice: number;
  /** DISCOUNT: a fixed amount (not a percentage) off the whole row, i.e. off UNIT_PRICE × QUANTITY. */
  discount: number;
  tax: number;
  /** TOTAL_AMOUNT = UNIT_PRICE × QUANTITY − DISCOUNT + TAX. */
  totalAmount: number;
}

/** One move_to_cart/get page. `total` is known only when the API reports it or the page is the last one. */
// CHANGED (new)
export interface WishlistPage {
  rows: WishlistRow[];
  hasNext: boolean;
  total?: number;
}

/**
 * Request body for POST shopping_cart/insert.
 * Field names match the backend exactly (note QUANTITY here, while shopping_cart/get
 * returns the same value as CART_QUANTITY).
 */
export interface CartInsertPayload {
  PRODUCT_ID: number;
  SELLER_ID: number;
  PRODUCT_VARIANT_ID: number;
  QUANTITY: number;
  UNIT_PRICE: number;
  DISCOUNT: number;
  TAX: number;
  TOTAL_AMOUNT: number;
  CUSTOMER_ID: number;
  CREATED_BY: number;
}