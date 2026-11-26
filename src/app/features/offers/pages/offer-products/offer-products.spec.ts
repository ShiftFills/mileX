import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@core/config/api.config';
import { AuthService } from '@core/services/auth.service';
import { OfferProducts } from './offer-products';

// CHANGED (new): one offer's products as product cards (offer_discount/get?OFFER_ID=<id>, then products/get per product).
const offerUrl = (id: number): string => `/api/offer_discount/get?OFFER_ID=${id}&LIMIT=50&OFFSET=0`;
const productUrl = (id: number | string): string => `/api/products/get?PRODUCT_ID=${id}&STATUS=ACTIVE`;
// CHANGED: the hearts read the customer's wishlist (wishlist/get), no longer their cart (shopping_cart/get).
const WISHLIST_SYNC_URL = '/api/wishlist/get?LIMIT=100&OFFSET=0';

/** Dates at 12:00 IST (06:30 UTC), so they read the same day in any time zone. */
const at = (day: string): string => `${day}T06:30:00.000Z`;

const DIWALI = {
  OFFER_ID: 6, OFFER_NAME: 'Diwali Special Offer', OFFER_CODE: 'DIWALI2028', OFFER_TYPE: 'PERCENTAGE',
  DISCOUNT_VALUE: '20.00', MINIMUM_ORDER_AMOUNT: '500.00', MAXIMUM_DISCOUNT: '200.00',
  START_DATE: at('2026-11-24'), END_DATE: at('2026-12-31'), CATEGORY_ID: 3, CATEGORY_NAME: 'Electronics', STATUS: 'ACTIVE',
};
/** Offer 6's rows: one per product. */
const OFFER_ROWS = [
  { ...DIWALI, PRODUCT_ID: 24, PRODUCT_NAME: 'Realme Narzo 70' },
  { ...DIWALI, PRODUCT_ID: 31, PRODUCT_NAME: 'Portronics USB-C Cable' },
  { ...DIWALI, PRODUCT_ID: 32, PRODUCT_NAME: 'LG Smart LED TV' },
];
/** products/get rows (the API's listing fields). */
const PRODUCTS: Record<number, Record<string, unknown>> = {
  24: { PRODUCT_ID: 24, PRODUCT_NAME: 'Realme Narzo 70', PRICE: '15999.00', SELLING_PRICE: '13999.00', STOCK_QUANTITY: 5, IS_ACTIVE: 1 },
  31: { PRODUCT_ID: 31, PRODUCT_NAME: 'Portronics USB-C Cable', PRICE: '499.00', SELLING_PRICE: '499.00', STOCK_QUANTITY: 9, IS_ACTIVE: 1 },
  32: { PRODUCT_ID: 32, PRODUCT_NAME: 'LG Smart LED TV', PRICE: '40000.00', SELLING_PRICE: '30000.00', STOCK_QUANTITY: 2, IS_ACTIVE: 1 },
};

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

