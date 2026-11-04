import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PaginatedResponse, Product } from '@shared/models';
import { ProductCatalogService } from './product-catalog.service';

describe('ProductCatalogService', () => {
  let catalog: ProductCatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    catalog = TestBed.inject(ProductCatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads category, active brand, and tax-rate dropdown options with master IDs', () => {
    let categories: unknown;
    let brands: unknown;
    let taxRates: unknown;
    catalog.loadCategories().subscribe((options) => (categories = options));
    catalog.loadBrands().subscribe((options) => (brands = options));
    catalog.loadTaxRates().subscribe((options) => (taxRates = options));

    http.expectOne(
      (request) =>
        request.url.endsWith('/category/get') &&
        request.params.get('CATEGORY_ID') === '-1' &&
        request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [{ CATEGORY_ID: 1, CATEGORY_NAME: 'Electronics' }],
    });
    http.expectOne(
      (request) =>
        request.url.endsWith('/brand_management/get') &&
        request.params.get('BRAND_ID') === '-1' &&
        request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [
        { BRAND_ID: 1, BRAND_NAME: 'Samsung', STATUS: 'Active' },
        { BRAND_ID: 2, BRAND_NAME: 'Inactive Brand', STATUS: 'Inactive' },
      ],
    });
    http.expectOne(
      (request) =>
        request.url.endsWith('/tax_rate/get') &&
        request.params.get('TAX_RATE_ID') === '-1' &&
        request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [
        { TAX_RATE_ID: 4, TAX_PERCENTAGE: 18.0 },
        { TAX_RATE_ID: 5, TAX_PERCENTAGE: '28.00' },
      ],
    });

    expect(categories).toEqual([{ id: '1', label: 'Electronics' }]);
    expect(brands).toEqual([{ id: '1', label: 'Samsung' }]);
    expect(taxRates).toEqual([
      { id: '4', label: '18%' },
      { id: '5', label: '28%' },
    ]);
  });

  it('shares each in-flight and successful master lookup request', () => {
    catalog.loadCategories().subscribe();
    catalog.loadCategories().subscribe();

    http
      .expectOne((request) => request.url.endsWith('/category/get'))
      .flush({ status: 'SUCCESS', data: [] });

    catalog.loadCategories().subscribe((options) => expect(options).toEqual([]));
    http.expectNone((request) => request.url.endsWith('/category/get'));
  });

  it('loads and maps API products, using safe defaults for missing optional fields', () => {
    catalog.load();
    catalog.load();

    http.expectOne((request) => request.url.endsWith('/products/get')).flush({
      status: 'SUCCESS',
      message: 'Product details fetched successfully',
      data: [
        {
          PRODUCT_ID: 3,
          PRODUCT_NAME: ' Samsung Galaxy S25 ',
          PRODUCT_DESCRIPTION: ' Smartphone ',
          CATEGORY_ID: 1,
          SELLING_PRICE: '75000.00',
          PRICE: '80000.00',
          STOCK_QUANTITY: 100,
          MAXIMUM_ORDER_QUANTITY: 5,
          IS_ACTIVE: 1,
        },
        {
          PRODUCT_ID: 4,
          PRODUCT_NAME: 'Wireless Mouse',
          SELLING_PRICE: '749.00',
          IS_ACTIVE: 0,
        },
      ],
    });

    expect(catalog.status()).toBe('success');
    expect(catalog.error()).toBeNull();
    expect(catalog.products()).toEqual([
      {
        id: '3',
        name: 'Samsung Galaxy S25',
        description: 'Smartphone',
        price: 75000,
        currency: 'INR',
        imageUrl: '/images/latest-gadgets.svg',
        category: 'category-1',
        inStock: true,
        isActive: true,
        stockLeft: 100,
        maxOrderQuantity: 5,
        originalPrice: 80000,
        discountLabel: '6% OFF',
      },
    ]);
  });

  it('loads a paginated product page with LIMIT and OFFSET and maps API metadata', () => {
    let response: unknown;
    catalog.loadPage(3, 5).subscribe((page) => (response = page));

    http.expectOne((request) =>
      request.url.endsWith('/products/get') &&
      request.params.get('LIMIT') === '5' &&
      request.params.get('OFFSET') === '10',
    ).flush({
      status: 'SUCCESS',
      message: 'Products fetched successfully',
      data: [
        {
          PRODUCT_ID: 13,
          PRODUCT_NAME: 'Bluetooth Speaker',
          SELLING_PRICE: '1500.00',
          STOCK_QUANTITY: 8,
          IS_ACTIVE: 1,
        },
      ],
      pagination: {
        totalRecords: 13,
        totalPages: 3,
        currentPage: 3,
        limit: 5,
      },
    });

    expect(response).toEqual({
      items: [
        {
          id: '13',
          name: 'Bluetooth Speaker',
          description: 'Product description is not available.',
          price: 1500,
          currency: 'INR',
          imageUrl: '/images/latest-gadgets.svg',
          category: 'uncategorized',
          inStock: true,
          isActive: true,
          stockLeft: 8,
        },
      ],
      total: 13,
      page: 3,
      pageSize: 5,
      totalPages: 3,
      hasNext: false,
    });
  });

  it('reuses cached paginated requests for the same page', () => {
    const results: number[] = [];
    catalog.loadPage(1, 5).subscribe((page) => results.push(page.total ?? 0));
    catalog.loadPage(1, 5).subscribe((page) => results.push(page.total ?? 0));

    http.expectOne((request) =>
      request.url.endsWith('/products/get') &&
      request.params.get('LIMIT') === '5' &&
      request.params.get('OFFSET') === '0',
    ).flush({
      status: 'SUCCESS',
      data: [],
      total: 0,
      page: 1,
      pageSize: 5,
    });

    expect(results).toEqual([0, 0]);
  });

  it('does not cache failed paginated requests so the page can be retried', () => {
    let firstError: unknown;
    catalog.loadPage(1, 5).subscribe({ error: (error: unknown) => (firstError = error) });
    http.expectOne((request) => request.params.get('LIMIT') === '5').flush(
      { status: 'ERROR', message: 'Service unavailable' },
    );
    expect(firstError).toEqual(new Error('Service unavailable'));

    let retryResult: unknown;
    catalog.loadPage(1, 5).subscribe((page) => (retryResult = page));
    http.expectOne((request) => request.params.get('LIMIT') === '5').flush({
      status: 'SUCCESS',
      data: [],
      total: 0,
      page: 1,
      pageSize: 5,
    });

    expect(retryResult).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 5,
      totalPages: 0,
      hasNext: false,
    });
  });

  it('rejects invalid pagination arguments without making an API request', () => {
    let pageError: unknown;
    let pageSizeError: unknown;
    catalog.loadPage(0, 5).subscribe({ error: (error: unknown) => (pageError = error) });
    catalog.loadPage(1, 0).subscribe({ error: (error: unknown) => (pageSizeError = error) });

    expect(pageError).toEqual(new RangeError('Page must be a positive safe integer.'));
    expect(pageSizeError).toEqual(new RangeError('Page size must be a positive safe integer.'));
    http.expectNone((request) => request.url.endsWith('/products/get'));
  });

  it('evicts least-recently-used pages and reloads an evicted page', () => {
    for (let page = 1; page <= 21; page += 1) {
      catalog.loadPage(page, 5).subscribe();
    }
    for (let page = 1; page <= 21; page += 1) {
      const offset = (page - 1) * 5;
      http.expectOne((request) =>
        request.params.get('LIMIT') === '5' && request.params.get('OFFSET') === String(offset),
      ).flush({ status: 'SUCCESS', data: [], total: 105, page, pageSize: 5 });
    }

    catalog.loadPage(1, 5).subscribe();
    http.expectOne((request) =>
      request.params.get('LIMIT') === '5' && request.params.get('OFFSET') === '0',
    ).flush({ status: 'SUCCESS', data: [], total: 105, page: 1, pageSize: 5 });
  });

  it('invalidates successful cached pages when fresh catalog data is required', () => {
    catalog.loadPage(1, 5).subscribe();
    http.expectOne((request) => request.params.get('OFFSET') === '0').flush({
      status: 'SUCCESS', data: [], total: 10, page: 1, pageSize: 5,
    });

    catalog.invalidatePageCache();
    catalog.loadPage(1, 5).subscribe();
    http.expectOne((request) => request.params.get('OFFSET') === '0').flush({
      status: 'SUCCESS', data: [], total: 10, page: 1, pageSize: 5,
    });
  });

  it('accepts the live API envelope without pagination metadata and keeps next-page navigation available', () => {
    let response: PaginatedResponse<Product> | undefined;
    catalog.loadPage(1, 5).subscribe((page) => (response = page));
    http.expectOne((request) => request.params.get('OFFSET') === '0').flush({
      status: 'SUCCESS',
      message: 'Product details fetched successfully',
      data: [
        {
          PRODUCT_ID: 3,
          PRODUCT_NAME: 'Samsung Galaxy S25',
          PRODUCT_CODE_SKU: 'SKU0003',
          CATEGORY_ID: 1,
          BRAND_ID: 1,
          PRODUCT_DESCRIPTION: 'Samsung smartphone',
          SELLING_PRICE: '75000.00',
          PRICE: '80000.00',
          STOCK_QUANTITY: 100,
          IS_ACTIVE: 1,
        },
        {
          PRODUCT_ID: 4,
          PRODUCT_NAME: 'Wireless Mouse Updated',
          PRODUCT_CODE_SKU: 'SKU0004',
          CATEGORY_ID: 1,
          BRAND_ID: 1,
          PRODUCT_DESCRIPTION: 'Updated wireless optical mouse',
          SELLING_PRICE: '749.00',
          PRICE: '999.00',
          STOCK_QUANTITY: 90,
          IS_ACTIVE: 1,
        },
        {
          PRODUCT_ID: 5,
          PRODUCT_NAME: 'Wireless Mouse',
          PRODUCT_CODE_SKU: 'SKU0005',
          CATEGORY_ID: 3,
          BRAND_ID: 1,
          PRODUCT_DESCRIPTION: 'Wireless optical mouse',
          SELLING_PRICE: '799.00',
          PRICE: '999.00',
          STOCK_QUANTITY: 100,
          IS_ACTIVE: 1,
        },
        {
          PRODUCT_ID: 6,
          PRODUCT_NAME: 'laptop',
          PRODUCT_CODE_SKU: 'SKU0006',
          CATEGORY_ID: 3,
          BRAND_ID: 1,
          PRODUCT_DESCRIPTION: 'office laptop',
          SELLING_PRICE: '799.00',
          PRICE: '999.00',
          STOCK_QUANTITY: 100,
          IS_ACTIVE: 1,
        },
        {
          PRODUCT_ID: 10,
          PRODUCT_NAME: 'lenovo S25',
          PRODUCT_CODE_SKU: 'SKU0010',
          CATEGORY_ID: 1,
          BRAND_ID: 1,
          PRODUCT_DESCRIPTION: 'Samsung Smartphone',
          SELLING_PRICE: '75000.00',
          PRICE: '80000.00',
          STOCK_QUANTITY: 100,
          IS_ACTIVE: 1,
        },
      ],
    });

    expect(response).toMatchObject({
      items: [
        { id: '3', name: 'Samsung Galaxy S25', sku: 'SKU0003', brand: 'brand-1', isActive: true },
        { id: '4', name: 'Wireless Mouse Updated', sku: 'SKU0004', isActive: true },
        { id: '5', name: 'Wireless Mouse', sku: 'SKU0005', isActive: true },
        { id: '6', name: 'laptop', sku: 'SKU0006', isActive: true },
        { id: '10', name: 'lenovo S25', sku: 'SKU0010', isActive: true },
      ],
      page: 1,
      pageSize: 5,
      hasNext: true,
    });
    expect(response?.total).toBeUndefined();
    expect(response?.totalPages).toBeUndefined();
  });

  it('treats a successful empty response as an empty catalog', () => {
    catalog.load();
    http.expectOne((request) => request.url.endsWith('/products/get')).flush({
      status: 'SUCCESS',
      data: [],
    });

    expect(catalog.status()).toBe('success');
    expect(catalog.products()).toEqual([]);
    expect(catalog.error()).toBeNull();
  });

  it('exposes API and transport errors and allows retrying', () => {
    catalog.load();
    http.expectOne((request) => request.url.endsWith('/products/get')).flush(
      { message: 'Service unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(catalog.status()).toBe('error');
    expect(catalog.error()).toBe('Service unavailable');

    catalog.load();
    http.expectOne((request) => request.url.endsWith('/products/get')).flush({
      status: 'SUCCESS',
      data: [],
    });

    expect(catalog.status()).toBe('success');
    expect(catalog.error()).toBeNull();
  });

  it('reports malformed product records instead of treating them as an empty catalog', () => {
    catalog.load();
    http.expectOne((request) => request.url.endsWith('/products/get')).flush({
      status: 'SUCCESS',
      data: [{ PRODUCT_ID: 1, PRODUCT_NAME: 'Missing price' }],
    });

    expect(catalog.status()).toBe('error');
    expect(catalog.error()).toContain('missing or invalid required fields');
    expect(catalog.products()).toEqual([]);
  });
});
