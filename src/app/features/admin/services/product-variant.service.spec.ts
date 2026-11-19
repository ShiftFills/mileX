import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProductVariant, ProductVariantService } from './product-variant.service';

/** One row of product_variant/get, shaped like the sample response; `overrides` change single fields. */
function variantRow(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    VARIANT_ID: id,
    VARIANT_NAME: `Variant ${id}`,
    SKU: `SKU000${id}`,
    BARCODE: null,
    SIZE: null,
    SIZE_NAME: null,
    COLOR: null,
    COLOUR_NAME: null,
    MATERIAL: null,
    MATERIAL_NAME: null,
    WEIGHT: null,
    PRICE: '40000.00',
    STOCK_QUANTITY: 5,
    VARIANT_IMAGE: null,
    PRODUCT_ID: 13,
    SELLER_ID: 44,
    SELLER_NAME: 'Arun Kumar',
    STATUS: 'ACTIVE',
    CREATED_BY: 73,
    UPDATED_BY: null,
    CREATED_AT: '2026-11-16T06:48:45.000Z',
    UPDATED_AT: '2026-11-16T06:48:45.000Z',
    ...overrides,
  };
}

function success(data: Record<string, unknown>[]) {
  return { status: 'SUCCESS', message: 'Product variant details fetched successfully', data };
}

function variantUrl(productId: number, offset: number): string {
  return `/api/product_variant/get?PRODUCT_ID=${productId}&VARIANT_ID=-1&LIMIT=10&OFFSET=${offset}`;
}

// CHANGED (new): tests for loadProductVariants (storefront Product View) and the new *_NAME fields.
describe('ProductVariantService.loadProductVariants', () => {
  let service: ProductVariantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductVariantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests the product\'s variants with VARIANT_ID=-1, LIMIT=10, OFFSET=0 and maps the sample response', () => {
    let variants: ProductVariant[] | undefined;
    service.loadProductVariants(13).subscribe((result) => (variants = result));

    const request = http.expectOne(variantUrl(13, 0));
    expect(request.request.method).toBe('GET');
    request.flush(success([
      variantRow(21, {
        VARIANT_NAME: 'Black Leather dongle',
        SKU: 'SKU00021',
        STOCK_QUANTITY: 0,
        VARIANT_IMAGE: 'Screenshot 2026-10-21 151737.png',
      }),
    ]));

    expect(variants).toHaveLength(1);
    expect(variants?.[0]).toMatchObject({
      id: '21',
      productId: 13,
      name: 'Black Leather dongle',
      sku: 'SKU00021',
      price: 40000,
      stock: 0,
      status: 'ACTIVE',
      sellerId: 44,
      sellerName: 'Arun Kumar',
      // Nulls become empty strings, so the page can hide them.
      barcode: '',
      weight: '',
      sizeName: '',
      colorName: '',
      materialName: '',
      // The shared reader is unchanged: the file name stays as sent (the page builds the URL).
      imagePath: 'Screenshot 2026-10-21 151737.png',
    });
  });

  it('reads SIZE_NAME, COLOUR_NAME and MATERIAL_NAME as display names and keeps SIZE / COLOR / MATERIAL as before', () => {
    let variants: ProductVariant[] | undefined;
    service.loadProductVariants(13).subscribe((result) => (variants = result));

    http.expectOne(variantUrl(13, 0)).flush(success([
      variantRow(22, {
        SIZE: 2, SIZE_NAME: 'Medium',
        COLOR: 1, COLOUR_NAME: 'Black',
        MATERIAL: 3, MATERIAL_NAME: 'Leather',
        WEIGHT: '0.25',
      }),
    ]));

    expect(variants?.[0]).toMatchObject({
      sizeName: 'Medium',
      colorName: 'Black',
      materialName: 'Leather',
      size: '2',
      color: '1',
      material: '3',
      weight: '0.25',
    });
  });

  it('returns every status, so the caller decides which variants to show', () => {
    let variants: ProductVariant[] | undefined;
    service.loadProductVariants(13).subscribe((result) => (variants = result));

    http.expectOne(variantUrl(13, 0)).flush(success([
      variantRow(21),
      variantRow(22, { STATUS: 'INACTIVE' }),
    ]));

    expect(variants?.map(({ id, status }) => [id, status])).toEqual([['21', 'ACTIVE'], ['22', 'INACTIVE']]);
  });

  it('returns an empty list for a product without variants, with no further requests', () => {
    let variants: ProductVariant[] | undefined;
    service.loadProductVariants(13).subscribe((result) => (variants = result));

    http.expectOne(variantUrl(13, 0)).flush(success([]));

    expect(variants).toEqual([]);
  });

  it('requests the next 10 while a page comes back full and combines the pages', () => {
    let variants: ProductVariant[] | undefined;
    service.loadProductVariants(13).subscribe((result) => (variants = result));

    http.expectOne(variantUrl(13, 0)).flush(success(
      Array.from({ length: 10 }, (_, index) => variantRow(index + 1)),
    ));
    http.expectOne(variantUrl(13, 10)).flush(success([variantRow(11), variantRow(12), variantRow(13)]));

    expect(variants?.map(({ id }) => id)).toEqual(
      Array.from({ length: 13 }, (_, index) => String(index + 1)),
    );
  });

  it('stops when a page brings no new variants (an API that ignores OFFSET)', () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => variantRow(index + 1));
    let variants: ProductVariant[] | undefined;
    service.loadProductVariants(13).subscribe((result) => (variants = result));

    http.expectOne(variantUrl(13, 0)).flush(success(firstPage));
    http.expectOne(variantUrl(13, 10)).flush(success(firstPage));

    expect(variants).toHaveLength(10);
    http.expectNone(variantUrl(13, 20));
  });

  it('stops after 20 pages', () => {
    let variants: ProductVariant[] | undefined;
    service.loadProductVariants(13).subscribe((result) => (variants = result));

    for (let page = 0; page < 20; page += 1) {
      http.expectOne(variantUrl(13, page * 10)).flush(success(
        Array.from({ length: 10 }, (_, index) => variantRow(page * 10 + index + 1)),
      ));
    }

    expect(variants).toHaveLength(200);
    http.expectNone(variantUrl(13, 200));
  });

  it('reports an API failure with its message', () => {
    let failure: unknown;
    service.loadProductVariants(13).subscribe({ error: (error: unknown) => (failure = error) });

    http.expectOne(variantUrl(13, 0)).flush({ status: 'FAILURE', message: 'Variants are unavailable' });

    expect(failure).toEqual(new Error('Variants are unavailable'));
  });

  it('returns an error for an invalid product ID without making a request', () => {
    const errors: unknown[] = [];
    for (const productId of [0, -1, 1.5, Number.NaN]) {
      service.loadProductVariants(productId).subscribe({ error: (error: unknown) => errors.push(error) });
    }

    expect(errors).toEqual(Array(4).fill(new RangeError('Product ID must be a positive safe integer.')));
    http.expectNone((request) => request.url.endsWith('/product_variant/get'));
  });
});
