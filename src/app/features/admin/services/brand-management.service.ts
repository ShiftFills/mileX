import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, tap, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { AuthService } from '@core/services/auth.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { isS3ImageKey } from '@core/services/s3-image.service';

// CHANGED (new): Admin Brand Management (brand_management/get, insert, update, delete).

/** The STATUS values the brand APIs take ("ACTIVE" / "INACTIVE", as in the documented requests). */
export type BrandStatus = 'ACTIVE' | 'INACTIVE';

/** One brand_management/get record. Every brand belongs to one category and one of its subcategories. */
export interface Brand {
  id: number;
  name: string;
  description: string;
  /** BRAND_LOGO as stored (an S3 key such as "brands/<file>", or another path); null without one. */
  logo: string | null;
  /** The logo as the image display service reads it: an S3 key, or another path. */
  imageKey?: string;
  imagePath?: string;
  status: BrandStatus;
  categoryId: number | null;
  /** CATEGORY_NAME / SUB_CATEGORY_NAME when the API sends them (the screen otherwise names them from the lookups). */
  categoryName: string | null;
  subCategoryId: number | null;
  subCategoryName: string | null;
  /** CREATED_AT / UPDATED_AT as the API sends them; null when it sends none. */
  createdAt: string | null;
  updatedAt: string | null;
}

/** One brand_management/get page. `total` is total_records when the API sends it. */
export interface BrandPage {
  brands: Brand[];
  total: number | null;
}

/** Server-side listing filters and paging. A null (or omitted) category or subcategory is sent as -1 (all). */
export interface BrandPageQuery {
  categoryId?: number | null;
  subCategoryId?: number | null;
  limit: number;
  offset: number;
}

/** What the Add/Edit form saves (the same fields for insert and update). */
export interface BrandFormValue {
  name: string;
  description: string;
  /** The BRAND_LOGO to save: an S3 key, the brand's existing value, or null for none. */
  logo: string | null;
  status: BrandStatus;
  categoryId: number;
  subCategoryId: number;
}

export interface BrandInsertPayload {
  BRAND_NAME: string;
  BRAND_LOGO: string | null;
  DESCRIPTION: string;
  STATUS: BrandStatus;
  CATEGORY_ID: number;
  SUB_CATEGORY_ID: number;
  CREATED_BY: number;
}

export interface BrandUpdatePayload extends Omit<BrandInsertPayload, 'CREATED_BY'> {
  BRAND_ID: number;
  UPDATED_BY: number;
}

export interface BrandDeletePayload {
  BRAND_ID: number;
  CATEGORY_ID: number | null;
  SUB_CATEGORY_ID: number | null;
}

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

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
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

