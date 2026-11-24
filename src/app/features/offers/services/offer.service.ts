import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, defer, expand, map, reduce, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { Offer, OfferStatus, OfferTarget } from '@shared/models';
import { OFFERS } from '../data/offers';

export type CouponResult = { code: string; discount: number } | { error: string };

/** OFFER_ID that asks offer_discount/get for every offer (-1: all, as in the other listing APIs). */
// CHANGED (new)
const ALL_OFFERS = -1;
/** Rows per offer_discount/get request (LIMIT). */
// CHANGED (new)
export const OFFER_PAGE_SIZE = 50;
/** Safety limit on the requests of one load: 20 × 50 = 1,000 offer rows. */
// CHANGED (new)
export const MAX_OFFER_PAGES = 20;

/** One offer_discount/get row: an offer, with the product (and its category) this row applies it to. */
// CHANGED (new)
interface OfferRow {
  offerId: number;
  code: string;
  title: string;
  offerType: string;
  discountValue: number;
  minOrderAmount: number;
  maxDiscount: number | null;
  startDate: string;
  endDate: string;
  product?: OfferTarget;
  category?: OfferTarget;
  /** False for STATUS "INACTIVE" (or 0 / false): the offer was switched off and is not listed. */
  active: boolean;
}

interface OfferRowPage {
  rows: OfferRow[];
  hasNext: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) return undefined;
  return String(value).trim();
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveId(value: unknown): number | undefined {
  const parsed = optionalNumber(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** A date the API sends, or '' when it sends none or one that cannot be read (shown as "—", never as a bound). */
function dateText(value: unknown): string {
  const date = text(value);
  return date && Number.isFinite(Date.parse(date)) ? date : '';
}

function isInactiveStatus(value: unknown): boolean {
  if (value === false || value === 0) return true;
  return typeof value === 'string' && ['INACTIVE', '0', 'FALSE'].includes(value.trim().toUpperCase());
}

/** The product or category of a row: its ID, with its name (or "Product #<id>" when the API sends none). */
function target(id: unknown, name: unknown, fallbackLabel: string): OfferTarget | undefined {
  const targetId = positiveId(id);
  if (targetId === undefined) return undefined;
  return { id: String(targetId), name: text(name) ?? `${fallbackLabel} #${targetId}` };
}

/** True for a percentage offer (OFFER_TYPE "PERCENTAGE"); any other type is an amount in ₹. */
// CHANGED (new): shared by the Offers page and applyCoupon.
export function isPercentageOffer(offer: Pick<Offer, 'offerType'>): boolean {
  return /percent/i.test(offer.offerType);
}

/** OFFER_TYPE for people: "PERCENTAGE" -> "Percentage", "FIXED_AMOUNT" -> "Fixed Amount". */
// CHANGED (new)
export function offerTypeLabel(offerType: string): string {
  const words = offerType.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
  return words.length ? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ') : '—';
}

/** Upcoming before START_DATE, Expired after END_DATE, otherwise Active. A date the API leaves out is no bound. */
function offerStatus(startDate: string, endDate: string, now: number): OfferStatus {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  if (Number.isFinite(start) && now < start) return 'Upcoming';
  if (Number.isFinite(end) && now > end) return 'Expired';
  return 'Active';
}

function mapOfferRow(value: unknown): OfferRow {
  if (!isRecord(value)) throw new Error('The offers API returned an invalid offer.');
  const offerId = positiveId(value['OFFER_ID']);
  if (offerId === undefined) throw new Error('The offers API returned an offer without a valid OFFER_ID.');
  const discountValue = optionalNumber(value['DISCOUNT_VALUE']);
  if (discountValue === undefined || discountValue < 0) {
    throw new Error('The offers API returned an offer with an invalid discount value.');
  }
  const minOrderAmount = optionalNumber(value['MINIMUM_ORDER_AMOUNT']) ?? 0;
  if (minOrderAmount < 0) throw new Error('The offers API returned an offer with an invalid minimum order amount.');
  const maxDiscount = optionalNumber(value['MAXIMUM_DISCOUNT']);
  const code = text(value['OFFER_CODE']) ?? '';
  const product = target(value['PRODUCT_ID'], value['PRODUCT_NAME'], 'Product');
  const category = target(value['CATEGORY_ID'], value['CATEGORY_NAME'], 'Category');
  return {
    offerId,
    code,
    title: text(value['OFFER_NAME']) ?? (code || `Offer #${offerId}`),
    offerType: text(value['OFFER_TYPE']) ?? '',
    discountValue,
    minOrderAmount,
    maxDiscount: maxDiscount !== undefined && maxDiscount > 0 ? maxDiscount : null,
    startDate: dateText(value['START_DATE']),
    endDate: dateText(value['END_DATE']),
    ...(product ? { product } : {}),
    ...(category ? { category } : {}),
    active: !isInactiveStatus(value['STATUS']),
  };
}

/**
 * One offer_discount/get page. Success is `status: "SUCCESS"` (or `success: true`); `data: null` or no `data` is an
 * empty page. Without a reported total_records, the page is the last one when it has fewer rows than LIMIT.
 */
function mapOfferRowPage(response: unknown, limit: number, offset: number): OfferRowPage {
  if (!isRecord(response)) throw new Error('The offers API returned an invalid response.');
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  const succeeded = (value: unknown): boolean =>
    value === undefined || value === true || value === 1 ||
    (typeof value === 'string' && ['SUCCESS', 'OK', 'TRUE', '1', '200'].includes(value.trim().toUpperCase()));
  if (status === undefined && success === undefined) throw new Error('The offers API returned an invalid response.');
  if (!succeeded(status) || !succeeded(success)) {
    throw new Error(text(response['message'] ?? response['MESSAGE']) ?? 'The offers could not be loaded.');
  }

  const data = response['data'] ?? response['DATA'];
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    throw new Error('The offers API returned an invalid offer list.');
  }
  const records = Array.isArray(data) ? data : [];
  const reported = optionalNumber(response['total_records'] ?? response['TOTAL_RECORDS']);
  const total = reported !== undefined && Number.isSafeInteger(reported) && reported >= 0 ? reported : undefined;
  return {
    rows: records.map(mapOfferRow),
    hasNext: total !== undefined ? offset + records.length < total : records.length === limit,
  };
}

/**
 * The offers of these rows, in the order their first row came. Rows with the same OFFER_ID are one offer: every
 * product and category they name is kept (each once). Inactive rows are left out.
 */
// CHANGED (new): an offer for several products arrives as several rows with the same OFFER_ID.
function groupOfferRows(rows: readonly OfferRow[], now: number): Offer[] {
  const offers = new Map<number, Offer>();
  for (const row of rows) {
    if (!row.active) continue;
    let offer = offers.get(row.offerId);
    if (!offer) {
      offer = {
        id: String(row.offerId),
        code: row.code,
        title: row.title,
        offerType: row.offerType,
        discountValue: row.discountValue,
        minOrderAmount: row.minOrderAmount,
        maxDiscount: row.maxDiscount,
        startDate: row.startDate,
        endDate: row.endDate,
        products: [],
        categories: [],
        status: offerStatus(row.startDate, row.endDate, now),
      };
      offers.set(row.offerId, offer);
    }
    // CHANGED: each product keeps the category of its own row (filled in from a later row if its first had none).
    const { product, category } = row;
    if (product) {
      const known = offer.products.find((entry) => entry.id === product.id);
      if (!known) offer.products.push(category ? { ...product, category } : { ...product });
      else if (!known.category && category) known.category = category;
    }
    if (category && !offer.categories.some((known) => known.id === category.id)) offer.categories.push(category);
  }
  return [...offers.values()];
}

/** Identifies a row, so a page that repeats rows (an API that ignores OFFSET) adds nothing. */
function rowKey(row: OfferRow): string {
  return `${row.offerId}|${row.product?.id ?? ''}|${row.category?.id ?? ''}`;
}

@Injectable({ providedIn: 'root' })
export class OfferService {
  private readonly api = inject(ApiService);

  // CHANGED: the cart's coupon box only; the Offers page lists offer_discount/get (loadOffers).
  /** Demo offers behind applyCoupon until a coupon API exists. */
  readonly offers: readonly Offer[] = OFFERS;

  /**
   * Every offer the customer can see, from `offer_discount/get?OFFER_ID=-1&LIMIT=50&OFFSET=…`, grouped by OFFER_ID.
   * Grouping all rows keeps an offer whose rows span two pages as one offer with all of its products.
   */
  // CHANGED (new)
  // CHANGED: the paging moved to loadRows (shared with loadOffer).
  loadOffers(): Observable<Offer[]> {
    return this.loadRows(ALL_OFFERS).pipe(map((rows) => groupOfferRows(rows, Date.now())));
  }

  /**
   * One offer with every product and category it applies to, from `offer_discount/get?OFFER_ID=<id>&LIMIT=50&OFFSET=…`
   * (the listing with OFFER_ID=-1 may leave the products out). Only rows of that OFFER_ID are used, so another
   * offer's products are never included. Null when the API has no active row for it.
   */
  // CHANGED (new): an offer's product list, opened with its card's arrow.
  loadOffer(offerId: string | number): Observable<Offer | null> {
    const id = Number(offerId);
    if (!String(offerId).trim() || !Number.isSafeInteger(id) || id <= 0) {
      return throwError(() => new RangeError('Offer ID must be a positive safe integer.'));
    }
    return this.loadRows(id).pipe(
      map((rows) => groupOfferRows(rows.filter((row) => row.offerId === id), Date.now())[0] ?? null),
    );
  }

  /**
   * The rows of offer_discount/get for this OFFER_ID (-1: every offer). LIMIT and OFFSET count rows (one per offer
   * and product), so pages are read until the API reports no next page, a page brings no new row, or
   * MAX_OFFER_PAGES is reached.
   */
  // CHANGED (new): was the body of loadOffers.
  private loadRows(offerId: number): Observable<OfferRow[]> {
    return defer(() => {
      const seen = new Set<string>();
      const loadPage = (pageIndex: number) => {
        const offset = pageIndex * OFFER_PAGE_SIZE;
        return this.api
          .get<unknown>(API_ENDPOINTS.offerDiscount.get, { OFFER_ID: offerId, LIMIT: OFFER_PAGE_SIZE, OFFSET: offset })
          .pipe(
            map((response) => {
              const page = mapOfferRowPage(response, OFFER_PAGE_SIZE, offset);
              const added = page.rows.filter((row) => {
                const key = rowKey(row);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              return { pageIndex, hasNext: page.hasNext, added };
            }),
          );
      };

      return loadPage(0).pipe(
        expand(({ pageIndex, hasNext, added }) =>
          hasNext && added.length > 0 && pageIndex + 1 < MAX_OFFER_PAGES ? loadPage(pageIndex + 1) : EMPTY,
        ),
        reduce((rows, { added }) => [...rows, ...added], [] as OfferRow[]),
      );
    });
  }

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

    // CHANGED: isPercentageOffer (same test as before); an offer without a cap (maxDiscount null) is not capped.
    const raw = isPercentageOffer(offer) ? (subtotal * offer.discountValue) / 100 : offer.discountValue;
    return { code: offer.code, discount: Math.min(Math.round(raw), offer.maxDiscount ?? Infinity, subtotal) };
  }
}
