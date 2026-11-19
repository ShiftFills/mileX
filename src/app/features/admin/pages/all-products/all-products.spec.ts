// CHANGED: category lookups now expect '/all_category/get' (was '/category_management/get') and no longer check CATEGORY_ID=-1.
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { AllProducts } from './all-products';

// CHANGED (new): Variants dialog request and rows (the first row follows the sample API response).
function variantUrl(productId: number): string {
  return `/api/product_variant/get?PRODUCT_ID=${productId}&VARIANT_ID=-1&LIMIT=10&OFFSET=0`;
}

const PRODUCT_4_VARIANTS = {
  status: 'SUCCESS',
  message: 'Product variant details fetched successfully',
  data: [
    {
      VARIANT_ID: 25, VARIANT_NAME: 'Green product', SKU: 'SKU00025', BARCODE: null,
      SIZE: null, SIZE_NAME: null, COLOR: null, COLOUR_NAME: null, MATERIAL: null, MATERIAL_NAME: null,
      WEIGHT: null, PRICE: '6000.00', STOCK_QUANTITY: 67, VARIANT_IMAGE: 'Screenshot 2026-10-21 175522.png',
      PRODUCT_ID: 4, SELLER_ID: 49, SELLER_NAME: 'Arun Kumar', STATUS: 'ACTIVE',
    },
    {
      VARIANT_ID: 26, VARIANT_NAME: 'Black Leather', SKU: 'SKU00026', BARCODE: '8901234',
      SIZE: 2, SIZE_NAME: 'M', COLOR: 4, COLOUR_NAME: 'Black', MATERIAL: 3, MATERIAL_NAME: 'Leather',
      WEIGHT: '0.25', PRICE: '899.50', STOCK_QUANTITY: 0, VARIANT_IMAGE: null,
      PRODUCT_ID: 4, SELLER_ID: 49, SELLER_NAME: 'Arun Kumar', STATUS: 'INACTIVE',
    },
    {
      VARIANT_ID: 27, VARIANT_NAME: 'Another product variant', SKU: 'SKU00027', PRICE: '10.00',
      STOCK_QUANTITY: 1, PRODUCT_ID: 9, STATUS: 'ACTIVE',
    },
  ],
};

interface ProductRow {
  id: number;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: number | null;
  status: 'Active' | 'Inactive' | 'Unknown';
  image: string;
}

interface ProductForm {
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: string;
  status: ProductRow['status'];
}

interface AllProductsHarness {
  products: WritableSignal<ProductRow[]>;
  visibleRows(): ProductRow[];
  loadStatus(): 'loading' | 'success' | 'error';
  loadError(): string | null;
  totalProducts(): number;
  page(): number;
  pageSize(): number;
  editingProduct(): ProductRow | null;
  editForm: WritableSignal<ProductForm | null>;
  editError(): string;
  openEdit(product: ProductRow): void;
  toggleActionMenu(id: number): void;
  openActionMenuId(): number | null;
  saveEdit(): void;
  closeEdit(): void;
  setQuery(event: Event): void;
  setCategory(event: Event): void;
  setBrand(event: Event): void;
  setStatus(status: 'All' | 'Active' | 'Inactive'): void;
  categoryLookup(): { status: string; options: { id: string; label: string }[]; error: string | null };
  brandLookup(): { status: string; options: { id: string; label: string }[]; error: string | null };
  retryCategoryLookup(): void;
}

const API_PRODUCTS = [
  {
    PRODUCT_ID: 3,
    PRODUCT_NAME: 'Samsung Galaxy S25',
    PRODUCT_CODE_SKU: 'SKU0003',
    CATEGORY_ID: 1,
    BRAND_ID: 1,
    PRODUCT_DESCRIPTION: 'Samsung smartphone',
    SELLING_PRICE: '2500.00',
    PRICE: '3000.00',
    STOCK_QUANTITY: 100,
    IS_ACTIVE: 'ACTIVE',
    IMAGE_URL: 'https://example.test/galaxy.jpg',
  },
  {
    PRODUCT_ID: 4,
    PRODUCT_NAME: 'Wireless Mouse',
    PRODUCT_CODE_SKU: 'SKU0004',
    CATEGORY_ID: 2,
    BRAND_ID: 2,
    SELLING_PRICE: '749.00',
    STOCK_QUANTITY: 0,
    IS_ACTIVE: 'INACTIVE',
  },
];

