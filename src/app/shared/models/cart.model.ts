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

// CHANGED: WishlistRow and WishlistPage (move_to_cart/get rows) are replaced by wishlist.model.ts (wishlist/get).

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