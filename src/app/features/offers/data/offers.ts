import { Offer } from '@shared/models';

/**
 * Demo offer behind the cart's coupon box (OfferService.applyCoupon) until a coupon API exists. The Offers page no
 * longer shows it: it lists offer_discount/get.
 */
// CHANGED: one offer in the API-based Offer shape (it was five copies of this offer, one per card theme).
export const OFFERS: readonly Offer[] = [
  {
    id: 'festive-bonanza',
    code: 'FESTIVE20',
    title: 'Festive Bonanza 2026',
    offerType: 'Flat Discount',
    discountValue: 1000,
    minOrderAmount: 1499,
    maxDiscount: 1000,
    startDate: '2026-10-18',
    endDate: '2026-10-31',
    products: [
      { id: 'audio', name: 'Audio' },
      { id: 'electronics', name: 'Electronics' },
    ],
    categories: [
      { id: 'audio', name: 'Audio' },
      { id: 'electronics', name: 'Electronics' },
    ],
    status: 'Active',
  },
];
