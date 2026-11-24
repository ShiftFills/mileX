import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@core/config/api.config';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { Offers } from './offers';

// CHANGED: the page lists offer_discount/get for a signed-in customer (it used to show demo offers to everyone).
const OFFERS_URL = '/api/offer_discount/get?OFFER_ID=-1&LIMIT=50&OFFSET=0';

/** Dates at 12:00 IST (06:30 UTC), so they read the same day in any time zone. */
const at = (day: string): string => `${day}T06:30:00.000Z`;

/** Offer 6 (two products of one category, so two rows), a fixed-amount offer, an expired one and an inactive one. */
const OFFER_ROWS = [
  {
    OFFER_ID: 6, OFFER_NAME: 'Diwali Special Offer', OFFER_CODE: 'DIWALI2028', OFFER_TYPE: 'PERCENTAGE',
    DISCOUNT_VALUE: '20.00', MINIMUM_ORDER_AMOUNT: '500.00', MAXIMUM_DISCOUNT: '200.00',
    START_DATE: at('2026-11-20'), END_DATE: at('2026-12-31'),
    PRODUCT_ID: 24, PRODUCT_NAME: 'Realme Narzo 70', CATEGORY_ID: 3, CATEGORY_NAME: 'Electronics', STATUS: 'ACTIVE',
  },
  {
    OFFER_ID: 6, OFFER_NAME: 'Diwali Special Offer', OFFER_CODE: 'DIWALI2028', OFFER_TYPE: 'PERCENTAGE',
    DISCOUNT_VALUE: '20.00', MINIMUM_ORDER_AMOUNT: '500.00', MAXIMUM_DISCOUNT: '200.00',
    START_DATE: at('2026-11-20'), END_DATE: at('2026-12-31'),
    PRODUCT_ID: 22, PRODUCT_NAME: 'OnePlus Nord CE 4', CATEGORY_ID: 3, CATEGORY_NAME: 'Electronics', STATUS: 'ACTIVE',
  },
  // The backend's name for a fixed-amount type is not documented; any type other than PERCENTAGE is an amount.
  {
    OFFER_ID: 7, OFFER_NAME: 'Tissue Saver', OFFER_CODE: 'SAVE50', OFFER_TYPE: 'FIXED_AMOUNT',
    DISCOUNT_VALUE: '50.00', MINIMUM_ORDER_AMOUNT: '300.00', MAXIMUM_DISCOUNT: null,
    START_DATE: at('2026-12-01'), END_DATE: at('2026-12-15'),
    PRODUCT_ID: 18, PRODUCT_NAME: 'tissuee', CATEGORY_ID: 5, CATEGORY_NAME: 'Home', STATUS: 'ACTIVE',
  },
  {
    OFFER_ID: 8, OFFER_NAME: 'October Audio Week', OFFER_CODE: 'AUDIO10', OFFER_TYPE: 'PERCENTAGE',
    DISCOUNT_VALUE: '10.00', MINIMUM_ORDER_AMOUNT: '1000.00', MAXIMUM_DISCOUNT: '300.00',
    START_DATE: at('2026-10-01'), END_DATE: at('2026-10-31'),
    PRODUCT_ID: 19, PRODUCT_NAME: 'Ear Buds', CATEGORY_ID: 4, CATEGORY_NAME: 'Audio', STATUS: 'ACTIVE',
  },
  {
    OFFER_ID: 9, OFFER_NAME: 'Withdrawn Offer', OFFER_CODE: 'GONE', OFFER_TYPE: 'PERCENTAGE',
    DISCOUNT_VALUE: '5.00', MINIMUM_ORDER_AMOUNT: '0.00', MAXIMUM_DISCOUNT: null,
    START_DATE: at('2026-11-01'), END_DATE: at('2026-12-31'),
    PRODUCT_ID: 20, PRODUCT_NAME: 'Samsung Galaxy S25', CATEGORY_ID: 3, CATEGORY_NAME: 'Electronics', STATUS: 'INACTIVE',
  },
];

/** `count` single-product percentage offers named "Offer 1"… (all active). */
function manyOffers(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => ({
    ...OFFER_ROWS[0],
    OFFER_ID: 100 + index,
    OFFER_NAME: `Offer ${index + 1}`,
    OFFER_CODE: `CODE${index + 1}`,
    PRODUCT_ID: 200 + index,
    PRODUCT_NAME: `Product ${index + 1}`,
  }));
}

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

