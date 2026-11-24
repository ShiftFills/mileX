import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { Offer } from '@shared/models';
import { MAX_OFFER_PAGES, OFFER_PAGE_SIZE, OfferService } from './offer.service';

/** offer_discount/get page `index` (LIMIT 50): OFFER_ID=-1 asks for every offer. */
function pageUrl(index: number): string {
  return `/api/offer_discount/get?OFFER_ID=-1&LIMIT=${OFFER_PAGE_SIZE}&OFFSET=${index * OFFER_PAGE_SIZE}`;
}

/** The sample row of the offer_discount/get documentation. */
const SAMPLE_ROW = {
  OFFER_ID: 6,
  OFFER_NAME: 'Diwali Special Offer',
  OFFER_CODE: 'DIWALI2028',
  OFFER_TYPE: 'PERCENTAGE',
  DISCOUNT_VALUE: '20.00',
  MINIMUM_ORDER_AMOUNT: '500.00',
  MAXIMUM_DISCOUNT: '200.00',
  START_DATE: '2026-11-23T18:30:00.000Z',
  END_DATE: '2026-12-31T18:29:59.000Z',
  PRODUCT_ID: 24,
  PRODUCT_NAME: 'Realme Narzo 70',
  CATEGORY_ID: 3,
  CATEGORY_NAME: 'Electronics',
  STATUS: 'ACTIVE',
  CREATED_BY: 1,
  UPDATED_BY: 1,
  CREATED_AT: '2026-11-24T05:45:55.000Z',
  UPDATED_AT: '2026-11-24T06:19:26.000Z',
};

/** A row of offer `offerId` for product `productId` (category 3), otherwise the sample. */
function row(offerId: number, productId: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...SAMPLE_ROW,
    OFFER_ID: offerId,
    OFFER_NAME: `Offer ${offerId}`,
    OFFER_CODE: `CODE${offerId}`,
    PRODUCT_ID: productId,
    PRODUCT_NAME: `Product ${productId}`,
    ...overrides,
  };
}

