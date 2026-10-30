import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';

export interface ProductVariant {
  id: string;
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
}

export interface ProductVariantPage {
  items: ProductVariant[];
  total?: number;
  hasNext: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    name,
    imageUrl: textValue(value, ['VARIANT_IMAGE_URL', 'IMAGE_URL'], '/images/latest-gadgets.svg'),
    sku: textValue(value, ['VARIANT_SKU', 'PRODUCT_CODE_SKU', 'SKU']),
    barcode: textValue(value, ['VARIANT_BARCODE', 'BARCODE', 'BAR_CODE']),
    color: textValue(value, ['VARIANT_COLOR', 'COLOR', 'COLOUR']),
    material: textValue(value, ['VARIANT_MATERIAL', 'MATERIAL']),
    size: textValue(value, ['VARIANT_SIZE', 'SIZE']),
    weight: textValue(value, ['VARIANT_WEIGHT', 'WEIGHT', 'WEIGHT_KG'], ''),
    stock: numericValue(value, ['VARIANT_STOCK', 'STOCK_QUANTITY', 'AVAILABLE_STOCK', 'QUANTITY']) ?? 0,
    price: numericValue(value, ['SELLING_PRICE', 'VARIANT_SELLING_PRICE', 'VARIANT_PRICE', 'PRICE']) ?? 0,
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

@Injectable({ providedIn: 'root' })
export class ProductVariantService {
  private readonly api = inject(ApiService);

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

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body) && typeof body['message'] === 'string') return body['message'];
      return error.status
        ? `Product variants could not be loaded (HTTP ${error.status}).`
        : 'Product variants could not be loaded. Check your connection and try again.';
    }
    return error instanceof Error ? error.message : 'Product variants could not be loaded. Please try again.';
  }
}
