import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, ReplaySubject, catchError, map, shareReplay, throwError } from 'rxjs';
import { PaginatedResponse, Product } from '@shared/models';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { ApiService } from './api.service';

export type ProductCatalogStatus = 'idle' | 'loading' | 'success' | 'error';

const FALLBACK_IMAGE = '/images/latest-gadgets.svg';
const MAX_CACHED_PRODUCT_PAGES = 20;

export interface ProductLookupOption {
  id: string;
  label: string;
}

interface ProductLookupDefinition {
  path: string;
  idParameter: string;
  idField: string;
  labelField: string;
  labelSuffix?: string;
  isActive?: (record: Record<string, unknown>) => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numericValue(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapProduct(value: unknown): Product | null {
  if (!isRecord(value)) return null;

  const rawId = value['PRODUCT_ID'];
  const name = typeof value['PRODUCT_NAME'] === 'string' ? value['PRODUCT_NAME'].trim() : '';
  const price = numericValue(value['SELLING_PRICE']) ?? numericValue(value['PRICE']);
  if (
    (typeof rawId !== 'string' && typeof rawId !== 'number') ||
    !String(rawId).trim() ||
    !name ||
    price === undefined ||
    price < 0
  ) {
    return null;
  }

  const stock = numericValue(value['STOCK_QUANTITY']);
  const originalPrice = numericValue(value['PRICE']);
  const maxOrderQuantity = numericValue(value['MAXIMUM_ORDER_QUANTITY']);
  const categoryId = value['CATEGORY_ID'];
  const brandId = value['BRAND_ID'];
  const active = value['IS_ACTIVE'];
  const category =
    typeof categoryId === 'string' || typeof categoryId === 'number'
      ? `category-${categoryId}`
      : 'uncategorized';
  const brand =
    typeof brandId === 'string' || typeof brandId === 'number'
      ? `brand-${brandId}`
      : undefined;
  const images = typeof value['IMAGE_URL'] === 'string' && value['IMAGE_URL'].trim()
    ? [value['IMAGE_URL'].trim()]
    : undefined;
  const hasDiscount = originalPrice !== undefined && originalPrice > price;
  const isActive =
    active === true ||
    active === 1 ||
    (typeof active === 'string' && active.trim().toUpperCase() === '1') ||
    (typeof active === 'string' && active.trim().toUpperCase() === 'TRUE');

  return {
    id: String(rawId),
    name,
    description:
      typeof value['PRODUCT_DESCRIPTION'] === 'string' && value['PRODUCT_DESCRIPTION'].trim()
        ? value['PRODUCT_DESCRIPTION'].trim()
        : 'Product description is not available.',
    price,
    currency: 'INR',
    imageUrl: images?.[0] ?? FALLBACK_IMAGE,
    ...(typeof value['PRODUCT_CODE_SKU'] === 'string'
      ? { sku: value['PRODUCT_CODE_SKU'].trim() }
      : {}),
    ...(brand ? { brand } : {}),
    ...(active !== undefined && active !== null
      ? { isActive }
      : {}),
    ...(images ? { images } : {}),
    category,
    inStock: stock !== undefined && stock > 0,
    ...(stock !== undefined ? { stockLeft: stock } : {}),
    ...(maxOrderQuantity !== undefined && maxOrderQuantity > 0
      ? { maxOrderQuantity }
      : {}),
    ...(hasDiscount ? { originalPrice, discountLabel: `${Math.round((1 - price / originalPrice) * 100)}% OFF` } : {}),
  };
}

function mapProductsResponse(response: unknown): Product[] {
  if (!isRecord(response) || typeof response['status'] !== 'string') {
    throw new Error('The products API returned an invalid response.');
  }

  if (response['status'].toUpperCase() !== 'SUCCESS') {
    const message = typeof response['message'] === 'string' ? response['message'] : '';
    throw new Error(message || 'The products API could not load products.');
  }

  const data = response['data'];
  if (!Array.isArray(data)) throw new Error('The products API returned an invalid product list.');

  const activeEntries = data.filter((entry) => {
    if (!isRecord(entry)) return true;
    const active = entry['IS_ACTIVE'];
    return active !== false && active !== 0 && !(typeof active === 'string' && active.trim() === '0');
  });
  const products = activeEntries.map(mapProduct);
  if (products.some((product) => product === null)) {
    throw new Error('The products API returned a product with missing or invalid required fields.');
  }

  return products.filter((product): product is Product => product !== null);
}

function findNumber(
  sources: readonly Record<string, unknown>[],
  keys: readonly string[],
): number | undefined {
  for (const source of sources) {
    for (const key of keys) {
      const value = numericValue(source[key] ?? source[key.toUpperCase()]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function mapProductPageResponse(
  response: unknown,
  requestedPage: number,
  requestedPageSize: number,
): PaginatedResponse<Product> {
  if (!isRecord(response)) {
    throw new Error('The products API returned an invalid paginated response.');
  }

  if (
    response['status'] !== undefined &&
    (typeof response['status'] !== 'string' || response['status'].toUpperCase() !== 'SUCCESS')
  ) {
    const message = typeof response['message'] === 'string' ? response['message'] : '';
    throw new Error(message || 'The products API could not load products.');
  }

  const data = response['data'];
  const dataRecord = isRecord(data) ? data : undefined;
  const entries = Array.isArray(data)
    ? data
    : Array.isArray(response['items'])
      ? response['items']
      : dataRecord && Array.isArray(dataRecord['items'])
        ? dataRecord['items']
        : dataRecord && Array.isArray(dataRecord['products'])
          ? dataRecord['products']
          : null;
  if (!entries) throw new Error('The products API returned an invalid product list.');

  const products = entries.map(mapProduct);
  if (products.some((product) => product === null)) {
    throw new Error('The products API returned a product with missing or invalid required fields.');
  }

  const metadataSources = [
    isRecord(dataRecord?.['pagination']) ? dataRecord['pagination'] : undefined,
    isRecord(dataRecord?.['meta']) ? dataRecord['meta'] : undefined,
    isRecord(response['pagination']) ? response['pagination'] : undefined,
    isRecord(response['meta']) ? response['meta'] : undefined,
    isRecord(response['metadata']) ? response['metadata'] : undefined,
    dataRecord,
    response,
  ].filter((source): source is Record<string, unknown> => source !== undefined);
  const reportedTotal = findNumber(metadataSources, [
    'total',
    'totalRecords',
    'total_records',
    'totalCount',
    'total_count',
    'totalItems',
    'total_items',
    'totalRecord',
    'total_record',
    'recordsTotal',
  ]);
  const pageSize =
    findNumber(metadataSources, ['pageSize', 'page_size', 'perPage', 'per_page', 'limit', 'LIMIT']) ??
    requestedPageSize;
  const page =
    findNumber(metadataSources, ['page', 'currentPage', 'current_page', 'pageNumber', 'page_number']) ??
    requestedPage;
  const totalPages =
    findNumber(metadataSources, ['totalPages', 'total_pages', 'pages']) ??
    (reportedTotal !== undefined && pageSize > 0
      ? Math.ceil(reportedTotal / pageSize)
      : products.length < requestedPageSize
        ? Math.ceil((offsetForPage(requestedPage, requestedPageSize) + products.length) / pageSize)
        : undefined);
  const total =
    reportedTotal ??
    (products.length < requestedPageSize
      ? offsetForPage(requestedPage, requestedPageSize) + products.length
      : undefined);

  if (
    (total !== undefined && (!Number.isInteger(total) || total < 0)) ||
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    (totalPages !== undefined &&
      (!Number.isInteger(totalPages) || totalPages < 0))
  ) {
    throw new Error('The products API returned invalid or missing pagination metadata.');
  }

  return {
    items: products.filter((product): product is Product => product !== null),
    ...(total !== undefined ? { total } : {}),
    page,
    pageSize,
    totalPages,
    hasNext: totalPages !== undefined ? page < totalPages : products.length === requestedPageSize,
  };
}

function offsetForPage(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

function lookupEntries(response: unknown, resource: string): readonly unknown[] {
  if (!isRecord(response)) {
    throw new Error(`The ${resource} API returned an invalid response.`);
  }
  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  if (
    status !== undefined &&
    status !== true &&
    (typeof status !== 'string' ||
      !['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase()))
  ) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `The ${resource} could not be loaded.`,
    );
  }

  const data = response['data'] ?? response['DATA'];
  if (!Array.isArray(data)) {
    throw new Error(`The ${resource} API returned an invalid list.`);
  }
  return data;
}

function mapLookupOptions(
  response: unknown,
  resource: string,
  definition: ProductLookupDefinition,
): ProductLookupOption[] {
  return lookupEntries(response, resource)
    .filter((entry) => {
      if (!isRecord(entry) || !definition.isActive) return true;
      return definition.isActive(entry);
    })
    .map((entry) => {
      if (!isRecord(entry)) {
        throw new Error(`The ${resource} API returned an invalid option.`);
      }
      const rawId = entry[definition.idField];
      const rawLabel = entry[definition.labelField];
      const id = numericValue(rawId);
      if (
        id === undefined ||
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        (typeof rawLabel !== 'string' && typeof rawLabel !== 'number') ||
        !String(rawLabel).trim()
      ) {
        throw new Error(`The ${resource} API returned an option with missing or invalid fields.`);
      }
      const label = String(rawLabel).trim();
      const formattedLabel = definition.labelSuffix
        ? `${Number(label)}${definition.labelSuffix}`
        : label;
      if (definition.labelSuffix && !Number.isFinite(Number(label))) {
        throw new Error(`The ${resource} API returned an option with an invalid percentage.`);
      }
      return {
        id: String(id),
        label: formattedLabel,
      };
    });
}

function isActiveBrand(record: Record<string, unknown>): boolean {
  const status = record['STATUS'];
  if (status === undefined || status === null || status === '') return false;
  if (status === true || status === 1) return true;
  return typeof status === 'string' && ['ACTIVE', '1', 'TRUE'].includes(status.trim().toUpperCase());
}

const PRODUCT_LOOKUP_DEFINITIONS: Readonly<
  Record<'categories' | 'brands' | 'taxRates', ProductLookupDefinition>
> = {
  categories: {
    path: API_ENDPOINTS.productLookups.categories,
    idParameter: 'CATEGORY_ID',
    idField: 'CATEGORY_ID',
    labelField: 'CATEGORY_NAME',
  },
  brands: {
    path: API_ENDPOINTS.productLookups.brands,
    idParameter: 'BRAND_ID',
    idField: 'BRAND_ID',
    labelField: 'BRAND_NAME',
    isActive: isActiveBrand,
  },
  taxRates: {
    path: API_ENDPOINTS.productLookups.taxRates,
    idParameter: 'TAX_RATE_ID',
    idField: 'TAX_RATE_ID',
    labelField: 'TAX_PERCENTAGE',
    labelSuffix: '%',
  },
};

@Injectable({ providedIn: 'root' })
export class ProductCatalogService {
  private readonly api = inject(ApiService);
  private readonly _products = signal<readonly Product[]>([]);
  private readonly _status = signal<ProductCatalogStatus>('idle');
  private readonly _error = signal<string | null>(null);
  private readonly productsLoaded = new ReplaySubject<readonly Product[]>(1);
  private readonly pageRequests = new Map<string, Observable<PaginatedResponse<Product>>>();
  private readonly lookupRequests = new Map<string, Observable<ProductLookupOption[]>>();

  readonly products = this._products.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly productsLoaded$ = this.productsLoaded.asObservable();

  load(): void {
    if (this._status() === 'loading' || this._status() === 'success') return;

    this._status.set('loading');
    this._error.set(null);
    this.api
      .get<unknown>(API_ENDPOINTS.products.get)
      .pipe(map(mapProductsResponse))
      .subscribe({
        next: (products) => {
          this._products.set(products);
          this._status.set('success');
          this.productsLoaded.next(products);
        },
        error: (error: unknown) => {
          this._status.set('error');
          this._error.set(this.getErrorMessage(error));
        },
      });
  }

  loadCategories(): Observable<ProductLookupOption[]> {
      return this.loadLookup('categories');
  }

  loadBrands(): Observable<ProductLookupOption[]> {
      return this.loadLookup('brands');
  }

  loadTaxRates(): Observable<ProductLookupOption[]> {
      return this.loadLookup('taxRates');
  }

  loadPage(page: number, pageSize: number): Observable<PaginatedResponse<Product>> {
    if (!Number.isSafeInteger(page) || page < 1) {
      return throwError(() => new RangeError('Page must be a positive safe integer.'));
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
      return throwError(() => new RangeError('Page size must be a positive safe integer.'));
    }

    const offset = offsetForPage(page, pageSize);
    if (!Number.isSafeInteger(offset)) {
      return throwError(() => new RangeError('The requested page offset is outside the supported range.'));
    }
    const cacheKey = `${pageSize}:${offset}`;
    const cachedRequest = this.pageRequests.get(cacheKey);
    if (cachedRequest) {
      // Map preserves insertion order, so reinserting marks this page as recently used.
      this.pageRequests.delete(cacheKey);
      this.pageRequests.set(cacheKey, cachedRequest);
      return cachedRequest;
    }

    let request: Observable<PaginatedResponse<Product>>;
    request = this.api
      .get<unknown>(API_ENDPOINTS.products.get, { LIMIT: pageSize, OFFSET: offset })
      .pipe(
        map((response) => mapProductPageResponse(response, page, pageSize)),
        catchError((error: unknown) => {
          // Do not let an older evicted request remove a newer request for this key.
          if (this.pageRequests.get(cacheKey) === request) this.pageRequests.delete(cacheKey);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    this.pageRequests.set(cacheKey, request);
    while (this.pageRequests.size > MAX_CACHED_PRODUCT_PAGES) {
      const oldestKey = this.pageRequests.keys().next().value;
      if (oldestKey === undefined) break;
      this.pageRequests.delete(oldestKey);
    }
    return request;
  }

  /** Clears cached pages after a successful product mutation or when fresh data is required. */
  invalidatePageCache(): void {
    this.pageRequests.clear();
  }

  findById(id: string): Product | undefined {
    return this._products().find((product) => product.id === id);
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body) && typeof body['message'] === 'string') return body['message'];
      return error.status
        ? `Products could not be loaded (HTTP ${error.status}).`
        : 'Products could not be loaded. Check your connection and try again.';
    }
    return error instanceof Error ? error.message : 'Products could not be loaded. Please try again.';
  }

  private loadLookup(key: keyof typeof PRODUCT_LOOKUP_DEFINITIONS): Observable<ProductLookupOption[]> {
    const cached = this.lookupRequests.get(key);
    if (cached) return cached;

    const definition = PRODUCT_LOOKUP_DEFINITIONS[key];
    let request: Observable<ProductLookupOption[]>;
    request = this.api
      .get<unknown>(definition.path, { [definition.idParameter]: -1 })
      .pipe(
        map((response) => mapLookupOptions(response, key, definition)),
        catchError((error: unknown) => {
          if (this.lookupRequests.get(key) === request) this.lookupRequests.delete(key);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.lookupRequests.set(key, request);
    return request;
  }
}
