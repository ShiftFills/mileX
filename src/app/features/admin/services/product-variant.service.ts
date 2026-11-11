import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';

export interface ProductVariant {
  id: string;
  productId: number | null;
  name: string;
  imageUrl: string;
  sku: string;
  barcode: string;
  color: string;
  material: string;
  size: string;
  weight: string;
  stock: number;
  price: number;
  imagePath: string;
  sellerId: number | null;
  sellerName: string | null;
  createdBy: number | null;
  status: string;
}

export interface ProductVariantPage {
  items: ProductVariant[];
  total?: number;
  hasNext: boolean;
}

export interface ProductVariantInsertPayload {
  VARIANT_NAME: string;
  SKU: string;
  BARCODE: string | null;
  SIZE_ID?: number;
  COLOUR_ID?: number;
  MATERIAL_ID?: number;
  WEIGHT: number | null;
  PRICE: number;
  STOCK_QUANTITY: number;
  VARIANT_IMAGE: string;
  PRODUCT_ID: number;
  SELLER_ID: number;
  SELLER_NAME: string;
  CREATED_BY: number;
}

export interface ProductVariantUpdatePayload {
  VARIANT_ID: number;
  VARIANT_NAME: string;
  BARCODE: string | null;
  SIZE_ID?: number;
  SIZE?: string;
  COLOR_ID?: number;
  COLOR?: string;
  MATERIAL_ID?: number;
  MATERIAL?: string;
  WEIGHT: number | null;
  PRICE: number;
  STOCK_QUANTITY: number;
  VARIANT_IMAGE: string;
  PRODUCT_ID: number;
  SELLER_ID: number;
  SELLER_NAME: string;
  STATUS: string;
  CREATED_BY: number;
}

export interface ProductVariantDeletePayload {
  PRODUCT_ID: number;
  VARIANT_ID: number;
}

export interface ProductVariantLookupOption {
  id: string;
  name: string;
}

export type ProductVariantLookup = 'colours' | 'sizes' | 'materials';

interface ProductVariantLookupDefinition {
  path: string;
  idParameter: string;
  idFields: readonly string[];
  nameFields: readonly string[];
}

const PRODUCT_VARIANT_LOOKUPS: Record<ProductVariantLookup, ProductVariantLookupDefinition> = {
  colours: {
    path: API_ENDPOINTS.variantLookups.colours,
    idParameter: 'COLOUR_ID',
    idFields: ['COLOUR_ID', 'COLOR_ID', 'ID'],
    nameFields: ['COLOUR_NAME', 'COLOR_NAME', 'COLOUR', 'COLOR', 'NAME'],
  },
  sizes: {
    path: API_ENDPOINTS.variantLookups.sizes,
    idParameter: 'SIZE_ID',
    idFields: ['SIZE_ID', 'ID'],
    nameFields: ['SIZE_NAME', 'SIZE', 'NAME'],
  },
  materials: {
    path: API_ENDPOINTS.variantLookups.materials,
    idParameter: 'MATERIAL_ID',
    idFields: ['MATERIAL_ID', 'ID'],
    nameFields: ['MATERIAL_NAME', 'MATERIAL', 'NAME'],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapVariantLookup(
  response: unknown,
  lookup: ProductVariantLookup,
  definition: ProductVariantLookupDefinition,
): ProductVariantLookupOption[] {
  if (!isRecord(response)) {
    throw new Error(`The ${lookup} API returned an invalid response.`);
  }
  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  if (
    status !== undefined &&
    status !== true &&
    !(
      typeof status === 'string' &&
      ['SUCCESS', 'OK', '200'].includes(status.trim().toUpperCase())
    )
  ) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `The ${lookup} API could not load its options.`,
    );
  }
  const data = response['data'] ?? response['DATA'];
  if (!Array.isArray(data)) {
    throw new Error(`The ${lookup} API returned an invalid option list.`);
  }
  return data.map((entry) => {
    if (!isRecord(entry)) {
      throw new Error(`The ${lookup} API returned an invalid option.`);
    }
    const rawId = definition.idFields.map((field) => entry[field]).find((value) => value != null);
    const rawName = definition.nameFields
      .map((field) => entry[field])
      .find((value) => value !== undefined && value !== null);
    const id = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId).trim() : '';
    const name =
      typeof rawName === 'string' || typeof rawName === 'number' ? String(rawName).trim() : '';
    if (!id || !name) {
      throw new Error(`The ${lookup} API returned an option with missing ID or name.`);
    }
    return { id, name };
  });
}

function firstValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key] ?? record[key.toUpperCase()];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function textValue(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback = '—',
): string {
  const value = firstValue(record, keys);
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim() || fallback
    : fallback;
}

function optionalTextValue(record: Record<string, unknown>, keys: readonly string[]): string {
  const value = firstValue(record, keys);
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function numericValue(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  const value = firstValue(record, keys);
  if (value === undefined) return undefined;
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(number)) {
    throw new Error(`The product variants API returned an invalid ${keys[0]} value.`);
  }
  return number;
}

