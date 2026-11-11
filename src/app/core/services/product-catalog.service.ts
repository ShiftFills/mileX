import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, ReplaySubject, catchError, map, shareReplay, tap, throwError } from 'rxjs';
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

export interface ProductInsertPayload {
  PRODUCT_NAME: string;
  CATEGORY_ID: number;
  SUB_CATEGORY_ID: number;
  BRAND_ID: number;
  PRODUCT_IMAGE: string;
  PRODUCT_VIDEO: string | null;
  PRODUCT_DESCRIPTION: string;
  HSN_CODE: string;
  TAX_RATE: number;
  SELLING_PRICE: number;
  PRICE: number;
  DISCOUNT: number;
  STOCK_QUANTITY: number;
  MINIMUM_ORDER_QUANTITY: number;
  MAXIMUM_ORDER_QUANTITY: number;
  WEIGHT: number | null;
  LENGTH: number | null;
  WIDTH: number | null;
  HEIGHT: number | null;
  SELLER_ID: number;
  CREATED_BY: number;
}

export interface ProductUpdatePayload extends ProductInsertPayload {
  PRODUCT_ID: number;
}

export interface ProductDetails {
  PRODUCT_ID: number;
  PRODUCT_NAME: string;
  CATEGORY_ID: string;
  SUB_CATEGORY_ID: string;
  BRAND_ID: string;
  PRODUCT_CODE_SKU: string;
  PRODUCT_IMAGE: string | null;
  PRODUCT_VIDEO: string | null;
  PRODUCT_DESCRIPTION: string;
  HSN_CODE: string;
  TAX_RATE: string;
  SELLING_PRICE: string;
  PRICE: string;
  DISCOUNT: string;
  STOCK_QUANTITY: string;
  MINIMUM_ORDER_QUANTITY: string;
  MAXIMUM_ORDER_QUANTITY: string;
  WEIGHT: string;
  LENGTH: string;
  WIDTH: string;
  HEIGHT: string;
  HAS_VARIANTS?: boolean;
}

interface ProductLookupDefinition {
  path: string;
  idParameter?: string;
  idField: string;
  idAliases?: readonly string[];
  labelField: string;
  labelAliases?: readonly string[];
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

function productActiveStatus(value: unknown): boolean | undefined {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value !== 'string') return undefined;

