// CHANGED (new): Admin Category Management API (category_management/get, insert, update, delete).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@core/services/auth.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { Category, CategoryFormValue, CategoryManagementService } from './category-management.service';

const ADMIN_USER_ID = 3;
const GET_URL = '/api/category_management/get';
const getUrl = (limit: number, offset: number): string => `${GET_URL}?CATEGORY_ID=-1&LIMIT=${limit}&OFFSET=${offset}`;

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

/** A category_management/get row (the fields of the documented request, plus CREATED_AT). */
function categoryRow(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CATEGORY_ID: id, CATEGORY_NAME: `Category ${id}`, PARENT_CATEGORY_ID: null, CATEGORY_IMAGE: null,
    DESCRIPTION: `About ${id}`, STATUS: 'Active', CREATED_BY: 1, CREATED_AT: '2026-11-11T02:03:22.000Z',
    ...overrides,
  };
}

const FORM: CategoryFormValue = {
  name: '  Fashion items ', parentId: null, description: ' Fashion products and accessories ', image: null, status: 'Active',
};

describe('CategoryManagementService', () => {
  let service: CategoryManagementService;
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
    service = TestBed.inject(CategoryManagementService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  describe('loadPage', () => {
    it('sends CATEGORY_ID=-1 with LIMIT and OFFSET and maps parents, subcategories, images and statuses', () => {
      let page: { categories: Category[]; total: number | null } | undefined;
      service.loadPage(10, 0).subscribe((result) => (page = result));

      const request = http.expectOne(getUrl(10, 0));
      expect(request.request.method).toBe('GET');
      request.flush({
        status: true,
        total_records: 3,
        data: [
          categoryRow(7, { CATEGORY_NAME: 'Fashion', CATEGORY_IMAGE: 'categories/fashion.png' }),
          categoryRow(12, {
            CATEGORY_NAME: ' Bags ', PARENT_CATEGORY_ID: '7', PARENT_CATEGORY_NAME: 'Fashion', STATUS: 'INACTIVE',
            CATEGORY_IMAGE: 'uploads/categories/bags.png', DESCRIPTION: null,
          }),
          categoryRow(13, { PARENT_CATEGORY_ID: 13, STATUS: undefined }),
        ],
      });

      expect(page?.total).toBe(3);
      expect(page?.categories[0]).toEqual({
        id: 7, name: 'Fashion', parentId: null, parentName: null, description: 'About 7',
        image: 'categories/fashion.png', imageKey: 'categories/fashion.png', status: 'Active',
        createdAt: '2026-11-11T02:03:22.000Z', updatedAt: null,
      });
      expect(page?.categories[1]).toMatchObject({
        id: 12, name: 'Bags', parentId: 7, parentName: 'Fashion', description: '', status: 'Inactive',
        imagePath: 'uploads/categories/bags.png',
      });
      // A category is never its own parent; without a STATUS it counts as active.
      expect(page?.categories[2]).toMatchObject({ parentId: null, status: 'Active' });
    });

    it('reports a failed response and a category without an ID or name', () => {
      const errors: unknown[] = [];
      for (const body of [
        { status: false, message: 'Unauthorized access' },
        { status: true, data: [{ CATEGORY_NAME: 'No ID' }] },
      ]) {
        service.loadPage(10, 0).subscribe({ error: (error: unknown) => errors.push(error) });
        http.expectOne(getUrl(10, 0)).flush(body);
      }
      expect(errors).toEqual([
        new Error('Unauthorized access'),
        new Error('The category API returned a category without a valid ID or name.'),
      ]);
    });
  });

  describe('loadAll', () => {
    it('reads every page, moving OFFSET by the rows returned, until total_records', () => {
      let all: Category[] = [];
      service.loadAll().subscribe((categories) => (all = categories));

      // The API returns fewer rows than asked (a capped LIMIT): the next OFFSET follows the rows returned.
      http.expectOne(getUrl(100, 0)).flush({
        status: true, total_records: 3, data: [categoryRow(1), categoryRow(2)],
      });
      http.expectOne(getUrl(100, 2)).flush({ status: true, total_records: 3, data: [categoryRow(3)] });

      expect(all.map((category) => category.id)).toEqual([1, 2, 3]);
    });

    it('stops on a page shorter than LIMIT when there is no total_records', () => {
      let all: Category[] = [];
      service.loadAll().subscribe((categories) => (all = categories));
      http.expectOne(getUrl(100, 0)).flush({ status: true, data: [categoryRow(1)] });
      expect(all).toHaveLength(1);
    });
  });

  describe('insertCategory', () => {
    it('POSTs the documented body with the signed-in Admin\'s user ID as CREATED_BY', () => {
      signInAdmin();
      let message: unknown;
      service.insertCategory(FORM).subscribe((result) => (message = result));

      const request = http.expectOne('/api/category_management/insert');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        CATEGORY_NAME: 'Fashion items',
        PARENT_CATEGORY_ID: null,
        CATEGORY_IMAGE: null,
        DESCRIPTION: 'Fashion products and accessories',
        STATUS: 'Active',
        CREATED_BY: ADMIN_USER_ID,
      });
      request.flush({ status: true, message: 'Category inserted successfully' });
      expect(message).toBe('Category inserted successfully');
    });

    it('sends the parent ID and image key of a subcategory', () => {
      signInAdmin();
      service.insertCategory({ ...FORM, parentId: 7, image: 'categories/bags.png', status: 'Inactive' }).subscribe();
      const request = http.expectOne('/api/category_management/insert');
      expect(request.request.body).toMatchObject({
        PARENT_CATEGORY_ID: 7, CATEGORY_IMAGE: 'categories/bags.png', STATUS: 'Inactive',
      });
      request.flush({ status: true });
    });

    it('sends nothing without a signed-in user or a name', () => {
      const errors: unknown[] = [];
      service.insertCategory(FORM).subscribe({ error: (error: unknown) => errors.push(error) });
      signInAdmin();
      service.insertCategory({ ...FORM, name: '   ' }).subscribe({ error: (error: unknown) => errors.push(error) });

      expect(errors).toEqual([
        new Error('A valid signed-in Admin is required to add a category.'),
        new RangeError('Category name is required.'),
      ]);
      http.expectNone('/api/category_management/insert');
    });

    it('reports a 2xx response that says the insert failed', () => {
      signInAdmin();
      let error: unknown;
      service.insertCategory(FORM).subscribe({ error: (caught: unknown) => (error = caught) });
      http.expectOne('/api/category_management/insert').flush({ status: false, message: 'Category already exists' });
      expect(error).toEqual(new Error('Category already exists'));
    });
  });

  describe('updateCategory', () => {
    it('PUTs CATEGORY_ID with the fields and the signed-in Admin\'s user ID as UPDATED_BY', () => {
      signInAdmin();
      service.updateCategory(5, { ...FORM, parentId: 7 }).subscribe();

      const request = http.expectOne('/api/category_management/update');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({
        CATEGORY_ID: 5,
        CATEGORY_NAME: 'Fashion items',
        PARENT_CATEGORY_ID: 7,
        CATEGORY_IMAGE: null,
        DESCRIPTION: 'Fashion products and accessories',
        STATUS: 'Active',
        UPDATED_BY: ADMIN_USER_ID,
      });
      request.flush({ status: true, message: 'Category updated successfully' });
    });

    it('never sends a category as its own parent', () => {
      signInAdmin();
      let error: unknown;
      service.updateCategory(5, { ...FORM, parentId: 5 }).subscribe({ error: (caught: unknown) => (error = caught) });
      expect(error).toEqual(new RangeError('A category cannot be its own parent.'));
      http.expectNone('/api/category_management/update');
    });
  });

  describe('deleteCategory', () => {
    it('sends DELETE with { CATEGORY_ID }', () => {
      let message: unknown;
      service.deleteCategory(5).subscribe((result) => (message = result));
      const request = http.expectOne('/api/category_management/delete');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({ CATEGORY_ID: 5 });
      request.flush({ status: true, message: 'Category deleted successfully' });
      expect(message).toBe('Category deleted successfully');
    });

    it('reads the reason the backend refuses a delete', () => {
      let error: unknown;
      service.deleteCategory(5).subscribe({ error: (caught: unknown) => (error = caught) });
      http.expectOne('/api/category_management/delete').flush(
        { status: false, message: 'Category is mapped to products' },
        { status: 409, statusText: 'Conflict' },
      );
      expect(service.getErrorMessage(error, 'The category could not be deleted.')).toBe('Category is mapped to products');
    });
  });

  it('makes the rest of the app read the categories again after each change, and only then', () => {
    signInAdmin();
    const catalog = TestBed.inject(ProductCatalogService);
    const loadCategories = (): void => {
      catalog.loadCategories().subscribe();
    };
    const categoryRequests = (): number =>
      http.match((request) => request.url.endsWith('/all_category/get')).map((request) =>
        request.flush({ status: 'SUCCESS', data: [{ CATEGORY_ID: 1, CATEGORY_NAME: 'Electronics' }] }),
      ).length;

    loadCategories();
    expect(categoryRequests()).toBe(1);
    // Cached: no new request.
    loadCategories();
    expect(categoryRequests()).toBe(0);

    // A failed change keeps the cache.
    service.deleteCategory(5).subscribe({ error: () => undefined });
    http.expectOne('/api/category_management/delete').flush({ message: 'No' }, { status: 409, statusText: 'Conflict' });
    loadCategories();
    expect(categoryRequests()).toBe(0);

    for (const change of [
      () => service.insertCategory(FORM),
      () => service.updateCategory(5, FORM),
      () => service.deleteCategory(5),
    ]) {
      change().subscribe();
      http.expectOne((request) => request.url.includes('/category_management/')).flush({ status: true });
      loadCategories();
      expect(categoryRequests()).toBe(1);
    }
  });
});