function metadataNumber(
  sources: readonly Record<string, unknown>[],
  keys: readonly string[],
): number | undefined {
  for (const source of sources) {
    const value = numericValue(source, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function mapVariant(value: unknown): ProductVariant {
  if (!isRecord(value)) throw new Error('The product variants API returned an invalid variant.');

  const rawId = firstValue(value, ['VARIANT_ID', 'PRODUCT_VARIANT_ID', 'ID']);
  const name = textValue(value, ['VARIANT_NAME', 'PRODUCT_VARIANT_NAME', 'NAME'], '');
  if (
    (typeof rawId !== 'string' && typeof rawId !== 'number') ||
    !String(rawId).trim() ||
    !name
  ) {
    throw new Error('The product variants API returned a variant with missing required fields.');
  }

  return {
    id: String(rawId),
    productId: numericValue(value, ['PRODUCT_ID']) ?? null,
    name,
    imageUrl: textValue(value, ['VARIANT_IMAGE_URL', 'VARIANT_IMAGE', 'IMAGE_URL'], '/images/latest-gadgets.svg'),
    imagePath: textValue(value, ['VARIANT_IMAGE', 'VARIANT_IMAGE_URL', 'IMAGE_URL'], ''),
    sku: textValue(value, ['VARIANT_SKU', 'PRODUCT_CODE_SKU', 'SKU']),
    barcode: optionalTextValue(value, ['VARIANT_BARCODE', 'BARCODE', 'BAR_CODE']),
    color: optionalTextValue(value, ['VARIANT_COLOR', 'COLOR', 'COLOUR']),
    material: optionalTextValue(value, ['VARIANT_MATERIAL', 'MATERIAL']),
    size: optionalTextValue(value, ['VARIANT_SIZE', 'SIZE']),
    weight: textValue(value, ['VARIANT_WEIGHT', 'WEIGHT', 'WEIGHT_KG'], ''),
    stock: numericValue(value, ['VARIANT_STOCK', 'STOCK_QUANTITY', 'AVAILABLE_STOCK', 'QUANTITY']) ?? 0,
    price: numericValue(value, ['SELLING_PRICE', 'VARIANT_SELLING_PRICE', 'VARIANT_PRICE', 'PRICE']) ?? 0,
    sellerId: numericValue(value, ['SELLER_ID']) ?? null,
    sellerName: textValue(value, ['SELLER_NAME'], ''),
    createdBy: numericValue(value, ['CREATED_BY']) ?? null,
    status: textValue(value, ['STATUS'], ''),
  };
}

function mapVariantPage(response: unknown, limit: number, offset: number): ProductVariantPage {
  if (!isRecord(response) && !Array.isArray(response)) {
    throw new Error('The product variants API returned an invalid response.');
  }
  if (
    isRecord(response) &&
    response['status'] !== undefined &&
    (typeof response['status'] !== 'string' || response['status'].toUpperCase() !== 'SUCCESS')
  ) {
    const message = typeof response['message'] === 'string' ? response['message'] : '';
    throw new Error(message || 'The product variants API could not load variants.');
  }

  const data = isRecord(response) ? response['data'] : response;
  const dataRecord = isRecord(data) ? data : undefined;
  const entries = Array.isArray(data)
    ? data
    : Array.isArray(dataRecord?.['items'])
      ? dataRecord['items']
      : Array.isArray(dataRecord?.['variants'])
        ? dataRecord['variants']
        : isRecord(response) && Array.isArray(response['items'])
          ? response['items']
          : null;
  if (!entries) throw new Error('The product variants API returned an invalid variant list.');

  const items = entries.map(mapVariant);
  const metadata = [
    isRecord(dataRecord?.['pagination']) ? dataRecord['pagination'] : undefined,
    isRecord(dataRecord?.['meta']) ? dataRecord['meta'] : undefined,
    isRecord(response) && isRecord(response['pagination']) ? response['pagination'] : undefined,
    isRecord(response) && isRecord(response['meta']) ? response['meta'] : undefined,
    dataRecord,
    isRecord(response) ? response : undefined,
  ].filter((source): source is Record<string, unknown> => source !== undefined);
  const total = metadataNumber(metadata, [
    'total',
    'totalRecords',
    'total_records',
    'totalCount',
    'total_count',
    'totalItems',
    'total_items',
  ]);
  const totalPages = metadataNumber(metadata, ['totalPages', 'total_pages', 'pages']);
  const currentPage =
    metadataNumber(metadata, ['page', 'currentPage', 'current_page', 'pageNumber', 'page_number']) ??
    Math.floor(offset / limit) + 1;
  if (
    (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) ||
    (totalPages !== undefined && (!Number.isSafeInteger(totalPages) || totalPages < 0)) ||
    !Number.isSafeInteger(currentPage) ||
    currentPage < 1
  ) {
    throw new Error('The product variants API returned invalid pagination metadata.');
  }

  return {
    items,
    ...(total !== undefined ? { total } : {}),
    hasNext:
      total !== undefined
        ? offset + items.length < total
        : totalPages !== undefined
          ? currentPage < totalPages
          : items.length === limit,
  };
}

function mapVariantInsertResponse(response: unknown): string {
  if (!isRecord(response)) {
    throw new Error('The product variant API returned an invalid response.');
  }

  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  const data = response['data'] ?? response['DATA'];
  const successValue = isRecord(data) ? data['SUCCES'] ?? data['SUCCESS'] : undefined;
  const statusIsSuccess =
    (typeof status === 'string' || typeof status === 'number') &&
    ['SUCCESS', 'OK', '200', '201'].includes(String(status).trim().toUpperCase());
  const dataIsFailure =
    successValue !== undefined &&
    (typeof successValue !== 'string' ||
      !['SUCCESS', 'SUCCES'].includes(successValue.trim().toUpperCase()));
  if (!statusIsSuccess || dataIsFailure || response['success'] === false || response['SUCCESS'] === false) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : 'The product variant could not be added.',
    );
  }

  return typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Product variant added successfully.';
}

function mapVariantMutationResponse(response: unknown, action: 'updated' | 'deleted'): string {
  if (!isRecord(response)) {
    throw new Error(`The product variant API returned an invalid ${action} response.`);
  }
  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  const data = response['data'] ?? response['DATA'];
  const successValue = isRecord(data) ? data['SUCCES'] ?? data['SUCCESS'] : undefined;
  const normalizedStatus =
    typeof status === 'string' || typeof status === 'number'
      ? String(status).trim().toUpperCase()
      : '';
  const statusSucceeded =
    status === true ||
    status === 1 ||
    ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(normalizedStatus);
  const successSucceeded =
    response['success'] === true ||
    response['SUCCESS'] === true ||
    response['success'] === 1 ||
    response['SUCCESS'] === 1 ||
    (typeof successValue === 'string' &&
      ['SUCCESS', 'SUCCES', 'TRUE', '1'].includes(successValue.trim().toUpperCase()));
  if (
    (!statusSucceeded && !successSucceeded) ||
    response['success'] === false ||
    response['SUCCESS'] === false ||
    (typeof status === 'string' && ['FAILURE', 'FAILED', 'ERROR'].includes(normalizedStatus))
  ) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `The product variant could not be ${action}.`,
    );
  }
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : `Product variant ${action} successfully.`;
}

