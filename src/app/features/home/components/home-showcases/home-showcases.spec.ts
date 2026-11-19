import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@core/config/api.config';
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

  /** Product names shown by the product cards of one section (the card image alt is the name). */
  const productNames = (section: string): string[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll(`${section} app-product-card img`) as NodeListOf<HTMLImageElement>,
      (image) => image.alt,
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
        { PRODUCT_ID: 3, PRODUCT_NAME: 'Galaxy S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 5, IS_ACTIVE: 1 },
        { PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse', SELLING_PRICE: '749.00', STOCK_QUANTITY: 9, IS_ACTIVE: 1 },
        { PRODUCT_ID: 5, PRODUCT_NAME: 'Retired item', SELLING_PRICE: '10.00', STOCK_QUANTITY: 1, IS_ACTIVE: 0 },
      ],
    });
    fixture.detectChanges();

    expect(productNames(BEST_DEALS)).toEqual(['Galaxy S25', 'Wireless Mouse']);
    expect(productNames(RECOMMENDED)).toEqual(['Wireless Mouse', 'Galaxy S25']);
    expect(text(BEST_DEALS)).toContain('6% OFF');
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

  it('shows the empty state when the API returns no products', () => {
    http.expectOne(HOME_PRODUCTS_URL).flush({ status: 'SUCCESS', data: [] });
    fixture.detectChanges();

    expect(text('.product-state')).toBe('There are no products to display right now.');
  });
});
