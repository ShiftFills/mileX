export type OfferStatus = 'Active' | 'Upcoming' | 'Expired';
export type OfferTheme = 'sunrise' | 'rose' | 'aqua' | 'lavender' | 'mint';

export interface Offer {
  id: string;
  /** Coupon code the shopper copies and applies at checkout. */
  code: string;
  title: string;
  /** Short line shown under the savings headline, e.g. "On Wireless Audio & Tech". */
  tagline: string;
  offerType: string;
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number;
  startDate: string;
  endDate: string;
  products: string[];
  categories: string[];
  /** Product-list category slug the card links to. */
  categorySlug: string;
  image: string;
  status: OfferStatus;
  theme: OfferTheme;
}
