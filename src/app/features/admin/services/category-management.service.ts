import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, defer, expand, last, map, tap, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { AuthService } from '@core/services/auth.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { isS3ImageKey } from '@core/services/s3-image.service';

// CHANGED (new): Admin Category Management (category_management/get, insert, update, delete).

/** The STATUS values the category APIs take ("Active" / "Inactive", as in the documented request). */
export type CategoryStatus = 'Active' | 'Inactive';

/** One category_management/get record. A subcategory has a `parentId`; a top-level category has none. */
export interface Category {
  id: number;
  name: string;
  /** PARENT_CATEGORY_ID; null for a top-level category. */
  parentId: number | null;
  /** PARENT_CATEGORY_NAME when the API sends it (the screen otherwise names the parent from the list). */
  parentName: string | null;
  description: string;
  /** CATEGORY_IMAGE as stored (an S3 key such as "categories/<file>", or another path); null without one. */
  image: string | null;
  /** The image as the image display service reads it: an S3 key, or another path. */
  imageKey?: string;
  imagePath?: string;
  status: CategoryStatus;
  /** CREATED_AT / UPDATED_AT as the API sends them; null when it sends none. */
  createdAt: string | null;
  updatedAt: string | null;
}

/** One category_management/get page. `total` is total_records when the API sends it. */
export interface CategoryPage {
  categories: Category[];
  total: number | null;
}

/** What the Add/Edit form saves (the same fields for insert and update). */
export interface CategoryFormValue {
  name: string;
  parentId: number | null;
  description: string;
  /** The CATEGORY_IMAGE to save: an S3 key, the category's existing value, or null for none. */
  image: string | null;
  status: CategoryStatus;
}

export interface CategoryInsertPayload {
  CATEGORY_NAME: string;
  PARENT_CATEGORY_ID: number | null;
  CATEGORY_IMAGE: string | null;
  DESCRIPTION: string;
  STATUS: CategoryStatus;
  CREATED_BY: number;
}

export interface CategoryUpdatePayload extends Omit<CategoryInsertPayload, 'CREATED_BY'> {
  CATEGORY_ID: number;
  UPDATED_BY: number;
}

/** Rows per category_management/get request when the whole list is read. */
const ALL_CATEGORIES_PAGE_SIZE = 100;
/** Upper bound on the requests one full read makes (should the API ignore OFFSET). */
const MAX_CATEGORY_PAGES = 50;
const SUCCESS_VALUES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function text(record: Record<string, unknown>, keys: readonly string[]): string {
  const value = firstValue(record, keys);
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function positiveId(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isSuccessful(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' && SUCCESS_VALUES.includes(value.trim().toUpperCase()))
  );
}

/** STATUS (or IS_ACTIVE) as "Active" / "Inactive"; a category the API sends without one counts as active. */
function categoryStatus(record: Record<string, unknown>): CategoryStatus {
  const value = firstValue(record, ['STATUS', 'IS_ACTIVE', 'CATEGORY_STATUS']);
  if (value === false || value === 0) return 'Inactive';
  if (typeof value === 'string' && ['INACTIVE', '0', 'FALSE', 'DISABLED'].includes(value.trim().toUpperCase())) {
    return 'Inactive';
  }
  return 'Active';
}

function mapCategory(value: unknown): Category {
  if (!isRecord(value)) throw new Error('The category API returned an invalid category.');
  const id = positiveId(firstValue(value, ['CATEGORY_ID', 'ID']));
  const name = text(value, ['CATEGORY_NAME', 'NAME']);
  if (id === null || !name) {
    throw new Error('The category API returned a category without a valid ID or name.');
  }
  const parentId = positiveId(firstValue(value, ['PARENT_CATEGORY_ID', 'PARENT_ID']));
  const image = text(value, ['CATEGORY_IMAGE', 'IMAGE', 'IMAGE_URL']) || null;
  return {
    id,
    name,
    // A category is never its own parent.
    parentId: parentId === id ? null : parentId,
    parentName: text(value, ['PARENT_CATEGORY_NAME', 'PARENT_NAME']) || null,
    description: text(value, ['DESCRIPTION', 'CATEGORY_DESCRIPTION']),
    image,
    ...(image && isS3ImageKey(image) ? { imageKey: image } : image ? { imagePath: image } : {}),
    status: categoryStatus(value),
    createdAt: text(value, ['CREATED_AT', 'CREATED_DATE']) || null,
    updatedAt: text(value, ['UPDATED_AT', 'UPDATED_DATE']) || null,
  };
}

/** Checks the `status` / `success` envelope; throws the API's message (or `fallback`) when it reports a failure. */
function assertSuccess(response: Record<string, unknown>, fallback: string): void {
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  if ((status !== undefined && !isSuccessful(status)) || (success !== undefined && !isSuccessful(success))) {
    throw new Error(text(response, ['message', 'MESSAGE']) || fallback);
  }
}

function mapCategoryPage(response: unknown): CategoryPage {
  if (!isRecord(response)) throw new Error('The category API returned an invalid response.');
  assertSuccess(response, 'Categories could not be loaded.');
  const data = response['data'] ?? response['DATA'];
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    throw new Error('The category API returned an invalid category list.');
  }
  const total = Number(firstValue(response, ['total_records', 'TOTAL_RECORDS', 'total', 'totalRecords']));
  return {
    categories: (Array.isArray(data) ? data : []).map(mapCategory),
    total: Number.isSafeInteger(total) && total >= 0 ? total : null,
  };
}