  switch (value.trim().toUpperCase()) {
    case '1':
    case 'TRUE':
    case 'ACTIVE':
      return true;
    case '0':
    case 'FALSE':
    case 'INACTIVE':
      return false;
    default:
      return undefined;
  }
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
  const isActive = productActiveStatus(value['IS_ACTIVE']);
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
    ...((typeof value['PRODUCT_CODE_ID'] === 'string' || typeof value['PRODUCT_CODE_ID'] === 'number') &&
      String(value['PRODUCT_CODE_ID']).trim()
      ? { productCodeId: String(value['PRODUCT_CODE_ID']).trim() }
      : {}),
    ...(brand ? { brand } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
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

function productFieldText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function mapProductDetailsResponse(response: unknown, requestedId: number): ProductDetails | null {
  if (!isRecord(response)) throw new Error('The product details API returned an invalid response.');
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  const successfulStatus = status === undefined || status === true || status === 1 ||
    (typeof status === 'string' && ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(status.trim().toUpperCase()));
  const successfulFlag = success === undefined || success === true || success === 1 ||
    (typeof success === 'string' && ['TRUE', '1', 'SUCCESS'].includes(success.trim().toUpperCase()));
  if (!successfulStatus || !successfulFlag) {
    const message = response['message'] ?? response['MESSAGE'];
    throw new Error(typeof message === 'string' && message.trim() ? message.trim() : 'The product could not be loaded.');
  }

  const rawData = response['data'] ?? response['DATA'];
  if (!Array.isArray(rawData) && !isRecord(rawData)) {
    throw new Error('The product details API returned an invalid product.');
  }
  const rows = Array.isArray(rawData) ? rawData : [rawData];
  const record = rows.find((row) => isRecord(row) && Number(row['PRODUCT_ID']) === requestedId);
  if (!record) return null;
  if (!isRecord(record)) throw new Error('The product details API returned an invalid product.');

  const productId = numericValue(record['PRODUCT_ID']);
  if (productId === undefined || !Number.isSafeInteger(productId) || productId <= 0) {
    throw new Error('The product details API returned an invalid product ID.');
  }
  const rawHasVariants = record['HAS_VARIANTS'] ?? record['HAS_VARIANT'];
  const hasVariants = rawHasVariants === true || rawHasVariants === 1 ||
    (typeof rawHasVariants === 'string' && ['TRUE', '1', 'YES'].includes(rawHasVariants.trim().toUpperCase()));
  return {
    PRODUCT_ID: productId,
    PRODUCT_NAME: productFieldText(record['PRODUCT_NAME']),
    CATEGORY_ID: productFieldText(record['CATEGORY_ID']),
    SUB_CATEGORY_ID: productFieldText(record['SUB_CATEGORY_ID']),
    BRAND_ID: productFieldText(record['BRAND_ID']),
    PRODUCT_CODE_SKU: productFieldText(record['PRODUCT_CODE_SKU']),
    PRODUCT_IMAGE: productFieldText(record['PRODUCT_IMAGE']) || null,
    PRODUCT_VIDEO: productFieldText(record['PRODUCT_VIDEO']) || null,
    PRODUCT_DESCRIPTION: productFieldText(record['PRODUCT_DESCRIPTION']),
    HSN_CODE: productFieldText(record['HSN_CODE']),
    TAX_RATE: productFieldText(record['TAX_RATE']),
    SELLING_PRICE: productFieldText(record['SELLING_PRICE']),
    PRICE: productFieldText(record['PRICE']),
    DISCOUNT: productFieldText(record['DISCOUNT']),
    STOCK_QUANTITY: productFieldText(record['STOCK_QUANTITY']),
    MINIMUM_ORDER_QUANTITY: productFieldText(record['MINIMUM_ORDER_QUANTITY']),
    MAXIMUM_ORDER_QUANTITY: productFieldText(record['MAXIMUM_ORDER_QUANTITY']),
    WEIGHT: productFieldText(record['WEIGHT']),
    LENGTH: productFieldText(record['LENGTH']),
    WIDTH: productFieldText(record['WIDTH']),
    HEIGHT: productFieldText(record['HEIGHT']),
    ...(rawHasVariants !== undefined && rawHasVariants !== null ? { HAS_VARIANTS: hasVariants } : {}),
  };
}

function mapProductsResponse(response: unknown): Product[] {
  if (!isRecord(response)) {
    throw new Error('The products API returned an invalid response.');
  }

  // The backend reports success either as `status: "SUCCESS"` or as `success: true`,
  // so accept both (same tolerance as the paginated and lookup mappers below).
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  if (status === undefined && success === undefined) {
    throw new Error('The products API returned an invalid response.');
  }
  const successfulStatus =
    status === undefined ||
    status === true ||
    status === 1 ||
    (typeof status === 'string' && ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(status.trim().toUpperCase()));
  const successfulFlag =
    success === undefined ||
    success === true ||
    success === 1 ||
    (typeof success === 'string' && ['TRUE', '1', 'SUCCESS'].includes(success.trim().toUpperCase()));
  if (!successfulStatus || !successfulFlag) {
    const message = response['message'] ?? response['MESSAGE'];
    throw new Error(
      typeof message === 'string' && message.trim() ? message.trim() : 'The products API could not load products.',
    );
  }

  const data = response['data'] ?? response['DATA'];
  if (!Array.isArray(data)) throw new Error('The products API returned an invalid product list.');

  const activeEntries = data.filter((entry) => {
    if (!isRecord(entry)) return true;
    return productActiveStatus(entry['IS_ACTIVE']) !== false;
  });
  const products = activeEntries.map(mapProduct);
  if (products.some((product) => product === null)) {
    throw new Error('The products API returned a product with missing or invalid required fields.');
  }

  return products.filter((product): product is Product => product !== null);
}

function isProductInsertFailureMessage(message: string): boolean {
  return /\b(?:failure|failed|error|not inserted|could not|unable|invalid|duplicate|already exists)\b/i.test(message);
}

function isProductInsertSuccessMessage(message: string): boolean {
  return /^(?:SUCCESS|OK|200|201)\b/i.test(message) ||
    /\b(?:product )?(?:inserted|added) successfully\b/i.test(message);
}

function productInsertMessage(response: unknown): string {
  if (typeof response === 'string') {
    const message = response.trim();
    if (message.startsWith('{') || message.startsWith('[') || message.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(message);
        if (typeof parsed !== 'string' || parsed !== message) return productInsertMessage(parsed);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // A non-JSON text response is valid for this endpoint.
      }
    }
    if (isProductInsertFailureMessage(message)) throw new Error(message);
    if (isProductInsertSuccessMessage(message)) return message;
    throw new Error(message || 'The product API returned an empty response.');
  }
  if (!isRecord(response)) {
    throw new Error('The product API returned an invalid response.');
  }

  const status = response['status'] ?? response['STATUS'];
  const normalizedStatus = typeof status === 'string' || typeof status === 'number'
    ? String(status).trim().toUpperCase()
    : undefined;
  const messageValue = response['message'] ?? response['MESSAGE'] ?? response['error'] ?? response['ERROR'];
  const message = typeof messageValue === 'string' && messageValue.trim()
    ? messageValue.trim()
    : undefined;
  const errors = response['errors'] ?? response['ERRORS'];
  const validationMessages = Array.isArray(errors)
    ? errors.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
    : isRecord(errors)
      ? Object.values(errors).flatMap((entry) => Array.isArray(entry) ? entry : [entry])
          .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
      : [];
  const successFlag = response['success'] ?? response['SUCCESS'];
  const hasSuccessFlag = successFlag === true || successFlag === 1 ||
    (typeof successFlag === 'string' && ['TRUE', '1', 'SUCCESS'].includes(successFlag.trim().toUpperCase()));
  const hasSuccessfulStatus = normalizedStatus !== undefined &&
    ['SUCCESS', 'OK', '200', '201'].includes(normalizedStatus);
  if (
    (normalizedStatus !== undefined && !['SUCCESS', 'OK', '200', '201'].includes(normalizedStatus)) ||
    (successFlag !== undefined && !hasSuccessFlag) ||
    response['error'] === true || response['ERROR'] === true || validationMessages.length > 0 ||
    (message !== undefined && isProductInsertFailureMessage(message))
  ) {
    throw new Error(validationMessages.join(' ') || message || 'The product could not be added.');
  }
  if (hasSuccessfulStatus || hasSuccessFlag || (message !== undefined && isProductInsertSuccessMessage(message))) {
    return message ?? 'Product added successfully.';
  }
  throw new Error(message || 'The product API returned an unrecognized response.');
}

function productUpdateMessage(response: unknown): string {
  if (typeof response === 'string') {
    const message = response.trim();
    if (message.startsWith('{') || message.startsWith('[') || message.startsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(message);
        if (typeof parsed !== 'string' || parsed !== message) return productUpdateMessage(parsed);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // A non-JSON text response is valid for this endpoint.
      }
    }
    if (isProductInsertFailureMessage(message)) throw new Error(message);
    if (/^(?:SUCCESS|OK|200|201)\b/i.test(message) || /\b(?:product )?(?:updated|modified)(?: successfully)?\b/i.test(message)) {
      return message;
    }
    throw new Error(message || 'The product API returned an empty response.');
  }
  if (!isRecord(response)) {
    if (response === true || response === 1) return 'Product updated successfully.';
    throw new Error('The product API returned an invalid response.');
  }