describe('Offers', () => {
  let fixture: ComponentFixture<Offers>;
  let root: HTMLElement;
  let http: HttpTestingController;

  const text = (element: Element | null = root): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const cards = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('.offer'));
  const titles = (): string[] => cards().map((card) => text(card.querySelector('h3')));

  function signIn(userType: 'CUSTOMER' | 'SELLER'): void {
    TestBed.inject(AuthService).setSession(
      { id: '3', email: '', firstName: 'pooja123', lastName: '', userType },
      tokenWithClaims(userType === 'CUSTOMER' ? { USER_ID: 3, CUSTOMER_ID: 1 } : { USER_ID: 3, SELLER_ID: 2 }),
    );
  }

  async function open(): Promise<void> {
    fixture = TestBed.createComponent(Offers);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  /** Opens the page as a customer and answers its offer_discount/get request with these rows. */
  async function openWithOffers(rows: Record<string, unknown>[]): Promise<void> {
    signIn('CUSTOMER');
    await open();
    http.expectOne(OFFERS_URL).flush({ status: 'SUCCESS', data: rows });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** The toolbar select labelled `label` ("Offer type", "Status", "Sort by"). */
  const selectFor = (label: string): HTMLSelectElement =>
    Array.from(root.querySelectorAll('.offers__tools > label'))
      .find((element) => text(element).startsWith(label))!
      .querySelector('select')!;

  async function choose(label: string, value: string): Promise<void> {
    const select = selectFor(label);
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function searchFor(value: string): Promise<void> {
    const input = root.querySelector<HTMLInputElement>('#offers-search')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    // Only Date is faked: "now" is 24 Nov 2026, 12:00 IST.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(at('2026-11-24')));
    await TestBed.configureTestingModule({
      imports: [Offers],
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

  it('asks a guest to sign in (returning to Offers) and does not call the offers API', async () => {
    await open();

    expect(root.querySelector('h1')?.textContent).toContain('Offers & Discounts');
    expect(text(root.querySelector('.offers__state'))).toContain('Sign in to see your offers');
    expect(root.querySelector('.offers__state a')?.getAttribute('href')).toBe('/auth/login?returnUrl=%2Foffers');
    expect(cards()).toHaveLength(0);
  });

  it('tells a signed-in seller that offers are for customer accounts, without calling the API', async () => {
    signIn('SELLER');
    await open();

    expect(text(root.querySelector('.offers__state'))).toContain('Offers are for customer accounts');
    expect(root.querySelector('.offers__state a')).toBeNull();
  });

  it('loads a customer\'s offers once, shows one card per OFFER_ID and leaves out inactive offers', async () => {
    signIn('CUSTOMER');
    await open();
    expect(text(root.querySelector('[role="status"]'))).toContain('Loading offers');

    const request = http.expectOne(OFFERS_URL);
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'SUCCESS', data: OFFER_ROWS });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(titles()).toEqual(['Diwali Special Offer', 'Tissue Saver', 'October Audio Week']);
    const [diwali, saver, audio] = cards();
    // Percentage with a cap: both of its products, its one category.
    expect(text(diwali.querySelector('.offer__promo h2'))).toBe('DIWALI2028');
    expect(text(diwali.querySelector('.offer__save'))).toBe('Save Up To ₹200');
    expect(text(diwali.querySelector('.offer__tagline'))).toBe('On Electronics');
    const details = (card: HTMLElement): string[][] =>
      Array.from(card.querySelectorAll('.offer__details > div'), (cell) => [text(cell.querySelector('dt')), text(cell.querySelector('dd'))]);
    expect(details(diwali)).toEqual([
      ['Offer Type', 'Percentage'],
      ['Discount Value', '20%'],
      ['Min. Order Amount', '₹500'],
      ['Max. Discount', '₹200'],
      ['Start Date', '20 Nov 2026'],
      ['End Date', '31 Dec 2026'],
      // The first product and how many more; the full list opens with the arrow.
      ['Applicable Products', 'Realme Narzo 70 + 1 more'],
      ['Applicable Categories', 'Electronics'],
    ]);
    expect(text(diwali.querySelector('app-badge'))).toBe('Active');

    // Fixed amount without a cap, not started yet.
    expect(text(saver.querySelector('.offer__save'))).toBe('Save ₹50');
    expect(details(saver).slice(0, 4)).toEqual([
      ['Offer Type', 'Fixed Amount'],
      ['Discount Value', '₹50'],
      ['Min. Order Amount', '₹300'],
      ['Max. Discount', '—'],
    ]);
    expect(text(saver.querySelector('app-badge'))).toBe('Upcoming');
    expect(text(audio.querySelector('app-badge'))).toBe('Expired');
    expect(root.textContent).not.toContain('Withdrawn Offer');
    expect(root.textContent).not.toContain('FESTIVE20');
  });

  // CHANGED: the card's arrow opens the offer's products as product cards (/offers/<OFFER_ID>).
  it('links each card\'s arrow to its own offer\'s products, without loading anything on the listing', async () => {
    await openWithOffers(OFFER_ROWS);
    const arrows = cards().map((card) => card.querySelector('.offer__go')!);
    expect(arrows.map((arrow) => arrow.getAttribute('href'))).toEqual(['/offers/6', '/offers/7', '/offers/8']);
    expect(arrows[0].getAttribute('aria-label')).toBe('View products of Diwali Special Offer');
    expect(root.querySelector('.offer__panel')).toBeNull();
  });

  it('shows the API error with Try again, and loads the offers again', async () => {
    signIn('CUSTOMER');
    await open();
    http.expectOne(OFFERS_URL).flush(
      { status: 'FAILED', message: 'Offers are unavailable.' },
      { status: 500, statusText: 'Server Error' },
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(text(root.querySelector('app-alert'))).toContain('Offers are unavailable.');
    expect(TestBed.inject(ToastService).current()).toEqual({ type: 'error', message: 'Offers are unavailable.' });

    (root.querySelector('.offers__retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(OFFERS_URL).flush({ status: 'SUCCESS', data: OFFER_ROWS });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('app-alert')).toBeNull();
    expect(cards()).toHaveLength(3);
  });

  it('shows an empty state without the toolbar when there are no offers', async () => {
    await openWithOffers([]);
    expect(text(root.querySelector('.offers__state'))).toContain('No offers right now');
    expect(root.querySelector('.offers__tools')).toBeNull();
  });

  it('searches offers by name, code, product or category', async () => {
    await openWithOffers(OFFER_ROWS);

    await searchFor('nord');
    expect(titles()).toEqual(['Diwali Special Offer']);
    await searchFor('save50');
    expect(titles()).toEqual(['Tissue Saver']);
    await searchFor('audio');
    expect(titles()).toEqual(['October Audio Week']);

    await searchFor('nothing like this');
    expect(text(root.querySelector('.offers__state'))).toContain('No matching offers');
    (root.querySelector('.offers__state button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(cards()).toHaveLength(3);
  });

  it('filters by the offer types the API uses and by status', async () => {
    await openWithOffers(OFFER_ROWS);
    const typeOptions = Array.from(selectFor('Offer type').options, (option) => text(option));
    expect(typeOptions).toEqual(['All types', 'Percentage', 'Fixed Amount']);

    await choose('Offer type', 'FIXED_AMOUNT');
    expect(titles()).toEqual(['Tissue Saver']);
    await choose('Offer type', '');
    await choose('Status', 'Expired');
    expect(titles()).toEqual(['October Audio Week']);
  });

  it('sorts by end date (expired last), start date or name', async () => {
    await openWithOffers(OFFER_ROWS);

    await choose('Sort by', 'ending');
    expect(titles()).toEqual(['Tissue Saver', 'Diwali Special Offer', 'October Audio Week']);
    await choose('Sort by', 'newest');
    expect(titles()).toEqual(['Tissue Saver', 'Diwali Special Offer', 'October Audio Week']);
    await choose('Sort by', 'name');
    expect(titles()).toEqual(['Diwali Special Offer', 'October Audio Week', 'Tissue Saver']);
    await choose('Sort by', 'featured');
    expect(titles()).toEqual(['Diwali Special Offer', 'Tissue Saver', 'October Audio Week']);
  });

  it('pages through the offers five at a time (counting offers, not product rows) and goes back to page 1 when the search changes', async () => {
    // 7 offers with two product rows each: 14 rows, 7 offers.
    await openWithOffers(manyOffers(7).flatMap((offerRow) => [
      offerRow,
      { ...offerRow, PRODUCT_ID: Number(offerRow['PRODUCT_ID']) + 1000, PRODUCT_NAME: `${String(offerRow['PRODUCT_NAME'])} Plus` },
    ]));
    expect(titles()).toEqual(['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4', 'Offer 5']);
    expect(text(root.querySelector('.pagination__summary'))).toBe('Showing 1–5 of 7 offers');

    Array.from(root.querySelectorAll<HTMLButtonElement>('.pagination__nav button')).find((button) => text(button) === '2')!.click();
    fixture.detectChanges();
    expect(titles()).toEqual(['Offer 6', 'Offer 7']);

    await searchFor('offer');
    expect(titles()).toEqual(['Offer 1', 'Offer 2', 'Offer 3', 'Offer 4', 'Offer 5']);
    await searchFor('offer 7');
    expect(titles()).toEqual(['Offer 7']);
    expect(root.querySelector('app-pagination')).toBeNull();
  });

  it('gives the cards on screen different colour themes', async () => {
    await openWithOffers(manyOffers(5));
    expect(new Set(cards().map((card) => card.getAttribute('data-theme'))).size).toBe(5);
  });

  it('copies the coupon code and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await openWithOffers(OFFER_ROWS);

    (root.querySelector('.offer__copy') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith('DIWALI2028');
    expect(root.querySelector('.offer [role="status"]')?.textContent).toContain('Code copied');
  });
});
