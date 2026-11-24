import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@core/config/api.config';
import { AuthService } from '@core/services/auth.service';
import { HomeShowcases } from './home-showcases';

// CHANGED (new): the Home page products come from this products/get request.
const HOME_PRODUCTS_URL =
  '/api/products/get?PRODUCT_ID=-1&CATEGORY_ID=-1&BRAND_ID=-1&SELLER_ID=-1&STATUS=ACTIVE&LIMIT=10&OFFSET=0';

/** A category shelf sends the same request with its own CATEGORY_ID and the shelf size (LIMIT=8). */
function shelfUrl(categoryId: number): string {
  return `/api/products/get?PRODUCT_ID=-1&CATEGORY_ID=${categoryId}&BRAND_ID=-1&SELLER_ID=-1&STATUS=ACTIVE&LIMIT=8&OFFSET=0`;
}

const BEST_DEALS = 'section[aria-labelledby="best-deals-heading"]';
const RECOMMENDED = 'section[aria-labelledby="recommended-heading"]';

describe('HomeShowcases', () => {
  let fixture: ComponentFixture<HomeShowcases>;
  let http: HttpTestingController;

  /** Product names shown by the product cards of one section. */
  // CHANGED: read from the card text; a card without a usable image shows a placeholder instead of an <img>.
  const productNames = (section: string): string[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll(`${section} app-product-card`) as NodeListOf<HTMLElement>,
      (card) => (card.querySelector('.product-card__details h2') ?? card.querySelector('.product-card__details > p'))
        ?.textContent?.trim() ?? '',
    );
  const text = (selector: string): string =>
    (fixture.nativeElement.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>, (element) =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [HomeShowcases],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HomeShowcases);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('calls the new products request once on load and shows its products', () => {
    expect(text('.product-state')).toContain('Loading products');

    // expectOne fails if the old unfiltered products/get is also requested.
    const request = http.expectOne((candidate) => candidate.url.endsWith('/products/get'));
    expect(request.request.method).toBe('GET');
    expect(request.request.urlWithParams).toBe(HOME_PRODUCTS_URL);
    request.flush({
      status: 'SUCCESS',
      data: [
        { PRODUCT_ID: 3, PRODUCT_NAME: 'Galaxy S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', DISCOUNT: '5000.00', STOCK_QUANTITY: 5, IS_ACTIVE: 1 },
        { PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse', PRICE: '749.00', SELLING_PRICE: '749.00', DISCOUNT: '0.00', STOCK_QUANTITY: 9, IS_ACTIVE: 1 },
        { PRODUCT_ID: 6, PRODUCT_NAME: 'Headphones', PRICE: '4000.00', SELLING_PRICE: '3000.00', DISCOUNT: '1000.00', STOCK_QUANTITY: 2, IS_ACTIVE: 1 },
        { PRODUCT_ID: 5, PRODUCT_NAME: 'Retired item', SELLING_PRICE: '10.00', STOCK_QUANTITY: 1, IS_ACTIVE: 0 },
      ],
    });
    fixture.detectChanges();

    expect(productNames(BEST_DEALS)).toEqual(['Galaxy S25', 'Wireless Mouse', 'Headphones']);
    expect(productNames(RECOMMENDED)).toEqual(['Wireless Mouse', 'Headphones', 'Galaxy S25']);
    expect(text(BEST_DEALS)).toContain('6% OFF');
    expect(text(BEST_DEALS)).toContain('25% OFF');
    const cards = Array.from(fixture.nativeElement.querySelectorAll(`${BEST_DEALS} app-product-card`)) as HTMLElement[];
    expect(cards[0].querySelector('strong')?.textContent?.trim()).toContain('₹75,000');
    expect(cards[0].querySelector('del')?.textContent?.trim()).toContain('₹80,000');
    expect(cards[1].querySelector('.product-card__price span')).toBeNull();
    expect(cards[1].querySelector('del')).toBeNull();
    expect(cards[2].querySelector('.product-card__price span')?.textContent?.trim()).toBe('25% OFF');
  });

  // The badge comes from PRICE (MRP) and SELLING_PRICE; DISCOUNT is 0.00 on live products, so it is not used.
  it('computes each badge from PRICE and SELLING_PRICE and never shows a 0% OFF badge', () => {
    http.expectOne(HOME_PRODUCTS_URL).flush({
      status: true,
      data: [
        { PRODUCT_ID: 18, PRODUCT_NAME: 'tissuee', PRICE: '80.00', SELLING_PRICE: '70.00', DISCOUNT: '0.00', STOCK_QUANTITY: 3 },
        { PRODUCT_ID: 22, PRODUCT_NAME: 'OnePlus Nord CE 4', PRICE: '4999.00', SELLING_PRICE: '340.00', DISCOUNT: '0.00', STOCK_QUANTITY: 3 },
        { PRODUCT_ID: 30, PRODUCT_NAME: 'Tiny Markdown', PRICE: '1000.00', SELLING_PRICE: '999.00', DISCOUNT: '0.00', STOCK_QUANTITY: 3 },
      ],
    });
    fixture.detectChanges();

    const cards = Array.from(fixture.nativeElement.querySelectorAll(`${BEST_DEALS} app-product-card`)) as HTMLElement[];
    const badge = (card: HTMLElement) => card.querySelector('.product-card__price span')?.textContent?.trim() ?? null;
    // 12.5% rounds to 13%; 93.2% to 93%.
    expect(badge(cards[0])).toBe('13% OFF');
    expect(badge(cards[1])).toBe('93% OFF');
    // 0.1% would round to "0% OFF": no badge and no struck MRP.
    expect(badge(cards[2])).toBeNull();
    expect(cards[2].querySelector('del')).toBeNull();
  });

  it('shows the API error and retries the same request', () => {
    http.expectOne(HOME_PRODUCTS_URL).flush(
      { message: 'Products are unavailable.' },
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();
    expect(text('app-alert')).toContain('Products are unavailable.');

    (fixture.nativeElement.querySelector('.product-state__retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(HOME_PRODUCTS_URL).flush({
      status: 'SUCCESS',
      data: [{ PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse', SELLING_PRICE: '749.00', STOCK_QUANTITY: 9 }],
    });
    fixture.detectChanges();

    expect(productNames(BEST_DEALS)).toEqual(['Wireless Mouse']);
  });

  it('loads each category shelf with the new request and its CATEGORY_ID, skipping empty categories', () => {
    http.expectOne(HOME_PRODUCTS_URL).flush({
      status: 'SUCCESS',
      data: [{ PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse', SELLING_PRICE: '749.00', STOCK_QUANTITY: 9 }],
    });
    fixture.componentRef.setInput('categories', [
      { id: '31', label: 'Housewares' },
      { id: '44', label: 'Outdoor' },
    ]);
    fixture.detectChanges();

    http.expectOne(shelfUrl(31)).flush({
      status: 'SUCCESS',
      data: [
        { PRODUCT_ID: 7, PRODUCT_NAME: 'Steel Kettle', SELLING_PRICE: '1200.00', CATEGORY_ID: 31, IS_ACTIVE: 1 },
        { PRODUCT_ID: 8, PRODUCT_NAME: 'Retired Pan', SELLING_PRICE: '300.00', CATEGORY_ID: 31, IS_ACTIVE: 0 },
      ],
    });
    http.expectOne(shelfUrl(44)).flush({ status: 'SUCCESS', data: [] });
    fixture.detectChanges();

    expect(texts('.category-shelf__title')).toEqual(['Housewares']);
    expect(texts('.category-shelf__item strong')).toEqual(['Steel Kettle']);
  });

  // CHANGED: the Home page cards have no wishlist heart, so a customer's Home reads no cart rows for it.
  it('shows no wishlist heart on the product cards, and makes no wishlist or cart calls for a customer', () => {
    // The Home page request (cached, so the customer's Home below reuses it).
    http.expectOne(HOME_PRODUCTS_URL).flush({
      status: 'SUCCESS',
      data: [
        { PRODUCT_ID: 18, PRODUCT_NAME: 'tissuee', SELLING_PRICE: '70.00', PRICE: '80.00', STOCK_QUANTITY: 3, IS_ACTIVE: 'ACTIVE' },
        { PRODUCT_ID: 17, PRODUCT_NAME: 'Wireless Mosue', SELLING_PRICE: '2000.00', STOCK_QUANTITY: 67, IS_ACTIVE: 'ACTIVE' },
      ],
    });
    TestBed.inject(AuthService).setSession(
      { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
      `header.${btoa(JSON.stringify({ USER_ID: 3, CUSTOMER_ID: 1 })).replace(/=/g, '')}.signature`,
    );
    const customerFixture = TestBed.createComponent(HomeShowcases);
    customerFixture.detectChanges();

    for (const section of [BEST_DEALS, RECOMMENDED]) {
      expect(customerFixture.nativeElement.querySelectorAll(`${section} app-product-card`)).toHaveLength(2);
      expect(customerFixture.nativeElement.querySelector(`${section} .product-card__wishlist`)).toBeNull();
      expect(customerFixture.nativeElement.querySelector(`${section} [aria-label="Add to wishlist"]`)).toBeNull();
    }
    http.expectNone((request) => request.url.includes('/shopping_cart/') || request.url.includes('/wishlist/'));
    customerFixture.destroy();
  });

  it('shows the empty state when the API returns no products', () => {
    http.expectOne(HOME_PRODUCTS_URL).flush({ status: 'SUCCESS', data: [] });
    fixture.detectChanges();

    expect(text('.product-state')).toBe('There are no products to display right now.');
  });

  // CHANGED (new): each product shows the signed S3 URL of its own PRODUCT_IMAGE, like the All Products table.
  describe('product images', () => {
    const SIGNED = (key: string, version = 1) =>
      `https://bucket.s3.ap-south-1.amazonaws.com/${key}?X-Amz-Signature=sig${version}`;
    const signedResponse = (key: string, version = 1) => ({
      success: true, folderName: key.split('/')[0], fileName: key.split('/')[1], imageKey: key,
      imageUrl: SIGNED(key, version), expiresIn: 3600,
    });
    const PHONE_KEY = 'products/9210035e12d5f8ee185b4b73febb919f.png';
    const TV_KEY = 'images/bc4be536708a4a133f9c18b99217ba51.png';
    const LEGACY_PATH = 'uploads/products/Screenshot 2026-10-21 154159.png';
    const HOME_DATA = [
      { PRODUCT_ID: 21, PRODUCT_NAME: 'iPhone 16 Pro', SELLING_PRICE: '2000.00', STOCK_QUANTITY: 5, PRODUCT_IMAGE: PHONE_KEY },
      { PRODUCT_ID: 20, PRODUCT_NAME: 'Galaxy TV', SELLING_PRICE: '3000.00', STOCK_QUANTITY: 5, PRODUCT_IMAGE: TV_KEY },
      { PRODUCT_ID: 16, PRODUCT_NAME: 'Old Laptop', SELLING_PRICE: '1000.00', STOCK_QUANTITY: 5, PRODUCT_IMAGE: LEGACY_PATH },
      { PRODUCT_ID: 17, PRODUCT_NAME: 'No Image Mouse', SELLING_PRICE: '500.00', STOCK_QUANTITY: 5, PRODUCT_IMAGE: null },
    ];
    /** Each card's image in one section: its src, or "loading" / "no image" for the placeholder. */
    const cardImages = (section: string): (string | null)[] =>
      Array.from(
        fixture.nativeElement.querySelectorAll(`${section} .product-card__image > *`) as NodeListOf<HTMLElement>,
        (cell) => cell instanceof HTMLImageElement
          ? cell.getAttribute('src')
          : cell.classList.contains('is-loading') ? 'loading' : 'no image',
      );
    const cardImageOf = (section: string, name: string): HTMLElement =>
      fixture.nativeElement.querySelector(`${section} app-product-card img[alt="${name}"]`) as HTMLElement;

    function loadHome(): void {
      http.expectOne(HOME_PRODUCTS_URL).flush({ status: 'SUCCESS', data: HOME_DATA });
      fixture.detectChanges();
    }

    function flushImages(keys: string[], version = 1): void {
      for (const key of keys) http.expectOne(`/api/s3/images/${key}`).flush(signedResponse(key, version));
      fixture.detectChanges();
    }

    it('shows each product its own S3 image in Best Deals and Recommended Items, with one request per key', () => {
      loadHome();
      expect(cardImages(BEST_DEALS)).toEqual(['loading', 'loading', `/${LEGACY_PATH}`, 'no image']);

      flushImages([PHONE_KEY, TV_KEY]);

      expect(cardImages(BEST_DEALS)).toEqual([SIGNED(PHONE_KEY), SIGNED(TV_KEY), `/${LEGACY_PATH}`, 'no image']);
      // Recommended Items sorts the same products by price: same images, no second request.
      expect(productNames(RECOMMENDED)).toEqual(['No Image Mouse', 'Old Laptop', 'iPhone 16 Pro', 'Galaxy TV']);
      expect(cardImages(RECOMMENDED)).toEqual(['no image', `/${LEGACY_PATH}`, SIGNED(PHONE_KEY), SIGNED(TV_KEY)]);
      expect(fixture.nativeElement.querySelectorAll('img[src="/images/latest-gadgets.svg"]').length).toBe(0);
      const placeholder = fixture.nativeElement.querySelector(`${BEST_DEALS} .product-card__placeholder`) as HTMLElement;
      expect(placeholder.getAttribute('role')).toBe('img');
      expect(placeholder.getAttribute('aria-label')).toBe('No image for No Image Mouse');
    });

    it('shows shelf items their own images and reuses URLs the Home products already loaded', () => {
      loadHome();
      flushImages([PHONE_KEY, TV_KEY]);
      fixture.componentRef.setInput('categories', [{ id: '3', label: 'Electronics' }]);
      fixture.detectChanges();
      http.expectOne(shelfUrl(3)).flush({
        status: 'SUCCESS',
        data: [
          { PRODUCT_ID: 21, PRODUCT_NAME: 'iPhone 16 Pro', SELLING_PRICE: '2000.00', PRODUCT_IMAGE: PHONE_KEY },
          { PRODUCT_ID: 22, PRODUCT_NAME: 'OnePlus Nord', SELLING_PRICE: '340.00', PRODUCT_IMAGE: 'products/eaccde8a263beb0d630e83a3407f9684.png' },
        ],
      });
      fixture.detectChanges();

      // Only the key not loaded yet is requested.
      flushImages(['products/eaccde8a263beb0d630e83a3407f9684.png']);
      const shelfImages = Array.from(
        fixture.nativeElement.querySelectorAll('.category-shelf__item img') as NodeListOf<HTMLImageElement>,
        (image) => [image.alt, image.getAttribute('src')],
      );
      expect(shelfImages).toEqual([
        ['iPhone 16 Pro', SIGNED(PHONE_KEY)],
        ['OnePlus Nord', SIGNED('products/eaccde8a263beb0d630e83a3407f9684.png')],
      ]);
    });

    it('never sends a legacy path to the S3 API and shows the placeholder when its file is missing', () => {
      loadHome();
      flushImages([PHONE_KEY, TV_KEY]);
      http.expectNone((request) => request.url.includes('/s3/images/uploads'));

      cardImageOf(BEST_DEALS, 'Old Laptop').dispatchEvent(new Event('error'));
      fixture.detectChanges();

      expect(cardImages(BEST_DEALS)[2]).toBe('no image');
      expect(cardImages(RECOMMENDED)[1]).toBe('no image');
    });

    it('gets one fresh URL when an image fails to display, then shows the placeholder', () => {
      loadHome();
      flushImages([PHONE_KEY, TV_KEY]);

      cardImageOf(BEST_DEALS, 'iPhone 16 Pro').dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(cardImages(BEST_DEALS)[0]).toBe('loading');
      flushImages([PHONE_KEY], 2);
      expect(cardImages(BEST_DEALS)[0]).toBe(SIGNED(PHONE_KEY, 2));

      cardImageOf(BEST_DEALS, 'iPhone 16 Pro').dispatchEvent(new Event('error'));
      fixture.detectChanges();
      http.expectNone((request) => request.url.includes('/s3/images/'));
      expect(cardImages(BEST_DEALS)[0]).toBe('no image');
      expect(cardImages(BEST_DEALS)[1]).toBe(SIGNED(TV_KEY));
    });

    it('shows the placeholder when the image API fails', () => {
      loadHome();
      http.expectOne(`/api/s3/images/${PHONE_KEY}`).flush('Server error', { status: 500, statusText: 'Server Error' });
      flushImages([TV_KEY]);

      expect(cardImages(BEST_DEALS).slice(0, 2)).toEqual(['no image', SIGNED(TV_KEY)]);
    });
  });
});