  const status = response['status'] ?? response['STATUS'];
  const normalizedStatus = typeof status === 'string' || typeof status === 'number'
    ? String(status).trim().toUpperCase()
    : undefined;
  const messageValue = response['message'] ?? response['MESSAGE'] ?? response['error'] ?? response['ERROR'];
  const message = typeof messageValue === 'string' && messageValue.trim()
    ? messageValue.trim()
    : undefined;
  const errors = response['errors'] ?? response['ERRORS'];
  const validationMessages = Array.isArray(errors)
    ? errors.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
    : isRecord(errors)
      ? Object.values(errors).flatMap((entry) => Array.isArray(entry) ? entry : [entry])
          .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
      : [];
  const successFlag = response['success'] ?? response['SUCCESS'];
  const hasSuccessFlag = successFlag === true || successFlag === 1 ||
    (typeof successFlag === 'string' && ['TRUE', '1', 'SUCCESS'].includes(successFlag.trim().toUpperCase()));
  const hasSuccessfulStatus = status === true || status === 1 ||
    (normalizedStatus !== undefined && ['SUCCESS', 'OK', '200', '201'].includes(normalizedStatus));
  const hasFailureStatus = status === false || status === 0 ||
    (normalizedStatus !== undefined && !['SUCCESS', 'OK', '200', '201'].includes(normalizedStatus));
  if (
    hasFailureStatus || (successFlag !== undefined && !hasSuccessFlag) ||
    response['error'] === true || response['ERROR'] === true || validationMessages.length > 0 ||
    (message !== undefined && isProductInsertFailureMessage(message))
  ) {
    throw new Error(validationMessages.join(' ') || message || 'The product could not be updated.');
  }
  if (hasSuccessfulStatus || hasSuccessFlag ||
    (message !== undefined && /\b(?:product )?(?:updated|modified)(?: successfully)?\b/i.test(message))) {
    return message ?? 'Product updated successfully.';
  }
  throw new Error(message || 'The product API returned an unrecognized response.');
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