/** STATUS (or IS_ACTIVE) as "ACTIVE" / "INACTIVE"; a brand the API sends without one counts as active. */
function brandStatus(record: Record<string, unknown>): BrandStatus {
  const value = firstValue(record, ['STATUS', 'IS_ACTIVE', 'BRAND_STATUS']);
  if (value === false || value === 0) return 'INACTIVE';
  if (typeof value === 'string' && ['INACTIVE', '0', 'FALSE', 'DISABLED'].includes(value.trim().toUpperCase())) {
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

function mapBrand(value: unknown): Brand {
  if (!isRecord(value)) throw new Error('The brand API returned an invalid brand.');
  const id = positiveId(firstValue(value, ['BRAND_ID', 'ID']));
  const name = text(value, ['BRAND_NAME', 'NAME']);
  if (id === null || !name) throw new Error('The brand API returned a brand without a valid ID or name.');
  const logo = text(value, ['BRAND_LOGO', 'LOGO', 'BRAND_IMAGE', 'IMAGE_URL']) || null;
  return {
    id,
    name,
    description: text(value, ['DESCRIPTION', 'BRAND_DESCRIPTION']),
    logo,
    ...(logo && isS3ImageKey(logo) ? { imageKey: logo } : logo ? { imagePath: logo } : {}),
    status: brandStatus(value),
    categoryId: positiveId(firstValue(value, ['CATEGORY_ID'])),
    categoryName: text(value, ['CATEGORY_NAME']) || null,
    subCategoryId: positiveId(firstValue(value, ['SUB_CATEGORY_ID', 'SUBCATEGORY_ID'])),
    subCategoryName: text(value, ['SUB_CATEGORY_NAME', 'SUBCATEGORY_NAME']) || null,
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

function mapBrandPage(response: unknown): BrandPage {
  if (!isRecord(response)) throw new Error('The brand API returned an invalid response.');
  assertSuccess(response, 'Brands could not be loaded.');
  const data = response['data'] ?? response['DATA'];
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    throw new Error('The brand API returned an invalid brand list.');
  }
  const total = Number(firstValue(response, ['total_records', 'TOTAL_RECORDS', 'total', 'totalRecords', 'TOTAL_COUNT']));
  return {
    brands: (Array.isArray(data) ? data : []).map(mapBrand),
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
  if (!isRecord(response)) throw new Error('The brand API returned an invalid response.');
  assertSuccess(response, failure);
  return text(response, ['message', 'MESSAGE']) || fallback;
}

/** The form value as the insert / update body fields, or the reason it cannot be saved. */
function brandFields(value: BrandFormValue): Omit<BrandInsertPayload, 'CREATED_BY'> | string {
  const name = value.name.trim();
  if (!name) return 'Brand name is required.';
  if (!isPositiveId(value.categoryId)) return 'Category must be a positive whole number.';
  if (!isPositiveId(value.subCategoryId)) return 'Subcategory must be a positive whole number.';
  if (value.status !== 'ACTIVE' && value.status !== 'INACTIVE') return 'Status must be ACTIVE or INACTIVE.';
  return {
    BRAND_NAME: name,
    BRAND_LOGO: value.logo?.trim() || null,
    DESCRIPTION: value.description.trim(),
    STATUS: value.status,
    CATEGORY_ID: value.categoryId,
    SUB_CATEGORY_ID: value.subCategoryId,
  };
}

/**
 * Admin Brand Management. Every successful insert, update and delete also drops the cached brand lists of the rest
 * of the app (ProductCatalogService.invalidateBrandLookups), so the product forms, All Products and the Wishlist
 * read the new brands the next time they need them.
 */
@Injectable({ providedIn: 'root' })
export class BrandManagementService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(ProductCatalogService);

  /**
   * One page: GET brand_management/get?BRAND_ID=-1&CATEGORY_ID=…&SUB_CATEGORY_ID=…&LIMIT=…&OFFSET=…, filtered by
   * the API (a category or subcategory left out is sent as -1: all).
   */
  loadPage(query: BrandPageQuery): Observable<BrandPage> {
    const { limit, offset } = query;
    if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(offset) || offset < 0) {
      return throwError(() => new RangeError('LIMIT must be a positive and OFFSET a non-negative safe integer.'));
    }
    const categoryId = query.categoryId ?? null;
    const subCategoryId = query.subCategoryId ?? null;
    if ((categoryId !== null && !isPositiveId(categoryId)) || (subCategoryId !== null && !isPositiveId(subCategoryId))) {
      return throwError(() => new RangeError('Category and subcategory IDs must be positive safe integers.'));
    }
    return this.api
      .get<unknown>(API_ENDPOINTS.brandManagement.get, {
        BRAND_ID: -1,
        CATEGORY_ID: categoryId ?? -1,
        SUB_CATEGORY_ID: subCategoryId ?? -1,
        LIMIT: limit,
        OFFSET: offset,
      })
      .pipe(map(mapBrandPage));
  }

  /** POST brand_management/insert. CREATED_BY is the signed-in Admin's user ID. */
  insertBrand(value: BrandFormValue): Observable<string> {
    const fields = brandFields(value);
    if (typeof fields === 'string') return throwError(() => new RangeError(fields));
    const createdBy = this.auth.userId();
    if (createdBy === undefined) {
      return throwError(() => new Error('A valid signed-in Admin is required to add a brand.'));
    }
    const payload: BrandInsertPayload = { ...fields, CREATED_BY: createdBy };
    return this.api.post<unknown>(API_ENDPOINTS.brandManagement.insert, payload).pipe(
      map((response) => mapMutationResponse(response, 'Brand added successfully.', 'The brand could not be added.')),
      tap(() => this.catalog.invalidateBrandLookups()),
    );
  }

  /** PUT brand_management/update. UPDATED_BY is the signed-in Admin's user ID. */
  updateBrand(brandId: number, value: BrandFormValue): Observable<string> {
    if (!isPositiveId(brandId)) return throwError(() => new RangeError('Brand ID must be a positive safe integer.'));
    const fields = brandFields(value);
    if (typeof fields === 'string') return throwError(() => new RangeError(fields));
    const updatedBy = this.auth.userId();
    if (updatedBy === undefined) {
      return throwError(() => new Error('A valid signed-in Admin is required to update a brand.'));
    }
    const payload: BrandUpdatePayload = { BRAND_ID: brandId, ...fields, UPDATED_BY: updatedBy };
    return this.api.put<unknown>(API_ENDPOINTS.brandManagement.update, payload).pipe(
      map((response) =>
        mapMutationResponse(response, 'Brand updated successfully.', 'The brand could not be updated.'),
      ),
      tap(() => this.catalog.invalidateBrandLookups()),
    );
  }

  /** DELETE brand_management/delete with `{ BRAND_ID, CATEGORY_ID, SUB_CATEGORY_ID }` (the brand's own IDs). */
  deleteBrand(brand: Pick<Brand, 'id' | 'categoryId' | 'subCategoryId'>): Observable<string> {
    if (!isPositiveId(brand.id)) return throwError(() => new RangeError('Brand ID must be a positive safe integer.'));
    const payload: BrandDeletePayload = {
      BRAND_ID: brand.id,
      CATEGORY_ID: brand.categoryId,
      SUB_CATEGORY_ID: brand.subCategoryId,
    };
    return this.api.delete<unknown>(API_ENDPOINTS.brandManagement.delete, payload).pipe(
      map((response) =>
        mapMutationResponse(response, 'Brand deleted successfully.', 'The brand could not be deleted.'),
      ),
      tap(() => this.catalog.invalidateBrandLookups()),
    );
  }

  /** A readable message for a failed brand request: the API's message when it sends one. */
  getErrorMessage(error: unknown, fallback = 'The brand request failed. Please try again.'): string {
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
