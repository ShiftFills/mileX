import { Injectable } from '@angular/core';
import { Offer } from '@shared/models';
import { OFFERS } from '../data/offers';

export type CouponResult = { code: string; discount: number } | { error: string };

@Injectable({ providedIn: 'root' })
export class OfferService {
  /** Offers shown on the Offers & Discounts page (demo data until the API is wired). */
  readonly offers: readonly Offer[] = OFFERS;

  /** Validates a coupon code against the active offers and returns the discount for `subtotal`. */
  applyCoupon(code: string, subtotal: number): CouponResult {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return { error: 'Enter a coupon code.' };

    const offer = this.offers.find((candidate) => candidate.code.toUpperCase() === normalized);
    if (!offer) return { error: 'This coupon code is not valid.' };
    if (offer.status !== 'Active') return { error: 'This coupon is not active right now.' };
    if (subtotal < offer.minOrderAmount) {
      const shortfall = (offer.minOrderAmount - subtotal).toLocaleString('en-IN');
      return { error: `Add items worth ₹${shortfall} more to use this coupon.` };
    }

    const raw = /percent/i.test(offer.offerType) ? (subtotal * offer.discountValue) / 100 : offer.discountValue;
    return { code: offer.code, discount: Math.min(Math.round(raw), offer.maxDiscount, subtotal) };
  }
}