  const responseStatus = response['status'] ?? response['STATUS'];
  if (
    responseStatus !== undefined &&
    responseStatus !== true &&
    !(typeof responseStatus === 'string' && ['SUCCESS', 'OK', '200', '201'].includes(responseStatus.trim().toUpperCase()))
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
      const rawId = definition.idAliases?.map((field) => entry[field]).find((value) => value !== undefined && value !== null)
        ?? entry[definition.idField];
      const rawLabel = definition.labelAliases?.map((field) => entry[field]).find((value) => value !== undefined && value !== null)
        ?? entry[definition.labelField];
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

const PRODUCT_LOOKUP_DEFINITIONS: Readonly<
  Record<'categories' | 'subCategories' | 'brands' | 'taxRates' | 'productCodes', ProductLookupDefinition>
> = {
  categories: {
    path: API_ENDPOINTS.productLookups.categories,
    idParameter: 'CATEGORY_ID',
    idField: 'CATEGORY_ID',
    labelField: 'CATEGORY_NAME',
  },
  subCategories: {
    path: API_ENDPOINTS.productLookups.subCategories,
    idParameter: 'SUB_CATEGORY_ID',
    idField: 'SUB_CATEGORY_ID',
    labelField: 'SUB_CATEGORY_NAME',
  },
  brands: {
    path: API_ENDPOINTS.productLookups.brands,
    idParameter: 'BRAND_ID',
    idField: 'BRAND_ID',
    labelField: 'BRAND_NAME',
  },
  taxRates: {
    path: API_ENDPOINTS.productLookups.taxRates,
    idParameter: 'TAX_RATE_ID',
    idField: 'TAX_RATE_ID',
    labelField: 'TAX_PERCENTAGE',
    labelSuffix: '%',
  },
  productCodes: {
    path: API_ENDPOINTS.productLookups.productCodes,
    idField: 'PRODUCT_CODE_ID',
    idAliases: ['PRODUCT_CODE_ID', 'PRODUCT_CODE_MASTER_ID', 'CODE_ID', 'ID', 'PRODUCT_ID'],
    labelField: 'PRODUCT_CODE',
    labelAliases: [
      'PRODUCT_CODE', 'PRODUCT_CODE_NAME', 'PRODUCT_CODE_VALUE', 'PRODUCT_CODE_SKU',
      'PRODUCT_SKU', 'CODE', 'CODE_NAME', 'CODE_VALUE', 'SKU',
    ],
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

  insertProduct(payload: ProductInsertPayload): Observable<string> {
    return this.api
      .postText(API_ENDPOINTS.products.insert, payload)
      .pipe(map(productInsertMessage));
  }

  updateProduct(payload: ProductUpdatePayload): Observable<string> {
    if (!Number.isSafeInteger(payload.PRODUCT_ID) || payload.PRODUCT_ID <= 0) {
      return throwError(() => new RangeError('Product ID must be a positive safe integer.'));
    }
    return this.api
      .putText(API_ENDPOINTS.products.update, payload)
      .pipe(
        map(productUpdateMessage),
        tap(() => this.invalidatePageCache()),
      );
  }

  loadProductById(productId: string | number): Observable<ProductDetails | null> {
    const id = Number(productId);
    if (!String(productId).trim() || !Number.isSafeInteger(id) || id <= 0) {
      return throwError(() => new RangeError('Product ID must be a positive safe integer.'));
    }
    return this.api.get<unknown>(API_ENDPOINTS.products.get, { PRODUCT_ID: id }).pipe(
      map((response) => mapProductDetailsResponse(response, id)),
    );
  }

  loadCategories(): Observable<ProductLookupOption[]> {
    return this.loadLookup('categories');
  }

  loadSubCategories(categoryId: string | number): Observable<ProductLookupOption[]> {
    if (!String(categoryId).trim() || !Number.isSafeInteger(Number(categoryId)) || Number(categoryId) <= 0) {
      return throwError(() => new RangeError('Category ID must be a positive safe integer.'));
    }
    return this.loadLookup('subCategories', { CATEGORY_ID: Number(categoryId) });
  }

  loadAllBrands(): Observable<ProductLookupOption[]> {
    return this.loadLookup('brands');
  }

  loadBrands(categoryId: string | number, subCategoryId: string | number): Observable<ProductLookupOption[]> {
    const category = Number(categoryId);
    const subCategory = Number(subCategoryId);
    if (
      !String(categoryId).trim() || !Number.isSafeInteger(category) || category <= 0 ||
      !String(subCategoryId).trim() || !Number.isSafeInteger(subCategory) || subCategory <= 0
    ) {
      return throwError(() => new RangeError('Category and subcategory IDs must be positive safe integers.'));
    }
    return this.loadLookup('brands', { CATEGORY_ID: category, SUB_CATEGORY_ID: subCategory });
  }

  loadTaxRates(): Observable<ProductLookupOption[]> {
    return this.loadLookup('taxRates');
  }

  loadProductCodes(productId: string | number): Observable<ProductLookupOption[]> {
    const id = Number(productId);
    if (!String(productId).trim() || !Number.isSafeInteger(id) || (id !== -1 && id <= 0)) {
      return throwError(() => new RangeError('Product ID must be -1 or a positive safe integer.'));
    }
    return this.loadLookup('productCodes', { PRODUCT_ID: id });
  }

  /**
   * Loads one page of products. When `categoryId` is given, the backend filters by CATEGORY_ID
   * (server-side), so pagination metadata describes that category only. Omit it (or pass
   * null/empty) for "All categories".
   */
  loadPage(
    page: number,
    pageSize: number,
    categoryId?: string | number | null,
  ): Observable<PaginatedResponse<Product>> {
    if (!Number.isSafeInteger(page) || page < 1) {
      return throwError(() => new RangeError('Page must be a positive safe integer.'));
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
      return throwError(() => new RangeError('Page size must be a positive safe integer.'));
    }

    const hasCategory = categoryId !== undefined && categoryId !== null && String(categoryId).trim() !== '';
    const category = hasCategory ? Number(categoryId) : undefined;
    if (category !== undefined && (!Number.isSafeInteger(category) || category <= 0)) {
      return throwError(() => new RangeError('Category ID must be a positive safe integer.'));
    }

    const offset = offsetForPage(page, pageSize);
    if (!Number.isSafeInteger(offset)) {
      return throwError(() => new RangeError('The requested page offset is outside the supported range.'));
    }
    // The category is part of the key so pages of different categories never share a cache entry.
    const cacheKey = `${category ?? 'all'}:${pageSize}:${offset}`;
    const cachedRequest = this.pageRequests.get(cacheKey);
    if (cachedRequest) {
      // Map preserves insertion order, so reinserting marks this page as recently used.
      this.pageRequests.delete(cacheKey);
      this.pageRequests.set(cacheKey, cachedRequest);
      return cachedRequest;
    }

    let request: Observable<PaginatedResponse<Product>>;
    request = this.api
      .get<unknown>(API_ENDPOINTS.products.get, {
        PRODUCT_ID: -1,
        ...(category !== undefined ? { CATEGORY_ID: category } : {}),
        LIMIT: pageSize,
        OFFSET: offset,
      })
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
      if (isRecord(body)) {
        const errors = body['errors'] ?? body['ERRORS'];
        const validationMessages = Array.isArray(errors)
          ? errors.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
          : isRecord(errors)
            ? Object.values(errors).flatMap((entry) => Array.isArray(entry) ? entry : [entry])
                .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
            : [];
        if (validationMessages.length) return validationMessages.join(' ');
        const message = body['message'] ?? body['MESSAGE'] ?? body['error'] ?? body['ERROR'];
        if (typeof message === 'string' && message.trim()) return message.trim();
      } else if (typeof body === 'string' && body.trim()) {
        const text = body.trim();
        if (text.startsWith('{')) {
          try {
            const parsed: unknown = JSON.parse(text);
            if (isRecord(parsed)) {
              const message = parsed['message'] ?? parsed['MESSAGE'] ?? parsed['error'] ?? parsed['ERROR'];
              if (typeof message === 'string' && message.trim()) return message.trim();
              const errors = parsed['errors'] ?? parsed['ERRORS'];
              if (Array.isArray(errors)) {
                const messages = errors.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim());
                if (messages.length) return messages.join(' ');
              }
            }
          } catch {
            // Keep the raw server text below if the body is not JSON.
          }
        }
        return text;
      }
      return error.status
        ? `The request failed (HTTP ${error.status}).`
        : 'The request failed. Check your connection and try again.';
    }
    return error instanceof Error ? error.message : 'Products could not be loaded. Please try again.';
  }

  private loadLookup(
    key: keyof typeof PRODUCT_LOOKUP_DEFINITIONS,
    extraParams: Record<string, string | number> = {},
  ): Observable<ProductLookupOption[]> {
    const cacheKey = `${key}:${JSON.stringify(extraParams)}`;
    const cached = this.lookupRequests.get(cacheKey);
    if (cached) return cached;

    const definition = PRODUCT_LOOKUP_DEFINITIONS[key];
    let request: Observable<ProductLookupOption[]>;
    request = this.api
      .get<unknown>(definition.path, {
        ...(definition.idParameter ? { [definition.idParameter]: -1 } : {}),
        ...extraParams,
      })
      .pipe(
        map((response) => mapLookupOptions(response, key, definition)),
        catchError((error: unknown) => {
          if (this.lookupRequests.get(cacheKey) === request) this.lookupRequests.delete(cacheKey);
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.lookupRequests.set(cacheKey, request);
    return request;
  }
}