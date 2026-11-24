/** Customer-facing state of an offer, from its START_DATE and END_DATE (an INACTIVE offer is not listed). */
export type OfferStatus = 'Active' | 'Upcoming' | 'Expired';

/** A product or category an offer applies to: PRODUCT_ID / PRODUCT_NAME or CATEGORY_ID / CATEGORY_NAME. */
// CHANGED (new): keeps the ID with the name, so an offer can link to its product or category.
export interface OfferTarget {
  id: string;
  name: string;
}

/** A product an offer applies to, with the category its row names (CATEGORY_ID / CATEGORY_NAME), if any. */
// CHANGED (new): keeps each product with its own category, for the offer's expandable product list.
export interface OfferProduct extends OfferTarget {
  category?: OfferTarget;
}

/**
 * One offer from offer_discount/get. The API sends one row per applicable product; rows with the same OFFER_ID are
 * one offer, holding every product and category of those rows.
 */
// CHANGED: fields follow the offer_discount/get response. The card's look (theme, image, tagline, link) is decided
// by the Offers page, not stored on the offer.
export interface Offer {
  /** OFFER_ID */
  id: string;
  /** OFFER_CODE: coupon code the shopper copies and applies at checkout. */
  code: string;
  /** OFFER_NAME */
  title: string;
  /** OFFER_TYPE as the API sends it, e.g. "PERCENTAGE". */
  offerType: string;
  /** DISCOUNT_VALUE: a percentage for a percentage offer, otherwise an amount in ₹. */
  discountValue: number;
  /** MINIMUM_ORDER_AMOUNT in ₹ (0 when the API sends none). */
  minOrderAmount: number;
  /** MAXIMUM_DISCOUNT in ₹, or null when the API sends no positive cap. */
  maxDiscount: number | null;
  /** START_DATE and END_DATE as the API sends them (ISO date-times). */
  startDate: string;
  endDate: string;
  /** The products of this offer's rows (each once), in API order. */
  products: OfferProduct[];
  /** Every category of this offer's rows (each once), including rows without a product. */
  categories: OfferTarget[];
  status: OfferStatus;
}
