import { Offer, OfferTheme } from '@shared/models';

const THEMES: readonly OfferTheme[] = ['sunrise', 'rose', 'aqua', 'lavender', 'mint'];

/** Demo offers until the offers API exists (see OfferService). */
export const OFFERS: readonly Offer[] = THEMES.map((theme, index) => ({
  id: `festive-bonanza-${index + 1}`,
  code: 'FESTIVE20',
  title: 'Festive Bonanza 2026',
  tagline: 'On Wireless Audio & Tech',
  offerType: 'Flat Discount',
  discountValue: 1000,
  minOrderAmount: 1499,
  maxDiscount: 1000,
  startDate: '2026-10-18',
  endDate: '2026-10-31',
  products: ['Audio', 'Electronics'],
  categories: ['Audio', 'Electronics'],
  categorySlug: 'electronics',
  image: '/images/offer-headphones.svg',
  status: 'Active',
  theme,
}));
