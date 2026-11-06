import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PaginatedResponse, Product } from '@shared/models';
import { AuthService } from './auth.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { ProductCatalogService, ProductDetails, ProductInsertPayload, ProductUpdatePayload } from './product-catalog.service';
import { API_BASE_URL } from '../config/api.config';

describe('ProductCatalogService', () => {
  let catalog: ProductCatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        { provide: AuthService, useValue: { token: () => 'demo-token' } },
        { provide: API_BASE_URL, useValue: '/api' },
        provideHttpClientTesting(),
      ],
    });
    catalog = TestBed.inject(ProductCatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads category, active brand, and tax-rate dropdown options with master IDs', () => {
    let categories: unknown;
    let brands: unknown;
    let allBrands: unknown;
    let taxRates: unknown;
    catalog.loadCategories().subscribe((options) => (categories = options));
    catalog.loadBrands('1', '11').subscribe((options) => (brands = options));
    catalog.loadAllBrands().subscribe((options) => (allBrands = options));
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
        request.params.get('CATEGORY_ID') === '1' &&
        request.params.get('SUB_CATEGORY_ID') === '11' &&
        request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [
        { BRAND_ID: 1, BRAND_NAME: 'Samsung', STATUS: 'Active' },
        { BRAND_ID: 2, BRAND_NAME: 'Other Brand', STATUS: 'Inactive' },
      ],
    });
    http.expectOne(
      (request) =>
        request.url.endsWith('/brand_management/get') &&
        request.params.get('BRAND_ID') === '-1' &&
        request.params.get('CATEGORY_ID') === null &&
        request.params.get('SUB_CATEGORY_ID') === null &&
        request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [
        { BRAND_ID: 1, BRAND_NAME: 'Samsung' },
        { BRAND_ID: 2, BRAND_NAME: 'Other Brand' },
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
    expect(brands).toEqual([
      { id: '1', label: 'Samsung' },
      { id: '2', label: 'Other Brand' },
    ]);
    expect(allBrands).toEqual([
      { id: '1', label: 'Samsung' },
      { id: '2', label: 'Other Brand' },
    ]);
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

  it('loads subcategories using both the wildcard subcategory ID and selected category ID', () => {
    let subcategories: unknown;
    catalog.loadSubCategories('7').subscribe((options) => (subcategories = options));

    http.expectOne((request) =>
      request.url.endsWith('/sub_category/get') &&
      request.params.get('SUB_CATEGORY_ID') === '-1' &&
      request.params.get('CATEGORY_ID') === '7' &&
      request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [{ SUB_CATEGORY_ID: 71, SUB_CATEGORY_NAME: 'Phones' }],
    });

    expect(subcategories).toEqual([{ id: '71', label: 'Phones' }]);
  });

  it('loads the full product-code list and product-specific codes with their respective IDs', () => {
    let allProductCodes: unknown;
    let productCodes: unknown;
    catalog.loadProductCodes(-1).subscribe((options) => (allProductCodes = options));
    catalog.loadProductCodes(21).subscribe((options) => (productCodes = options));

    http.expectOne((request) =>
      request.url.endsWith('/product_code/get') &&
      request.params.get('PRODUCT_ID') === '-1' &&
      request.params.keys().length === 1 &&
      request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      success: true,
      message: 'Product codes fetched successfully',
      data: [
        { PRODUCT_ID: 3, PRODUCT_CODE_SKU: 'SKU0003' },
        { PRODUCT_ID: 4, PRODUCT_CODE_SKU: 'SKU0004' },
      ],
    });
    http.expectOne((request) =>
      request.url.endsWith('/product_code/get') &&
      request.params.get('PRODUCT_ID') === '21' &&
      request.params.keys().length === 1 &&
      request.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      success: true,
      message: 'Product codes fetched successfully',
      data: [{ PRODUCT_ID: 14, PRODUCT_CODE_SKU: 'SKU0014' }],
    });

    expect(allProductCodes).toEqual([
      { id: '3', label: 'SKU0003' },
      { id: '4', label: 'SKU0004' },
    ]);
    expect(productCodes).toEqual([{ id: '14', label: 'SKU0014' }]);
  });

  it('loads the complete product details using only the selected Product ID', () => {
    let product: ProductDetails | null | undefined;
    catalog.loadProductById(21).subscribe((details) => (product = details));
    http.expectOne((request) =>
      request.url.endsWith('/products/get') &&
      request.method === 'GET' &&
      request.params.keys().length === 1 &&
      request.params.get('PRODUCT_ID') === '21',
    ).flush({
      status: true,
      message: 'Product details fetched successfully',
      data: [{
        PRODUCT_ID: 21,
        PRODUCT_NAME: 'Wireles',
        CATEGORY_ID: 3,
        SUB_CATEGORY_ID: 2,
        BRAND_ID: 4,
        PRODUCT_CODE_SKU: 'SKU0021',
        PRODUCT_IMAGE: 'uploads/products/Screenshot 2026-10-21 144743.png',
        PRODUCT_VIDEO: null,
        PRODUCT_DIMENSION: 0,
        PRODUCT_DESCRIPTION: 'xhhhhhhhhhhhhhhh',
        HSN_CODE: '76654435',
        TAX_RATE: '18.00',
        SELLING_PRICE: '200.00',
        PRICE: '300.00',
        DISCOUNT: '0.00',
        STOCK_QUANTITY: 34,
        MINIMUM_ORDER_QUANTITY: 1,
        MAXIMUM_ORDER_QUANTITY: 4,
        WEIGHT: null,
        LENGTH: null,
        WIDTH: null,
        HEIGHT: null,
        SELLER_ID: 2,
        IS_ACTIVE: 'ACTIVE',
        CREATED_BY: 2,
        UPDATED_BY: null,
        CREATED_AT: '2026-11-05T04:09:32.000Z',
        UPDATED_AT: '2026-11-05T06:00:57.000Z',
      }],
    });

    expect(product).toEqual({
      PRODUCT_ID: 21,
      PRODUCT_NAME: 'Wireles',
      CATEGORY_ID: '3',
      SUB_CATEGORY_ID: '2',
      BRAND_ID: '4',
      PRODUCT_CODE_SKU: 'SKU0021',
      PRODUCT_IMAGE: 'uploads/products/Screenshot 2026-10-21 144743.png',
      PRODUCT_VIDEO: null,
      PRODUCT_DESCRIPTION: 'xhhhhhhhhhhhhhhh',
      HSN_CODE: '76654435',
      TAX_RATE: '18.00',
      SELLING_PRICE: '200.00',
      PRICE: '300.00',
      DISCOUNT: '0.00',
      STOCK_QUANTITY: '34',
      MINIMUM_ORDER_QUANTITY: '1',
      MAXIMUM_ORDER_QUANTITY: '4',
      WEIGHT: '',
      LENGTH: '',
      WIDTH: '',
      HEIGHT: '',
    });
  });

  it('preserves null media and optional dimensions as empty edit values', () => {
    let product: ProductDetails | null | undefined;
    catalog.loadProductById(6).subscribe((details) => (product = details));
    http.expectOne((request) => request.params.get('PRODUCT_ID') === '6').flush({
      success: true,
      data: [{ PRODUCT_ID: 6, PRODUCT_NAME: 'Product', PRODUCT_IMAGE: null, PRODUCT_VIDEO: null, WEIGHT: null, LENGTH: '', WIDTH: null, HEIGHT: null }],
    });

    expect(product?.PRODUCT_IMAGE).toBeNull();
    expect(product?.PRODUCT_VIDEO).toBeNull();
    expect(product?.WEIGHT).toBe('');
    expect(product?.LENGTH).toBe('');
    expect(product?.WIDTH).toBe('');
    expect(product?.HEIGHT).toBe('');
  });

  it('posts product details and rejects API-level validation failures', () => {
    const payload: ProductInsertPayload = {
      PRODUCT_NAME: 'Wireless Earbuds', CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, BRAND_ID: 4,
      PRODUCT_IMAGE: 'uploads/products/Screenshot 2026-10-21 153010.png', PRODUCT_VIDEO: null,
      PRODUCT_DESCRIPTION: 'dddd', HSN_CODE: '222223', TAX_RATE: 18,
      SELLING_PRICE: 2222, PRICE: 3333, DISCOUNT: 0,
      STOCK_QUANTITY: 33, MINIMUM_ORDER_QUANTITY: 1, MAXIMUM_ORDER_QUANTITY: 3,
      WEIGHT: null, LENGTH: null, WIDTH: null, HEIGHT: null, SELLER_ID: 2, CREATED_BY: 2,
    };
    let result: string | undefined;
    catalog.insertProduct(payload).subscribe((message) => (result = message));

    const request = http.expectOne((req) => req.url.endsWith('/products/insert'));
    expect(request.request.method).toBe('POST');
    expect(request.request.url).toBe('/api/products/insert');
    expect(request.request.headers.get('Content-Type')).toBe('application/json');
    expect(request.request.headers.get('Authorization')).toBe('Bearer demo-token');
    expect(Object.keys(request.request.body as ProductInsertPayload)).toHaveLength(21);
    expect(request.request.body).toEqual(payload);
    expect(request.request.responseType).toBe('text');
    request.flush('Product inserted successfully');
    expect(result).toBe('Product inserted successfully');

    let plainTextFailure: unknown;
    catalog.insertProduct(payload).subscribe({ error: (error) => (plainTextFailure = error) });
    http.expectOne((req) => req.url.endsWith('/products/insert')).flush('Product was not inserted: duplicate HSN code.');
    expect(catalog.getErrorMessage(plainTextFailure)).toBe('Product was not inserted: duplicate HSN code.');

    let failure: unknown;
    catalog.insertProduct(payload).subscribe({ error: (error) => (failure = error) });
    http.expectOne((req) => req.url.endsWith('/products/insert')).flush(
      '{"success":false,"message":"Brand is not valid for this category."}',
      { status: 400, statusText: 'Bad Request' },
    );
    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect(catalog.getErrorMessage(failure)).toBe('Brand is not valid for this category.');
  });

  it('updates the selected product and invalidates cached listing pages', () => {
    const payload: ProductUpdatePayload = {
      PRODUCT_ID: 83,
      PRODUCT_NAME: 'Wireless Earbuds Updated', CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, BRAND_ID: 4,
      PRODUCT_IMAGE: 'uploads/products/earbuds.png', PRODUCT_VIDEO: 'uploads/videos/earbuds.mp4',
      PRODUCT_DESCRIPTION: 'Updated audio', HSN_CODE: '851762', TAX_RATE: 18,
      SELLING_PRICE: 2200, PRICE: 3000, DISCOUNT: 800,
      STOCK_QUANTITY: 40, MINIMUM_ORDER_QUANTITY: 1, MAXIMUM_ORDER_QUANTITY: 8,
      WEIGHT: 0.25, LENGTH: 5, WIDTH: 5, HEIGHT: 3, SELLER_ID: 2, CREATED_BY: 2,
    };
    catalog.loadPage(1, 5).subscribe();
    http.expectOne((request) => request.params.get('OFFSET') === '0').flush({
      status: 'SUCCESS', data: [], total: 0, page: 1, pageSize: 5,
    });

    let result: string | undefined;
    catalog.updateProduct(payload).subscribe((message) => (result = message));
    const updateRequest = http.expectOne((request) => request.url.endsWith('/products/update'));
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.url).toBe('/api/products/update');
    expect(updateRequest.request.responseType).toBe('text');
    expect(updateRequest.request.body).toEqual(payload);
    updateRequest.flush('{"status":true,"message":"Product updated successfully"}');
    expect(result).toBe('Product updated successfully');

    catalog.loadPage(1, 5).subscribe();
    http.expectOne((request) => request.params.get('OFFSET') === '0').flush({
      status: 'SUCCESS', data: [], total: 0, page: 1, pageSize: 5,
    });
  });

  it('rejects API-level update failures and invalid product IDs', () => {
    const payload: ProductUpdatePayload = {
      PRODUCT_ID: 83,
      PRODUCT_NAME: 'Product', CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, BRAND_ID: 4,
      PRODUCT_IMAGE: 'uploads/products/product.png', PRODUCT_VIDEO: null,
      PRODUCT_DESCRIPTION: 'Description', HSN_CODE: '851762', TAX_RATE: 18,
      SELLING_PRICE: 2200, PRICE: 3000, DISCOUNT: 800,
      STOCK_QUANTITY: 40, MINIMUM_ORDER_QUANTITY: 1, MAXIMUM_ORDER_QUANTITY: 8,
      WEIGHT: 0.25, LENGTH: 5, WIDTH: 5, HEIGHT: 3, SELLER_ID: 2, CREATED_BY: 2,
    };
    let apiError: unknown;
    catalog.updateProduct(payload).subscribe({ error: (error: unknown) => (apiError = error) });
    http.expectOne((request) => request.url.endsWith('/products/update')).flush(
      '{"status":false,"message":"Product update failed."}',
    );
    expect(apiError).toEqual(new Error('Product update failed.'));
    expect(catalog.getErrorMessage(apiError)).toBe('Product update failed.');

    let idError: unknown;
    catalog.updateProduct({ ...payload, PRODUCT_ID: 0 }).subscribe({
      error: (error: unknown) => (idError = error),
    });
    expect(idError).toEqual(new RangeError('Product ID must be a positive safe integer.'));
    http.expectNone((request) => request.url.endsWith('/products/update'));
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
          IS_ACTIVE: 'ACTIVE',
        },
        {
          PRODUCT_ID: 4,
          PRODUCT_NAME: 'Wireless Mouse',
          SELLING_PRICE: '749.00',
          IS_ACTIVE: 'INACTIVE',
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
      request.params.get('PRODUCT_ID') === '-1' &&
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

  it('accepts the new products endpoint success flag and keeps product IDs numeric in the query', () => {
    let result: PaginatedResponse<Product> | undefined;
    catalog.loadPage(1, 5).subscribe((page) => (result = page));

    http.expectOne((request) =>
      request.url.endsWith('/products/get') &&
      request.params.get('PRODUCT_ID') === '-1' &&
      request.params.get('LIMIT') === '5' &&
      request.params.get('OFFSET') === '0',
    ).flush({
      status: true,
      message: 'Product details fetched successfully',
      data: [{ PRODUCT_ID: 13, PRODUCT_NAME: 'Bluetooth Speaker', SELLING_PRICE: 1500 }],
    });

    expect(result?.items).toMatchObject([{ id: '13', name: 'Bluetooth Speaker', price: 1500 }]);
    expect(result?.hasNext).toBe(false);
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