function response(
  data: Record<string, unknown>[],
  totalRecords = data.length,
  currentPage = 1,
  limit = 5,
) {
  return {
    status: 'SUCCESS',
    message: 'Products fetched successfully',
    data,
    pagination: {
      totalRecords,
      currentPage,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
}

/** Access token whose claims carry the given USER_ID (decoded by AuthService.userId()). */
function tokenFor(userId: number): string {
  return `header.${btoa(JSON.stringify({ USER_ID: userId })).replace(/=/g, '')}.signature`;
}

function selectEvent(value: string): Event {
  const select = document.createElement('select');
  const option = document.createElement('option');
  option.value = value;
  select.append(option);
  select.value = value;
  return { target: select } as unknown as Event;
}

function inputEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
}

describe('AllProducts', () => {
  let fixture: ComponentFixture<AllProducts>;
  let component: AllProductsHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllProducts],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AllProducts);
    component = fixture.componentInstance as unknown as AllProductsHarness;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadLookups(): void {
    fixture.detectChanges();
    http.expectOne((req) =>
      req.url.endsWith('/all_category/get') &&
      req.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [
        { CATEGORY_ID: 1, CATEGORY_NAME: 'Electronics' },
        { CATEGORY_ID: 2, CATEGORY_NAME: 'Home' },
      ],
    });
    http.expectOne((req) =>
      req.url.endsWith('/brand_management/get') &&
      req.method === 'GET' &&
      req.params.get('BRAND_ID') === '-1' &&
      req.params.get('CATEGORY_ID') === null &&
      req.params.get('SUB_CATEGORY_ID') === null,
    ).flush({
      status: 'SUCCESS',
      data: [
        { BRAND_ID: 1, BRAND_NAME: 'Samsung' },
        { BRAND_ID: 2, BRAND_NAME: 'MileX' },
      ],
    });
    fixture.detectChanges();
  }

  function loadFirstPage(total = 12): void {
    loadLookups();
    // CHANGED: the Admin request carries CATEGORY_ID/BRAND_ID (-1 = all) and starts on STATUS=ACTIVE.
    const request = http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.method === 'GET' &&
      req.params.get('PRODUCT_ID') === '-1' &&
      req.params.get('CATEGORY_ID') === '-1' &&
      req.params.get('BRAND_ID') === '-1' &&
      req.params.get('SELLER_ID') === null &&
      req.params.get('STATUS') === 'ACTIVE' &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    );
    request.flush(response(API_PRODUCTS, total));
    fixture.detectChanges();
  }

  /** Status tab labels with whitespace collapsed, e.g. "All Products (12)". */
  function tabLabels(): (string | undefined)[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.product-tabs button') as NodeListOf<HTMLButtonElement>,
      (tab) => tab.textContent?.replace(/\s+/g, ' ').trim(),
    );
  }

  // CHANGED (new): Seller login lists only the logged-in seller's products with the same table and controls.
  describe('for a Seller login', () => {
    beforeEach(() => {
      TestBed.inject(AuthService).setSession(
        { id: '60', email: '', firstName: 'Seller', lastName: '', userType: 'SELLER' },
        tokenFor(60),
      );
    });

    afterEach(() => TestBed.inject(AuthService).clearSession());

    /** The seller record lookup that turns the logged-in USER_ID into its SELLER_ID. */
    function resolveSeller(sellerId = 44): void {
      http.expectOne((req) =>
        req.url.endsWith('/seller_onboarding/get') && req.params.get('USER_ID') === '60',
      ).flush({
        STATUS: 'SUCCESS',
        DATA: [{ USER_ID: 60, SELLER_ID: sellerId, SELLER_STATUS: 'ACTIVE' }],
      });
    }

    // CHANGED: the Seller request is the Admin request plus SELLER_ID.
    // CHANGED: STATUS defaults to ACTIVE (the Seller's first tab); pass `status: null` for no STATUS ("All").
    function expectSellerPage(
      sellerId: number,
      limit: number,
      offset: number,
      filters: { category?: string; brand?: string; status?: string | null } = {},
    ) {
      return http.expectOne((req) =>
        req.url.endsWith('/products/get') &&
        req.method === 'GET' &&
        req.params.get('PRODUCT_ID') === '-1' &&
        req.params.get('CATEGORY_ID') === (filters.category ?? '-1') &&
        req.params.get('BRAND_ID') === (filters.brand ?? '-1') &&
        req.params.get('SELLER_ID') === String(sellerId) &&
        req.params.get('STATUS') === (filters.status === undefined ? 'ACTIVE' : filters.status) &&
        req.params.get('LIMIT') === String(limit) &&
        req.params.get('OFFSET') === String(offset),
      );
    }

    it('requests only the logged-in seller\'s products by SELLER_ID and shows them in the table', () => {
      loadLookups();
      resolveSeller(44);
      const request = expectSellerPage(44, 5, 0);
      // CHANGED: STATUS=ACTIVE is sent with the Seller's first request.
      expect(request.request.urlWithParams).toBe(
        '/api/products/get?PRODUCT_ID=-1&CATEGORY_ID=-1&BRAND_ID=-1&SELLER_ID=44&STATUS=ACTIVE&LIMIT=5&OFFSET=0',
      );
      request.flush(response(API_PRODUCTS, 7));
      fixture.detectChanges();

      expect(component.loadStatus()).toBe('success');
      expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);
      expect(fixture.nativeElement.textContent).toContain('of 7 products');
    });

    // CHANGED (new): the Seller starts on the Active tab; the other tabs still work.
    it('starts on the Active tab with STATUS=ACTIVE and still lets the seller switch to All', () => {
      loadLookups();
      resolveSeller(44);
      expectSellerPage(44, 5, 0).flush(response([API_PRODUCTS[0]], 1));
      fixture.detectChanges();

      expect(tabLabels()).toEqual(['All Products', 'Active (1)', 'Inactive']);
      expect(fixture.nativeElement.querySelector('.product-tabs button.is-active')?.textContent).toContain('Active');
      expect(component.visibleRows().map((row) => row.status)).toEqual(['Active']);

      component.setStatus('All');
      fixture.detectChanges();
      expectSellerPage(44, 5, 0, { status: null }).flush(response(API_PRODUCTS, 2));
      fixture.detectChanges();
      expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);
    });

    it('uses whichever SELLER_ID the logged-in seller resolves to', () => {
      loadLookups();
      resolveSeller(57);
      expectSellerPage(57, 5, 0).flush(response([], 0));
      fixture.detectChanges();

      expect(component.loadStatus()).toBe('success');
    });

    it('paginates and changes page size with the same SELLER_ID, resolving the seller only once', () => {
      loadLookups();
      resolveSeller(44);
      expectSellerPage(44, 5, 0).flush(response(API_PRODUCTS, 12));
      fixture.detectChanges();

      (fixture.nativeElement.querySelector(
        '.pagination__nav button[aria-label="Next page"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      expectSellerPage(44, 5, 5).flush(response([API_PRODUCTS[0]], 12, 2, 5));
      fixture.detectChanges();
      expect(component.page()).toBe(2);
      expect(fixture.nativeElement.textContent).toContain('Showing 6–10 of 12 products');

      const select = fixture.nativeElement.querySelector('#admin-product-page-size') as HTMLSelectElement;
      select.value = '10';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
      expectSellerPage(44, 10, 0).flush(response(API_PRODUCTS, 12, 1, 10));
      fixture.detectChanges();

      expect(component.pageSize()).toBe(10);
      expect(fixture.nativeElement.textContent).toContain('Showing 1–10 of 12 products');
      // The seller lookup is cached for the session, so no second seller_onboarding request is made.
      http.expectNone((req) => req.url.endsWith('/seller_onboarding/get'));
    });

    // CHANGED: category, brand and status go to the API with SELLER_ID; search filters the returned page.
    it('sends the category, brand and status filters with SELLER_ID and searches the returned page', () => {
      loadLookups();
      resolveSeller(44);
      expectSellerPage(44, 5, 0).flush(response(API_PRODUCTS, 2));
      fixture.detectChanges();

      component.setCategory(selectEvent('2'));
      component.setBrand(selectEvent('2'));
      component.setStatus('Active');
      fixture.detectChanges();
      expectSellerPage(44, 5, 0, { category: '2', brand: '2', status: 'ACTIVE' })
        .flush(response([{ ...API_PRODUCTS[1], IS_ACTIVE: 'ACTIVE' }], 1));
      fixture.detectChanges();

      expect(component.visibleRows().map((row) => row.id)).toEqual([4]);
      expect(tabLabels()).toEqual(['All Products', 'Active (1)', 'Inactive']);

      component.setQuery(inputEvent('Galaxy'));
      fixture.detectChanges();
      expect(component.visibleRows()).toEqual([]);
      // Search is client-side and the seller lookup is cached, so neither triggers another request.
      http.expectNone((req) => req.url.endsWith('/products/get') || req.url.endsWith('/seller_onboarding/get'));
    });

    it('shows an error and loads no products when the user has no seller account', () => {
      loadLookups();
      http.expectOne((req) => req.url.endsWith('/seller_onboarding/get')).flush({
        STATUS: 'SUCCESS',
        DATA: [],
      });
      fixture.detectChanges();

      expect(component.loadStatus()).toBe('error');
      expect(component.loadError()).toBe('The authenticated user does not have a valid seller account.');
      expect(component.visibleRows()).toEqual([]);
      http.expectNone((req) => req.url.endsWith('/products/get'));
    });
  });

  it('calls the paginated products API and maps actual API rows into the table', () => {
    loadFirstPage();

    // CHANGED: Admin keeps the full catalog request and never resolves a seller.
    http.expectNone((req) => req.url.endsWith('/seller_onboarding/get'));
    expect(component.loadStatus()).toBe('success');
    expect(component.totalProducts()).toBe(12);
    expect(component.visibleRows()).toEqual([
      {
        id: 3,
        name: 'Samsung Galaxy S25',
        sku: 'SKU0003',
        category: 'category-1',
        brand: 'brand-1',
        price: '₹2,500',
        stock: 100,
        status: 'Active',
        image: 'https://example.test/galaxy.jpg',
      },
      {
        id: 4,
        name: 'Wireless Mouse',
        sku: 'SKU0004',
        category: 'category-2',
        brand: 'brand-2',
        price: '₹749',
        stock: 0,
        status: 'Inactive',
        image: '/images/latest-gadgets.svg',
      },
    ]);

    const rows = fixture.nativeElement.querySelectorAll('.products-table-wrap tbody tr');
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Samsung Galaxy S25');
    expect(fixture.nativeElement.textContent).not.toContain('Wireless Earbuds');
    expect(fixture.nativeElement.textContent).toContain('of 12 products');
  });

  // CHANGED (new): Admin's first request is exactly the expected Admin API, with STATUS=ACTIVE.
  it('starts an Admin on the Active tab and sends STATUS=ACTIVE in the first request', () => {
    loadLookups();
    const request = http.expectOne((req) => req.url.endsWith('/products/get'));
    expect(request.request.urlWithParams).toBe(
      '/api/products/get?PRODUCT_ID=-1&CATEGORY_ID=-1&BRAND_ID=-1&STATUS=ACTIVE&LIMIT=5&OFFSET=0',
    );
    request.flush(response([API_PRODUCTS[0]], 12));
    fixture.detectChanges();

    const selectedTab = fixture.nativeElement.querySelector('.product-tabs button[aria-selected="true"]') as HTMLButtonElement;
    expect(selectedTab.textContent?.replace(/\s+/g, ' ').trim()).toBe('Active (12)');
    expect((fixture.nativeElement.querySelector('#admin-product-status') as HTMLSelectElement).value).toBe('Active');
    expect(tabLabels()).toEqual(['All Products', 'Active (12)', 'Inactive']);

    // "All" is still available and sends no STATUS (every status), as before.
    component.setStatus('All');
    fixture.detectChanges();
    const allRequest = http.expectOne((req) => req.url.endsWith('/products/get'));
    expect(allRequest.request.urlWithParams).toBe(
      '/api/products/get?PRODUCT_ID=-1&CATEGORY_ID=-1&BRAND_ID=-1&LIMIT=5&OFFSET=0',
    );
    allRequest.flush(response(API_PRODUCTS, 20));
    fixture.detectChanges();
    expect(tabLabels()).toEqual(['All Products (20)', 'Active (1 on page)', 'Inactive (1 on page)']);
  });

  // CHANGED: category, brand and status are sent to the products API; search still filters the loaded page.
  it('loads category and brand filter options and sends the selected filters to the products API', () => {
    loadFirstPage();
    expect(tabLabels()).toEqual(['All Products', 'Active (12)', 'Inactive']);

    const categorySelect = fixture.nativeElement.querySelector('#admin-product-category') as HTMLSelectElement;
    const brandSelect = fixture.nativeElement.querySelector('#admin-product-brand') as HTMLSelectElement;
    expect(Array.from(categorySelect.options).map((option) => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'All Categories'],
      ['1', 'Electronics'],
      ['2', 'Home'],
    ]);
    expect(Array.from(brandSelect.options).map((option) => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'All Brands'],
      ['1', 'Samsung'],
      ['2', 'MileX'],
    ]);

    component.setCategory(selectEvent('2'));
    component.setBrand(selectEvent('2'));
    component.setStatus('Inactive');
    fixture.detectChanges();

    const request = http.expectOne((req) => req.url.endsWith('/products/get'));
    expect(request.request.urlWithParams).toBe(
      '/api/products/get?PRODUCT_ID=-1&CATEGORY_ID=2&BRAND_ID=2&STATUS=INACTIVE&LIMIT=5&OFFSET=0',
    );
    request.flush(response([API_PRODUCTS[1]], 1));
    fixture.detectChanges();

    expect(component.visibleRows().map((row) => row.id)).toEqual([4]);
    expect(tabLabels()).toEqual(['All Products', 'Active', 'Inactive (1)']);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–1 of 1 products');

    component.setQuery(inputEvent('Wireless'));
    fixture.detectChanges();
    expect(component.visibleRows().map((row) => row.id)).toEqual([4]);
    component.setQuery(inputEvent('Galaxy'));
    fixture.detectChanges();
    expect(component.visibleRows()).toEqual([]);
    http.expectNone((req) => req.url.endsWith('/products/get'));

    component.setCategory(selectEvent(''));
    component.setBrand(selectEvent(''));
    component.setStatus('Active');
    fixture.detectChanges();
    // Back to the first request (all categories and brands, STATUS=ACTIVE), which is still cached.
    http.expectNone((req) => req.url.endsWith('/products/get'));
    expect(component.totalProducts()).toBe(12);
  });

  // CHANGED (new): a filter change is a new API result set, so paging and the remembered total restart.
  it('restarts at page 1 for a new filter and does not reuse the previous filter\'s total', () => {
    loadFirstPage(12);
    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne((req) => req.params.get('OFFSET') === '5').flush(response([API_PRODUCTS[0]], 12, 2, 5));
    fixture.detectChanges();
    expect(component.page()).toBe(2);

    component.setStatus('Inactive');
    fixture.detectChanges();
    expect(component.page()).toBe(1);
    // A full page without pagination metadata: the total for the Inactive filter is not known yet.
    const inactivePage = Array.from({ length: 5 }, (_, index) => ({
      ...API_PRODUCTS[1],
      PRODUCT_ID: 40 + index,
      PRODUCT_NAME: `Inactive product ${index + 1}`,
    }));
    http.expectOne((req) =>
      req.params.get('STATUS') === 'INACTIVE' && req.params.get('LIMIT') === '5' && req.params.get('OFFSET') === '0',
    ).flush({ status: 'SUCCESS', data: inactivePage });
    fixture.detectChanges();

    expect(component.visibleRows()).toHaveLength(5);
    expect(component.totalProducts()).toBeUndefined();
    expect(tabLabels()).toEqual(['All Products', 'Active', 'Inactive (total unavailable)']);
    expect(fixture.nativeElement.textContent).not.toContain('of 12 products');
    expect(fixture.nativeElement.querySelector('.pagination__nav button[aria-label="Next page"]')).toBeTruthy();
  });

  it('shows lookup loading, error, and empty states and allows retrying a failed lookup', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading categories');
    expect(fixture.nativeElement.textContent).toContain('Loading brands');

    http.expectOne((req) => req.url.endsWith('/all_category/get')).flush({
      status: 'ERROR',
      message: 'Category service unavailable',
    });
    http.expectOne((req) => req.url.endsWith('/brand_management/get')).flush({
      status: 'SUCCESS',
      data: [],
    });
    http.expectOne((req) =>
      req.url.endsWith('/products/get') && req.params.get('LIMIT') === '5',
    ).flush(response([], 0));
    fixture.detectChanges();

    expect(component.categoryLookup()).toMatchObject({
      status: 'error',
      error: 'Category service unavailable',
    });
    expect(component.brandLookup()).toMatchObject({ status: 'success', options: [] });
    expect(fixture.nativeElement.textContent).toContain('Categories could not be loaded');
    expect(fixture.nativeElement.textContent).toContain('No brands available');

    component.retryCategoryLookup();
    http.expectOne((req) => req.url.endsWith('/all_category/get')).flush({
      status: 'SUCCESS',
      data: [{ CATEGORY_ID: 1, CATEGORY_NAME: 'Electronics' }],
    });
    fixture.detectChanges();

    expect(component.categoryLookup()).toMatchObject({
      status: 'success',
      options: [{ id: '1', label: 'Electronics' }],
    });
  });

  it('requests the next server page and updates the total/range from response metadata', async () => {
    loadFirstPage(12);
    const next = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement;
    next.click();
    fixture.detectChanges();

    const request = http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    );
    expect(component.loadStatus()).toBe('loading');
    request.flush(response([API_PRODUCTS[0]], 11, 2, 5));
    fixture.detectChanges();

    expect(component.page()).toBe(2);
    expect(component.visibleRows()[0].id).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Showing 6–10 of 11 products');
  });

  it('returns to page 1 from page 2 using cached API rows without another request', () => {
    loadFirstPage(12);

    const next = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement;
    next.click();
    fixture.detectChanges();

    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    ).flush(response([{
      ...API_PRODUCTS[0],
      PRODUCT_ID: 8,
      PRODUCT_NAME: 'Page two product',
    }], 12, 2, 5));
    fixture.detectChanges();
    expect(component.visibleRows().map((row) => row.name)).toEqual(['Page two product']);

    const firstPage = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-current="page"]',
    ) as HTMLButtonElement;
    expect(firstPage.textContent?.trim()).toBe('2');
    const pageButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.pagination__nav button'),
    ) as HTMLButtonElement[];
    const pageOne = pageButtons.find((button) => button.textContent?.trim() === '1');
    pageOne?.click();
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);

    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.page()).toBe(2);
    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Previous page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);
    http.expectNone((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    );
  });

  it('keeps Previous and page 1 accessible when page 2 contains records but the API total is stale', () => {
    loadFirstPage(12);
    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();

    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    ).flush(response([{
      ...API_PRODUCTS[0],
      PRODUCT_ID: 8,
      PRODUCT_NAME: 'Page two product',
    }], 5, 2, 5));
    fixture.detectChanges();

    expect(component.page()).toBe(2);
    expect(component.visibleRows().map((row) => row.name)).toEqual(['Page two product']);
    const previous = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Previous page"]',
    ) as HTMLButtonElement;
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.pagination__nav button'),
    ) as HTMLButtonElement[];
    const pageOne = buttons.find((button) => button.textContent?.trim() === '1');
    expect(previous.disabled).toBe(false);
    expect(pageOne).toBeTruthy();

    previous.click();
    fixture.detectChanges();
    expect(component.page()).toBe(1);
    expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);
  });

  it('changes page size by requesting the first page with the selected LIMIT', () => {
    loadFirstPage();
    const select = fixture.nativeElement.querySelector('#admin-product-page-size') as HTMLSelectElement;
    select.value = '10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const request = http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '10' &&
      req.params.get('OFFSET') === '0',
    );
    request.flush(response(API_PRODUCTS, 12, 1, 10));
    fixture.detectChanges();

    expect(component.pageSize()).toBe(10);
    expect(component.totalProducts()).toBe(12);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–10 of 12 products');
  });

  it('displays the live five-row response and infers the final total when the API omits metadata', () => {
    const fullPage = Array.from({ length: 5 }, (_, index) => ({
      PRODUCT_ID: 30 + index,
      PRODUCT_NAME: `Live API product ${index + 1}`,
      PRODUCT_CODE_SKU: `LIVE-${index + 1}`,
      CATEGORY_ID: 1,
      BRAND_ID: 1,
      SELLING_PRICE: '100.00',
      STOCK_QUANTITY: 10,
      IS_ACTIVE: 1,
    }));

    loadLookups();
    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    ).flush({
      status: 'SUCCESS',
      message: 'Product details fetched successfully',
      data: fullPage,
    });
    fixture.detectChanges();

    expect(component.visibleRows().map((row) => row.name)).toEqual([
      'Live API product 1',
      'Live API product 2',
      'Live API product 3',
      'Live API product 4',
      'Live API product 5',
    ]);
    expect(fixture.nativeElement.textContent).not.toContain('Wireless Earbuds');
    expect(fixture.nativeElement.textContent).toContain('Showing 1–5 products on this page');

    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    ).flush({ status: 'SUCCESS', message: 'Product details fetched successfully', data: [] });
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.totalProducts()).toBe(5);
    expect(component.visibleRows().map((row) => row.name)).toEqual([
      'Live API product 1',
      'Live API product 2',
      'Live API product 3',
      'Live API product 4',
      'Live API product 5',
    ]);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–5 of 5 products');
    expect(fixture.nativeElement.textContent).toContain(
      'Page 2 has no products. Showing page 1, the last available page.',
    );
  });

  it('keeps API errors visible and never restores demo rows', () => {
    loadLookups();
    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    ).flush({ status: 'ERROR', message: 'Products service unavailable' });
    fixture.detectChanges();

    expect(component.loadStatus()).toBe('error');
    expect(component.loadError()).toBe('Products service unavailable');
    expect(component.visibleRows()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Products service unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('Wireless Earbuds');
  });

  it('opens an edit draft prefilled with the selected API product and saves only that row', () => {
    loadFirstPage();
    const [selected, untouched] = component.visibleRows();
    component.toggleActionMenu(selected.id);
    component.openEdit(selected);

    expect(component.editingProduct()?.id).toBe(selected.id);
    expect(component.editForm()).toEqual({
      name: selected.name,
      sku: selected.sku,
      category: selected.category,
      brand: selected.brand,
      price: '2500',
      stock: String(selected.stock),
      status: selected.status,
    });

    component.editForm.update((form) => form ? {
      ...form,
      name: 'Edited Galaxy',
      price: '2999',
      stock: '75',
      status: 'Inactive',
    } : form);
    component.saveEdit();

    expect(component.products().find((product) => product.id === selected.id)).toMatchObject({
      name: 'Edited Galaxy',
      price: '₹2,999',
      stock: 75,
      status: 'Inactive',
    });
    expect(component.products().find((product) => product.id === untouched.id)).toEqual(untouched);
    expect(component.editingProduct()).toBeNull();
  });

  it('cancels without changing API rows and rejects invalid edit data', () => {
    loadFirstPage();
    const selected = component.visibleRows()[0];
    const original = component.products().find((product) => product.id === selected.id);

    component.openEdit(selected);
    component.editForm.update((form) => form ? { ...form, name: 'Unsaved name' } : form);
    component.closeEdit();
    expect(component.products().find((product) => product.id === selected.id)).toEqual(original);

    component.openEdit(selected);
    component.editForm.update((form) => form ? { ...form, stock: '-1' } : form);
    component.saveEdit();
    expect(component.editError()).toBeTruthy();
    expect(component.editingProduct()?.id).toBe(selected.id);
    expect(component.products().find((product) => product.id === selected.id)).toEqual(original);
  });

  it('closes the action menu for outside clicks', () => {
    loadFirstPage();
    const product = component.visibleRows()[0];
    const trigger = fixture.nativeElement.querySelector('.more-actions') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(component.openActionMenuId()).toBe(product.id);

    const menu = fixture.nativeElement.querySelector('.product-action-menu') as HTMLDivElement;
    menu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(component.openActionMenuId()).toBe(product.id);

    fixture.nativeElement.querySelector('h1').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(component.openActionMenuId()).toBeNull();
  });

  // CHANGED (new): the row's Variant button shows that product's variants in a dialog.
  describe('Variants dialog', () => {
    const dialog = (): HTMLElement | null => fixture.nativeElement.querySelector('.product-variants-dialog');
    const text = (element: Element | null | undefined): string =>
      (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const texts = (selector: string): string[] =>
      Array.from(dialog()?.querySelectorAll(selector) ?? [], (element) => text(element));

    /** Clicks the Variant button of the table row at `rowIndex` (row 0 = product 3, row 1 = product 4). */
    function clickVariant(rowIndex: number): void {
      const buttons = fixture.nativeElement.querySelectorAll('.product-row-actions app-button button') as NodeListOf<HTMLButtonElement>;
      buttons[rowIndex]!.click();
      fixture.detectChanges();
    }

    it('loads only the clicked row\'s variants by its PRODUCT_ID and shows the useful details', () => {
      loadFirstPage();
      clickVariant(1);

      expect(text(dialog()?.querySelector('h2'))).toBe('Product Variants');
      expect(text(dialog()?.querySelector('[role="status"]'))).toContain('Loading variants');
      http.expectOne(variantUrl(4)).flush(PRODUCT_4_VARIANTS);
      fixture.detectChanges();

      expect(text(dialog()?.querySelector('.product-edit-heading p'))).toBe('Wireless Mouse · 2 variants');
      expect(texts('.variant-item__name')).toEqual(['Green product', 'Black Leather']);
      expect(texts('.variant-item__sku')).toEqual(['SKU: SKU00025', 'SKU: SKU00026']);
      expect(texts('.variant-item__price')).toEqual(['₹6,000', '₹899.5']);
      expect(texts('.variant-item__stock')).toEqual(['Stock: 67', 'Out of stock']);
      expect(texts('.variant-item app-badge')).toEqual(['Active', 'Inactive']);
      // Size, colour and material only when available (the numeric SIZE / COLOR / MATERIAL IDs are not shown).
      const items = Array.from(dialog()!.querySelectorAll('.variant-item'));
      expect(items[0]!.querySelector('.variant-item__options')).toBeNull();
      expect(Array.from(items[1]!.querySelectorAll('.variant-item__options li'), (li) => text(li)))
        .toEqual(['Colour: Black', 'Size: M', 'Material: Leather']);
      // Seller and other internal fields are not displayed.
      expect(text(dialog())).not.toContain('Arun Kumar');
      expect(text(dialog())).not.toContain('8901234');

      const images = Array.from(dialog()!.querySelectorAll('.variant-item__image') as NodeListOf<HTMLImageElement>);
      expect(images[0]!.getAttribute('src')).toBe('/uploads/Screenshot%202026-10-21%20175522.png');
      expect(images[1]!.getAttribute('src')).toBe('/images/latest-gadgets.svg');
      images[0]!.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(images[0]!.getAttribute('src')).toBe('/images/latest-gadgets.svg');
    });

    it('reuses loaded variants when reopened, loads another product separately, and shows the empty state', () => {
      loadFirstPage();
      clickVariant(1);
      http.expectOne(variantUrl(4)).flush(PRODUCT_4_VARIANTS);
      fixture.detectChanges();

      (dialog()!.querySelector('.product-edit-close') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();

      clickVariant(1);
      http.expectNone((request) => request.url.endsWith('/product_variant/get'));
      expect(texts('.variant-item__name')).toEqual(['Green product', 'Black Leather']);

      (fixture.nativeElement.querySelector('.dialog-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();

      clickVariant(0);
      http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', message: 'No variants', data: [] });
      fixture.detectChanges();
      expect(text(dialog()?.querySelector('.variant-empty'))).toBe('This product has no variants yet.');
      expect(text(dialog()?.querySelector('.product-edit-heading p'))).toBe('Samsung Galaxy S25 · 0 variants');
    });

    it('shows the API error and retries the same product', () => {
      loadFirstPage();
      clickVariant(0);
      http.expectOne(variantUrl(3)).flush(
        { status: 'FAILED', message: 'Variants are unavailable.' },
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();
      expect(text(dialog()?.querySelector('[role="alert"]'))).toContain('Variants are unavailable.');

      (dialog()!.querySelector('[role="alert"] app-button button') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(variantUrl(3)).flush({
        status: 'SUCCESS',
        data: [{ VARIANT_ID: 30, VARIANT_NAME: 'Blue', SKU: 'SKU00030', PRICE: '2500.00', STOCK_QUANTITY: 4, PRODUCT_ID: 3, STATUS: 'ACTIVE' }],
      });
      fixture.detectChanges();
      expect(texts('.variant-item__name')).toEqual(['Blue']);
    });

    it('keeps the link to the Variants management page', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      loadFirstPage();
      clickVariant(0);
      http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', data: [] });
      fixture.detectChanges();

      const manage = Array.from(dialog()!.querySelectorAll('.product-edit-actions app-button button') as NodeListOf<HTMLButtonElement>)
        .find((button) => text(button) === 'Manage Variants');
      manage!.click();
      expect(navigate).toHaveBeenCalledWith('/admin/products/variants');
    });
  });
});