/** An insert / update / delete response: its message, or an error when it reports a failure. */
function mapMutationResponse(response: unknown, fallback: string, failure: string): string {
  if (response === null || response === undefined) return fallback;
  if (typeof response === 'string') {
    const body = response.trim();
    if (!body || SUCCESS_VALUES.includes(body.toUpperCase())) return fallback;
    throw new Error(body);
  }
  if (!isRecord(response)) throw new Error('The category API returned an invalid response.');
  assertSuccess(response, failure);
  return text(response, ['message', 'MESSAGE']) || fallback;
}

/** The form value as the insert / update body fields: a trimmed name and description, and a positive parent ID. */
function categoryFields(value: CategoryFormValue): Omit<CategoryInsertPayload, 'CREATED_BY'> | string {
  const name = value.name.trim();
  if (!name) return 'Category name is required.';
  if (value.parentId !== null && (!Number.isSafeInteger(value.parentId) || value.parentId <= 0)) {
    return 'Parent category must be a positive whole number.';
  }
  if (value.status !== 'Active' && value.status !== 'Inactive') return 'Status must be Active or Inactive.';
  return {
    CATEGORY_NAME: name,
    PARENT_CATEGORY_ID: value.parentId,
    CATEGORY_IMAGE: value.image?.trim() || null,
    DESCRIPTION: value.description.trim(),
    STATUS: value.status,
  };
}

/**
 * Admin Category Management. Every successful insert, update and delete also drops the cached category lists of the
 * rest of the app (ProductCatalogService.invalidateCategoryLookups), so the product forms, All Products, Home,
 * Product Listing and the Header Menu read the new categories the next time they need them.
 */