@Injectable({ providedIn: 'root' })
export class ProductVariantService {
  private readonly api = inject(ApiService);
  private readonly lookupRequests = new Map<ProductVariantLookup, Observable<ProductVariantLookupOption[]>>();

  loadLookup(lookup: ProductVariantLookup): Observable<ProductVariantLookupOption[]> {
    const cached = this.lookupRequests.get(lookup);
    if (cached) return cached;

    const definition = PRODUCT_VARIANT_LOOKUPS[lookup];
    const request = this.api
      .get<unknown>(definition.path, {
        [definition.idParameter]: -1,
        LIMIT: 10,
        OFFSET: 0,
      })
      .pipe(
        map((response) => mapVariantLookup(response, lookup, definition)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.lookupRequests.set(lookup, request);
    return request;
  }

  loadPage(page: number, limit: number): Observable<ProductVariantPage> {
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new RangeError('Page must be a positive safe integer.');
    }


    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError('Page size must be a positive safe integer.');
    }
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) {
      throw new RangeError('The requested page offset is outside the supported range.');
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.productVariants.get, {
        LIMIT: limit,
        OFFSET: offset,
      })
      .pipe(map((response) => mapVariantPage(response, limit, offset)));
  }

  insertVariant(payload: ProductVariantInsertPayload): Observable<string> {
    return this.api
      .post<unknown>(API_ENDPOINTS.productVariants.insert, payload)
      .pipe(map(mapVariantInsertResponse));
  }

  updateVariant(payload: ProductVariantUpdatePayload): Observable<string> {
    if (!Number.isSafeInteger(payload.VARIANT_ID) || payload.VARIANT_ID <= 0) {
      throw new RangeError('Variant ID must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(payload.PRODUCT_ID) || payload.PRODUCT_ID <= 0) {
      throw new RangeError('Product ID must be a positive safe integer.');
    }
    return this.api
      .put<unknown>(API_ENDPOINTS.productVariants.update, payload)
      .pipe(map((response) => mapVariantMutationResponse(response, 'updated')));
  }

  deleteVariant(payload: ProductVariantDeletePayload): Observable<string> {
    if (!Number.isSafeInteger(payload.VARIANT_ID) || payload.VARIANT_ID <= 0) {
      throw new RangeError('Variant ID must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(payload.PRODUCT_ID) || payload.PRODUCT_ID <= 0) {
      throw new RangeError('Product ID must be a positive safe integer.');
    }
    return this.api
      .delete<unknown>(API_ENDPOINTS.productVariants.delete, payload)
      .pipe(map((response) => mapVariantMutationResponse(response, 'deleted')));
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body)) {
        const message = body['message'] ?? body['MESSAGE'];
        if (typeof message === 'string' && message.trim()) return message.trim();
      }
      return error.status
        ? `The product variants request failed (HTTP ${error.status}).`
        : 'The product variants request failed. Check your connection and try again.';
    }
    return error instanceof Error ? error.message : 'The product variants request failed. Please try again.';
  }
}
