// CHANGED (new): Admin Brand Management API (brand_management/get, insert, update, delete).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@core/services/auth.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { BrandFormValue, BrandManagementService, BrandPage } from './brand-management.service';

const ADMIN_USER_ID = 3;
const GET_URL = '/api/brand_management/get';
const getUrl = (categoryId: number, subCategoryId: number, limit: number, offset: number): string =>
  `${GET_URL}?BRAND_ID=-1&CATEGORY_ID=${categoryId}&SUB_CATEGORY_ID=${subCategoryId}&LIMIT=${limit}&OFFSET=${offset}`;

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

const FORM: BrandFormValue = {
  name: '  Samsung ', description: ' Samsung electronics brand ', logo: 'brands/samsung.png', status: 'ACTIVE',
  categoryId: 3, subCategoryId: 2,
};

describe('BrandManagementService', () => {
  let service: BrandManagementService;
  let http: HttpTestingController;

  function signInAdmin(): void {
    TestBed.inject(AuthService).setSession(
      { id: String(ADMIN_USER_ID), email: '', firstName: 'admin', lastName: '', userType: 'ADMIN' },
      tokenWithClaims({ USER_ID: ADMIN_USER_ID, ADMIN_ID: 1 }),
    );
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BrandManagementService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('loadPage', () => {
    it('sends -1 for every brand, category and subcategory with LIMIT and OFFSET, and maps the brands', () => {
      let page: BrandPage | undefined;
      service.loadPage({ limit: 10, offset: 0 }).subscribe((result) => (page = result));

      const request = http.expectOne(getUrl(-1, -1, 10, 0));
      expect(request.request.method).toBe('GET');
      request.flush({
        status: 'SUCCESS',
        total_records: 25,
        data: [
          {
            BRAND_ID: 4, BRAND_NAME: ' Samsung ', BRAND_LOGO: 'brands/samsung.png', DESCRIPTION: 'Samsung electronics brand',
            STATUS: 'ACTIVE', CATEGORY_ID: 3, CATEGORY_NAME: 'Electronics', SUB_CATEGORY_ID: '2', SUB_CATEGORY_NAME: 'Mobiles',
            CREATED_AT: '2026-11-20T10:00:00.000Z',
          },
          { BRAND_ID: '5', BRAND_NAME: 'Acme', BRAND_LOGO: 'uploads/brands/acme.png', STATUS: 'INACTIVE', CATEGORY_ID: 8, SUB_CATEGORY_ID: 9 },
          { BRAND_ID: 6, BRAND_NAME: 'NoLogo', BRAND_LOGO: null, STATUS: 0 },
        ],
      });

      expect(page?.total).toBe(25);
      expect(page?.brands).toEqual([
        {
          id: 4, name: 'Samsung', description: 'Samsung electronics brand', logo: 'brands/samsung.png',
          imageKey: 'brands/samsung.png', status: 'ACTIVE', categoryId: 3, categoryName: 'Electronics', subCategoryId: 2,
          subCategoryName: 'Mobiles', createdAt: '2026-11-20T10:00:00.000Z', updatedAt: null,
        },
        {
          id: 5, name: 'Acme', description: '', logo: 'uploads/brands/acme.png', imagePath: 'uploads/brands/acme.png',
          status: 'INACTIVE', categoryId: 8, categoryName: null, subCategoryId: 9, subCategoryName: null, createdAt: null,
          updatedAt: null,
        },
        {
          id: 6, name: 'NoLogo', description: '', logo: null, status: 'INACTIVE', categoryId: null, categoryName: null,
          subCategoryId: null, subCategoryName: null, createdAt: null, updatedAt: null,
        },
      ]);
    });

    it('filters by category and subcategory on the server and reports no total when the API sends none', () => {
      let page: BrandPage | undefined;
      service.loadPage({ categoryId: 3, subCategoryId: 2, limit: 10, offset: 20 }).subscribe((result) => (page = result));
      http.expectOne(getUrl(3, 2, 10, 20)).flush({ status: 'SUCCESS', data: [] });
      expect(page).toEqual({ brands: [], total: null });
    });

    it('reports the API message of a failed read and refuses invalid paging without a request', () => {
      let error: unknown;
      service.loadPage({ limit: 10, offset: 0 }).subscribe({ error: (value: unknown) => (error = value) });
      http.expectOne(getUrl(-1, -1, 10, 0)).flush({ status: 'FAILED', message: 'Access token is required' });
      expect((error as Error).message).toBe('Access token is required');

      for (const query of [{ limit: 0, offset: 0 }, { limit: 10, offset: -1 }, { categoryId: 0, limit: 10, offset: 0 }]) {
        let rangeError: unknown;
        service.loadPage(query).subscribe({ error: (value: unknown) => (rangeError = value) });
        expect(rangeError).toBeInstanceOf(RangeError);
      }
      http.expectNone(() => true);
    });
  });

  describe('insert / update / delete', () => {
    it('POSTs the documented insert body with the signed-in Admin as CREATED_BY, and refreshes the brand lookups', () => {
      signInAdmin();
      const invalidate = vi.spyOn(TestBed.inject(ProductCatalogService), 'invalidateBrandLookups');
      let message: string | undefined;
      service.insertBrand(FORM).subscribe((result) => (message = result));

      const request = http.expectOne('/api/brand_management/insert');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        BRAND_NAME: 'Samsung', BRAND_LOGO: 'brands/samsung.png', DESCRIPTION: 'Samsung electronics brand',
        STATUS: 'ACTIVE', CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, CREATED_BY: ADMIN_USER_ID,
      });
      request.flush({ status: 'SUCCESS', message: 'Brand inserted successfully' });

      expect(message).toBe('Brand inserted successfully');
      expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('PUTs the documented update body with BRAND_ID and the signed-in Admin as UPDATED_BY', () => {
      signInAdmin();
      let message: string | undefined;
      service.updateBrand(4, { ...FORM, name: 'Samsung Electronics', logo: null, status: 'INACTIVE' })
        .subscribe((result) => (message = result));

      const request = http.expectOne('/api/brand_management/update');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        BRAND_ID: 4, BRAND_NAME: 'Samsung Electronics', BRAND_LOGO: null, DESCRIPTION: 'Samsung electronics brand',
        STATUS: 'INACTIVE', CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, UPDATED_BY: ADMIN_USER_ID,
      });
      request.flush({ status: true });
      expect(message).toBe('Brand updated successfully.');
    });

    it('DELETEs with the brand, category and subcategory IDs as the body', () => {
      const invalidate = vi.spyOn(TestBed.inject(ProductCatalogService), 'invalidateBrandLookups');
      let message: string | undefined;
      service.deleteBrand({ id: 4, categoryId: 3, subCategoryId: 2 }).subscribe((result) => (message = result));

      const request = http.expectOne('/api/brand_management/delete');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({ BRAND_ID: 4, CATEGORY_ID: 3, SUB_CATEGORY_ID: 2 });
      request.flush({ status: 'SUCCESS', message: 'Brand deleted' });
      expect(message).toBe('Brand deleted');
      expect(invalidate).toHaveBeenCalledTimes(1);
    });

    it('fails without a request when nobody is signed in, or the form misses its name or subcategory', () => {
      const errors: unknown[] = [];
      const collect = { error: (error: unknown) => errors.push(error) };
      service.insertBrand(FORM).subscribe(collect);
      signInAdmin();
      service.insertBrand({ ...FORM, name: '   ' }).subscribe(collect);
      service.updateBrand(4, { ...FORM, subCategoryId: 0 }).subscribe(collect);
      service.updateBrand(0, FORM).subscribe(collect);
      service.deleteBrand({ id: -1, categoryId: 3, subCategoryId: 2 }).subscribe(collect);

      expect(errors.map((error) => (error as Error).message)).toEqual([
        'A valid signed-in Admin is required to add a brand.',
        'Brand name is required.',
        'Subcategory must be a positive whole number.',
        'Brand ID must be a positive safe integer.',
        'Brand ID must be a positive safe integer.',
      ]);
      http.expectNone(() => true);
    });

    it('reports a failure the API sends with a success HTTP status, and leaves the brand lookups cached', () => {
      signInAdmin();
      const invalidate = vi.spyOn(TestBed.inject(ProductCatalogService), 'invalidateBrandLookups');
      let error: unknown;
      service.insertBrand(FORM).subscribe({ error: (value: unknown) => (error = value) });
      http.expectOne('/api/brand_management/insert').flush({ status: 'FAILED', message: 'Brand already exists' });

      expect((error as Error).message).toBe('Brand already exists');
      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  it('turns HTTP errors into readable messages', () => {
    let error: unknown;
    service.deleteBrand({ id: 4, categoryId: 3, subCategoryId: 2 }).subscribe({ error: (value: unknown) => (error = value) });
    http.expectOne('/api/brand_management/delete').flush(
      { status: 'FAILED', message: 'Brand is mapped to products' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(service.getErrorMessage(error)).toBe('Brand is mapped to products');

    service.loadPage({ limit: 10, offset: 0 }).subscribe({ error: (value: unknown) => (error = value) });
    http.expectOne(getUrl(-1, -1, 10, 0)).flush('', { status: 500, statusText: 'Server Error' });
    expect(service.getErrorMessage(error, 'Brands could not be loaded.')).toBe('Brands could not be loaded. (HTTP 500)');
  });
});