describe('OfferProducts', () => {
  let fixture: ComponentFixture<OfferProducts>;
  let root: HTMLElement;
  let http: HttpTestingController;

  const text = (element: Element | null = root): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** The product cards' names, in order. */
  const cardNames = (): string[] =>
    Array.from(root.querySelectorAll('app-product-card'), (card) =>
      text(card.querySelector('.product-card__details h2') ?? card.querySelector('.product-card__details > p')));

  function signIn(userType: 'CUSTOMER' | 'SELLER'): void {
    TestBed.inject(AuthService).setSession(
      { id: '3', email: '', firstName: 'pooja123', lastName: '', userType },
      tokenWithClaims(userType === 'CUSTOMER' ? { USER_ID: 3, CUSTOMER_ID: 1 } : { USER_ID: 3, SELLER_ID: 2 }),
    );
  }

  async function open(id: string): Promise<void> {
    fixture = TestBed.createComponent(OfferProducts);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  async function update(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Opens the page as a customer (their wishlist is read for the hearts) and answers the offer request with these rows. */
  async function openOffer(id: number, rows: Record<string, unknown>[]): Promise<void> {
    signIn('CUSTOMER');
    await open(String(id));
    http.expectOne(WISHLIST_SYNC_URL).flush({ success: true, data: [] });
    http.expectOne(offerUrl(id)).flush({ status: 'SUCCESS', data: rows });
    await update();
  }

  function answerProducts(ids: number[]): void {
    for (const id of ids) http.expectOne(productUrl(id)).flush({ status: true, data: [PRODUCTS[id]] });
  }

  beforeEach(async () => {
    localStorage.clear();
    // Only Date is faked: "now" is 24 Nov 2026, 12:00 IST.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(at('2026-11-24')));
    await TestBed.configureTestingModule({
      imports: [OfferProducts],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Also fails if a guest or non-customer page sent a request.
    http.verify();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('asks a guest to sign in (returning to this offer) and calls no API', async () => {
    await open('6');
    expect(text(root.querySelector('.offer-products__state'))).toContain('Sign in to see this offer');
    expect(root.querySelector('.offer-products__state a')?.getAttribute('href')).toBe('/auth/login?returnUrl=%2Foffers%2F6');
    expect(root.querySelector('.offer-products__back')?.getAttribute('href')).toBe('/offers');
  });

  it('tells a signed-in seller that offers are for customer accounts, without calling the API', async () => {
    signIn('SELLER');
    await open('6');
    expect(text(root.querySelector('.offer-products__state'))).toContain('Offers are for customer accounts');
  });

  it('shows the offer and its products as product cards, in the offer\'s order', async () => {
    signIn('CUSTOMER');
    await open('6');
    http.expectOne(WISHLIST_SYNC_URL).flush({ success: true, data: [] });
    expect(text(root.querySelector('[role="status"]'))).toContain('Loading offer');

    // The response also has a row of another offer: its product is not part of offer 6.
    http.expectOne(offerUrl(6)).flush({
      status: 'SUCCESS',
      data: [...OFFER_ROWS, { ...DIWALI, OFFER_ID: 7, OFFER_NAME: 'Tissue Saver', PRODUCT_ID: 18, PRODUCT_NAME: 'tissuee' }],
    });
    await update();

    expect(text(root.querySelector('h1'))).toBe('Diwali Special Offer');
    expect(text(root.querySelector('.offer-products__summary app-badge'))).toBe('Active');
    expect(text(root.querySelector('.offer-products__terms'))).toBe(
      '20% off up to ₹200 Min. order ₹500 24 Nov 2026 – 31 Dec 2026 Percentage',
    );
    expect(text(root.querySelector('.offer-products__code-text'))).toBe('DIWALI2028');
    expect(text(root.querySelector('.product-section__heading h2'))).toBe('Products in this offer');
    expect(text(root.querySelector('.product-section__heading span'))).toBe('3 products');
    expect(text(root.querySelector('.product-section [role="status"]'))).toContain('Loading products');

    // Each product's card comes from products/get (prices, MRP and % OFF as on the Home page).
    answerProducts([24, 31, 32]);
    http.expectNone(productUrl(18));
    await update();

    expect(cardNames()).toEqual(['Realme Narzo 70', 'Portronics USB-C Cable', 'LG Smart LED TV']);
    const cards = Array.from(root.querySelectorAll<HTMLElement>('app-product-card'));
    expect(text(cards[0].querySelector('.product-card__price span'))).toBe('13% OFF');
    expect(text(cards[0].querySelector('del'))).toBe('₹15,999');
    expect(cards[1].querySelector('del')).toBeNull();
    expect(text(cards[2].querySelector('.product-card__price span'))).toBe('25% OFF');
    expect(Array.from(cards, (card) => card.querySelector('a')?.getAttribute('href'))).toEqual([
      '/products/24', '/products/31', '/products/32',
    ]);
    expect(root.querySelector('app-pagination')).toBeNull();
  });

  it('leaves out products that are not sold any more and retries only the products that failed', async () => {
    await openOffer(6, OFFER_ROWS);
    http.expectOne(productUrl(24)).flush({ status: true, data: [PRODUCTS[24]] });
    // No active product with this ID (delisted).
    http.expectOne(productUrl(31)).flush({ status: true, data: [] });
    http.expectOne(productUrl(32)).flush({ status: false, message: 'Server error' }, { status: 500, statusText: 'Server Error' });
    await update();

    expect(cardNames()).toEqual(['Realme Narzo 70']);
    expect(text(root.querySelector('.offer-products__note'))).toBe('1 product in this offer is not available right now.');
    expect(text(root.querySelector('app-alert'))).toContain('1 product could not be loaded.');

    (root.querySelector('app-alert .offer-products__retry') as HTMLButtonElement).click();
    await update();
    answerProducts([32]);
    await update();
    expect(cardNames()).toEqual(['Realme Narzo 70', 'LG Smart LED TV']);
    expect(root.querySelector('app-alert')).toBeNull();
  });

  it('loads the products ten at a time, page by page, and does not load a page again', async () => {
    const ids = Array.from({ length: 12 }, (_, index) => 100 + index);
    for (const id of ids) {
      PRODUCTS[id] = { PRODUCT_ID: id, PRODUCT_NAME: `Product ${id}`, SELLING_PRICE: '100.00', STOCK_QUANTITY: 1 };
    }
    await openOffer(6, ids.map((id) => ({ ...DIWALI, PRODUCT_ID: id, PRODUCT_NAME: `Product ${id}` })));

    answerProducts(ids.slice(0, 10));
    await update();
    expect(cardNames()).toHaveLength(10);
    expect(text(root.querySelector('.pagination__summary'))).toBe('Showing 1–10 of 12 products');

    const pageButton = (label: string): HTMLButtonElement =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('.pagination__nav button')).find((button) => text(button) === label)!;
    pageButton('2').click();
    await update();
    answerProducts(ids.slice(10));
    await update();
    expect(cardNames()).toEqual(['Product 110', 'Product 111']);

    pageButton('1').click();
    await update();
    expect(cardNames()).toHaveLength(10);
  });

  it('says so when no product is linked to the offer', async () => {
    await openOffer(6, [{ ...DIWALI, PRODUCT_ID: null, PRODUCT_NAME: null }]);
    expect(text(root.querySelector('.product-section .offer-products__state'))).toBe('No products are linked to this offer.');
  });

  it('shows "Offer not found" for an unknown offer, and for an ID that is not an offer ID without calling the API', async () => {
    await openOffer(6, []);
    expect(text(root.querySelector('h1'))).toBe('Offer not found');

    fixture.componentRef.setInput('id', 'abc');
    await update();
    expect(text(root.querySelector('h1'))).toBe('Offer not found');
  });

  it('shows a failed offer request with Try again', async () => {
    signIn('CUSTOMER');
    await open('6');
    http.expectOne(WISHLIST_SYNC_URL).flush({ success: true, data: [] });
    http.expectOne(offerUrl(6)).flush(
      { status: 'FAILED', message: 'Offers are unavailable.' },
      { status: 500, statusText: 'Server Error' },
    );
    await update();
    expect(text(root.querySelector('app-alert'))).toContain('Offers are unavailable.');

    (root.querySelector('.offer-products__retry') as HTMLButtonElement).click();
    await update();
    http.expectOne(offerUrl(6)).flush({ status: 'SUCCESS', data: OFFER_ROWS.slice(0, 1) });
    await update();
    answerProducts([24]);
    await update();
    expect(cardNames()).toEqual(['Realme Narzo 70']);
  });

  it('copies the coupon code and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await openOffer(6, OFFER_ROWS.slice(0, 1));
    answerProducts([24]);
    await update();

    (root.querySelector('.offer-products__copy') as HTMLButtonElement).click();
    await update();
    expect(writeText).toHaveBeenCalledWith('DIWALI2028');
    expect(text(root.querySelector('.offer-products__code [role="status"]'))).toBe('Code copied');
  });
});
