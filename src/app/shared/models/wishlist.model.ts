import { Product } from './product.model';

// CHANGED (new): the wishlist APIs (POST wishlist/manage, GET wishlist/get). They replace WishlistRow / WishlistPage,
// which were saved-for-later cart rows (CART_ID).

/** The ACTION sent to POST wishlist/manage. */
export type WishlistAction = 'ADD' | 'REMOVE';

/**
 * One wishlist/get row. PRODUCT_ID and PRODUCT_VARIANT_ID together identify it: several variants of one product can
 * be saved, each as its own item.
 */
export interface WishlistItem {
  /** WISHLIST_ID, when the API sends it. */
  wishlistId?: string;
  productId: number;
  /** PRODUCT_VARIANT_ID (else MATCHED_VARIANT_ID): the saved variant. */
  variantId: number;
  /**
   * The product from the row's own fields, mapped like products/get: PRODUCT_NAME, PRODUCT_CODE_SKU, PRODUCT_IMAGE,
   * SELLING_PRICE (price), PRICE (struck MRP and "% OFF" when higher), STOCK_QUANTITY, SELLER_ID, IS_ACTIVE. Its
   * `variantId` is the saved variant.
   */
  product: Product;
}

/** One wishlist/get page. `total` is known only when the API reports it or the page is the last one. */
export interface WishlistPage {
  items: WishlistItem[];
  hasNext: boolean;
  total?: number;
}