@Injectable({ providedIn: 'root' })
export class CategoryManagementService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(ProductCatalogService);

  /** One page: GET category_management/get?CATEGORY_ID=-1&LIMIT=…&OFFSET=… (-1: every category). */
  loadPage(limit: number, offset: number): Observable<CategoryPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
      return throwError(() => new RangeError('LIMIT must be a positive and OFFSET a non-negative safe integer.'));
    }
    return this.api
      .get<unknown>(API_ENDPOINTS.categoryManagement.get, { CATEGORY_ID: -1, LIMIT: limit, OFFSET: offset })
      .pipe(map(mapCategoryPage));
  }

  /**
   * Every category (parents and subcategories), read a page at a time: the screen needs them all to name each
   * subcategory's parent, offer parents in the form, and search across every page. OFFSET advances by the rows
   * actually returned (so an API that caps LIMIT skips nothing); reading stops at total_records, a short or empty
   * page, a page with no new category, or MAX_CATEGORY_PAGES.
   */
  loadAll(): Observable<Category[]> {
    return defer(() => {
      const byId = new Map<number, Category>();
      const read = (pageIndex: number, offset: number) =>
        this.loadPage(ALL_CATEGORIES_PAGE_SIZE, offset).pipe(
          map(({ categories, total }) => {
            const added = categories.filter((category) => !byId.has(category.id));
            for (const category of added) byId.set(category.id, category);
            const nextOffset = offset + categories.length;
            const done =
              !added.length ||
              (total !== null ? nextOffset >= total : categories.length < ALL_CATEGORIES_PAGE_SIZE) ||
              pageIndex + 1 >= MAX_CATEGORY_PAGES;
            return { pageIndex, nextOffset, done };
          }),
        );
      return read(0, 0).pipe(
        expand(({ pageIndex, nextOffset, done }) => (done ? EMPTY : read(pageIndex + 1, nextOffset))),
        last(),
        map(() => [...byId.values()]),
      );
    });
  }

  /** POST category_management/insert. CREATED_BY is the signed-in Admin's user ID. */
  insertCategory(value: CategoryFormValue): Observable<string> {
    const fields = categoryFields(value);
    if (typeof fields === 'string') return throwError(() => new RangeError(fields));
    const createdBy = this.auth.userId();
    if (createdBy === undefined) {
      return throwError(() => new Error('A valid signed-in Admin is required to add a category.'));
    }
    const payload: CategoryInsertPayload = { ...fields, CREATED_BY: createdBy };
    return this.api.post<unknown>(API_ENDPOINTS.categoryManagement.insert, payload).pipe(
      map((response) =>
        mapMutationResponse(response, 'Category added successfully.', 'The category could not be added.'),
      ),
      tap(() => this.catalog.invalidateCategoryLookups()),
    );
  }

  /** PUT category_management/update. UPDATED_BY is the signed-in Admin's user ID; a category is never its own parent. */
  updateCategory(categoryId: number, value: CategoryFormValue): Observable<string> {
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
      return throwError(() => new RangeError('Category ID must be a positive safe integer.'));
    }
    const fields = categoryFields(value);
    if (typeof fields === 'string') return throwError(() => new RangeError(fields));
    if (fields.PARENT_CATEGORY_ID === categoryId) {
      return throwError(() => new RangeError('A category cannot be its own parent.'));
    }
    const updatedBy = this.auth.userId();
    if (updatedBy === undefined) {
      return throwError(() => new Error('A valid signed-in Admin is required to update a category.'));
    }
    const payload: CategoryUpdatePayload = { CATEGORY_ID: categoryId, ...fields, UPDATED_BY: updatedBy };
    return this.api.put<unknown>(API_ENDPOINTS.categoryManagement.update, payload).pipe(
      map((response) =>
        mapMutationResponse(response, 'Category updated successfully.', 'The category could not be updated.'),
      ),
      tap(() => this.catalog.invalidateCategoryLookups()),
    );
  }

  /** DELETE category_management/delete with `{ CATEGORY_ID }`. */
  deleteCategory(categoryId: number): Observable<string> {
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
      return throwError(() => new RangeError('Category ID must be a positive safe integer.'));
    }
    return this.api.delete<unknown>(API_ENDPOINTS.categoryManagement.delete, { CATEGORY_ID: categoryId }).pipe(
      map((response) =>
        mapMutationResponse(response, 'Category deleted successfully.', 'The category could not be deleted.'),
      ),
      tap(() => this.catalog.invalidateCategoryLookups()),
    );
  }

  /** A readable message for a failed category request: the API's message when it sends one. */
  getErrorMessage(error: unknown, fallback = 'The category request failed. Please try again.'): string {
    if (error instanceof HttpErrorResponse) {
      const raw: unknown = error.error;
      let body: unknown = raw;
      if (typeof raw === 'string' && raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          if (raw.trim().length <= 200 && !raw.includes('<')) return raw.trim();
        }
      }
      if (isRecord(body)) {
        const message = text(body, ['message', 'MESSAGE', 'error', 'ERROR']);
        if (message) return message;
      }
      return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