describe('OfferService', () => {
  let service: OfferService;
  let http: HttpTestingController;

  beforeEach(() => {
    // Only Date is faked: "now" is 24 Nov 2026, 12:00 IST.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-24T06:30:00.000Z'));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api' }],
    });
    service = TestBed.inject(OfferService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function load(): { offers: () => Offer[] | undefined; error: () => unknown } {
    let offers: Offer[] | undefined;
    let error: unknown;
    service.loadOffers().subscribe({ next: (result) => (offers = result), error: (caught: unknown) => (error = caught) });
    return { offers: () => offers, error: () => error };
  }

  it('requests every offer (OFFER_ID=-1, LIMIT, OFFSET) and maps the documented sample row', () => {
    const result = load();
    const request = http.expectOne(pageUrl(0));
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'SUCCESS', data: [SAMPLE_ROW] });

    expect(result.offers()).toEqual([{
      id: '6',
      code: 'DIWALI2028',
      title: 'Diwali Special Offer',
      offerType: 'PERCENTAGE',
      discountValue: 20,
      minOrderAmount: 500,
      maxDiscount: 200,
      startDate: '2026-11-23T18:30:00.000Z',
      endDate: '2026-12-31T18:29:59.000Z',
      products: [{ id: '24', name: 'Realme Narzo 70', category: { id: '3', name: 'Electronics' } }],
      categories: [{ id: '3', name: 'Electronics' }],
      status: 'Active',
    }]);
  });

  it('shows rows with the same OFFER_ID as one offer with all of its products and categories, each once', () => {
    const result = load();
    http.expectOne(pageUrl(0)).flush({
      status: 'SUCCESS',
      data: [
        row(6, 24),
        row(7, 18, { CATEGORY_ID: 5, CATEGORY_NAME: 'Home' }),
        row(6, 22),
        row(6, 30, { CATEGORY_ID: 4, CATEGORY_NAME: 'Audio' }),
        row(6, 24),
      ],
    });

    const offers = result.offers()!;
    expect(offers.map((offer) => offer.id)).toEqual(['6', '7']);
    // Each product keeps the category of its own row; offer 7's product is not in offer 6.
    expect(offers[0].products.map((product) => [product.id, product.category?.id])).toEqual([
      ['24', '3'],
      ['22', '3'],
      ['30', '4'],
    ]);
    expect(offers[0].categories).toEqual([{ id: '3', name: 'Electronics' }, { id: '4', name: 'Audio' }]);
    expect(offers[1].products).toEqual([{ id: '18', name: 'Product 18', category: { id: '5', name: 'Home' } }]);
  });

  it('fills in a product\'s category from a later row of the same offer when its first row had none', () => {
    const result = load();
    http.expectOne(pageUrl(0)).flush({
      status: 'SUCCESS',
      data: [row(6, 24, { CATEGORY_ID: null, CATEGORY_NAME: null }), row(6, 24)],
    });
    expect(result.offers()?.[0].products).toEqual([
      { id: '24', name: 'Product 24', category: { id: '3', name: 'Electronics' } },
    ]);
  });

  it('reads the next page while a page is full and keeps an offer split across pages as one offer', () => {
    const result = load();
    // Page 1: offer 1 for 49 products, then the first product of offer 2.
    const firstPage = [...Array.from({ length: 49 }, (_, index) => row(1, index + 1)), row(2, 100)];
    http.expectOne(pageUrl(0)).flush({ status: 'SUCCESS', data: firstPage });
    expect(result.offers()).toBeUndefined();

    // Page 2 (shorter than LIMIT, so the last): offer 2's second product, then offer 3.
    http.expectOne(pageUrl(1)).flush({ status: 'SUCCESS', data: [row(2, 101), row(3, 200)] });

    const offers = result.offers()!;
    expect(offers.map((offer) => offer.id)).toEqual(['1', '2', '3']);
    expect(offers[0].products).toHaveLength(49);
    expect(offers[1].products.map((product) => product.id)).toEqual(['100', '101']);
  });

  it('stops at the reported total_records', () => {
    const result = load();
    http.expectOne(pageUrl(0)).flush({
      status: 'SUCCESS',
      total_records: OFFER_PAGE_SIZE,
      data: Array.from({ length: OFFER_PAGE_SIZE }, (_, index) => row(1, index + 1)),
    });
    expect(result.offers()).toHaveLength(1);
  });

  it('stops when a page repeats rows already read (an API that ignores OFFSET)', () => {
    const result = load();
    const page = Array.from({ length: OFFER_PAGE_SIZE }, (_, index) => row(1, index + 1));
    http.expectOne(pageUrl(0)).flush({ status: 'SUCCESS', data: page });
    http.expectOne(pageUrl(1)).flush({ status: 'SUCCESS', data: page });
    expect(result.offers()?.[0].products).toHaveLength(OFFER_PAGE_SIZE);
  });

  it(`stops after ${MAX_OFFER_PAGES} requests`, () => {
    const result = load();
    for (let index = 0; index < MAX_OFFER_PAGES; index++) {
      http.expectOne(pageUrl(index)).flush({
        status: 'SUCCESS',
        data: Array.from({ length: OFFER_PAGE_SIZE }, (_, item) => row(index + 1, item + 1)),
      });
    }
    expect(result.offers()).toHaveLength(MAX_OFFER_PAGES);
  });

  it('leaves out INACTIVE offers and gives each offer its status from START_DATE and END_DATE', () => {
    const result = load();
    http.expectOne(pageUrl(0)).flush({
      status: 'SUCCESS',
      data: [
        row(1, 1),
        row(2, 2, { START_DATE: '2026-12-01T06:30:00.000Z' }),
        row(3, 3, { START_DATE: '2026-10-01T06:30:00.000Z', END_DATE: '2026-10-31T06:30:00.000Z' }),
        row(4, 4, { STATUS: 'INACTIVE' }),
        row(5, 5, { START_DATE: null, END_DATE: 'not a date' }),
      ],
    });

    expect(result.offers()?.map((offer) => [offer.id, offer.status, offer.endDate])).toEqual([
      ['1', 'Active', SAMPLE_ROW.END_DATE],
      ['2', 'Upcoming', SAMPLE_ROW.END_DATE],
      ['3', 'Expired', '2026-10-31T06:30:00.000Z'],
      // No readable dates: no bounds, shown as "—".
      ['5', 'Active', ''],
    ]);
  });

  it('reads a missing or zero cap, minimum and product as none', () => {
    const result = load();
    http.expectOne(pageUrl(0)).flush({
      status: 'SUCCESS',
      data: [
        row(1, 1, { MAXIMUM_DISCOUNT: null, MINIMUM_ORDER_AMOUNT: null, OFFER_TYPE: 'FIXED_AMOUNT' }),
        row(2, 2, { MAXIMUM_DISCOUNT: '0.00', PRODUCT_ID: null, PRODUCT_NAME: null }),
      ],
    });

    const [fixed, categoryOnly] = result.offers()!;
    expect(fixed).toMatchObject({ offerType: 'FIXED_AMOUNT', maxDiscount: null, minOrderAmount: 0 });
    expect(categoryOnly).toMatchObject({ maxDiscount: null, products: [], categories: [{ id: '3', name: 'Electronics' }] });
  });

  it('returns no offers for a successful response without data', () => {
    const result = load();
    http.expectOne(pageUrl(0)).flush({ status: 'SUCCESS', message: 'No offers found', data: null });
    expect(result.offers()).toEqual([]);
  });

  describe('loadOffer', () => {
    /** offer_discount/get for one OFFER_ID, page `index`. */
    const offerUrl = (id: number, index = 0): string =>
      `/api/offer_discount/get?OFFER_ID=${id}&LIMIT=${OFFER_PAGE_SIZE}&OFFSET=${index * OFFER_PAGE_SIZE}`;

    function loadOne(id: string | number): { offer: () => Offer | null | undefined; error: () => unknown } {
      let offer: Offer | null | undefined;
      let error: unknown;
      service.loadOffer(id).subscribe({ next: (result) => (offer = result), error: (caught: unknown) => (error = caught) });
      return { offer: () => offer, error: () => error };
    }

    it('requests that OFFER_ID and keeps only its rows, with every product and its category', () => {
      const result = loadOne('6');
      // A row of another offer in the response is left out.
      http.expectOne(offerUrl(6)).flush({
        status: 'SUCCESS',
        data: [row(6, 24), row(7, 18, { CATEGORY_ID: 5, CATEGORY_NAME: 'Home' }), row(6, 22)],
      });
      expect(result.offer()?.id).toBe('6');
      expect(result.offer()?.products).toEqual([
        { id: '24', name: 'Product 24', category: { id: '3', name: 'Electronics' } },
        { id: '22', name: 'Product 22', category: { id: '3', name: 'Electronics' } },
      ]);
      expect(result.offer()?.categories).toEqual([{ id: '3', name: 'Electronics' }]);
    });

    it('reads every page of an offer with more products than LIMIT', () => {
      const result = loadOne(6);
      http.expectOne(offerUrl(6)).flush({
        status: 'SUCCESS',
        data: Array.from({ length: OFFER_PAGE_SIZE }, (_, index) => row(6, index + 1)),
      });
      http.expectOne(offerUrl(6, 1)).flush({ status: 'SUCCESS', data: [row(6, 999)] });
      expect(result.offer()?.products).toHaveLength(OFFER_PAGE_SIZE + 1);
    });

    it('returns null when the API has no active row for that offer', () => {
      const empty = loadOne(6);
      http.expectOne(offerUrl(6)).flush({ status: 'SUCCESS', data: [] });
      expect(empty.offer()).toBeNull();

      const inactive = loadOne(6);
      http.expectOne(offerUrl(6)).flush({ status: 'SUCCESS', data: [row(6, 24, { STATUS: 'INACTIVE' })] });
      expect(inactive.offer()).toBeNull();
    });

    it('rejects an invalid offer ID without a request', () => {
      expect(loadOne('abc').error()).toBeInstanceOf(RangeError);
      expect(loadOne(0).error()).toBeInstanceOf(RangeError);
    });
  });

  it('reports the API message of a failed response, and rejects a row without a valid OFFER_ID', () => {
    const failed = load();
    http.expectOne(pageUrl(0)).flush({ status: 'FAILED', message: 'Access token is required' });
    expect((failed.error() as Error).message).toBe('Access token is required');

    const invalid = load();
    http.expectOne(pageUrl(0)).flush({ status: 'SUCCESS', data: [row(0, 1)] });
    expect((invalid.error() as Error).message).toBe('The offers API returned an offer without a valid OFFER_ID.');
  });
});
