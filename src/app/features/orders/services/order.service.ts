import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import {
  CustomerOrdersPage,
  OrderSummary,
  PlaceOrderPayload,
  PlaceOrderResult,
  ReturnReasonOption,
  ReturnRequestRow,
  ReturnRequestsPage,
  ReturnRequestsQuery,
  ReturnRequestStatusUpdate,
  SellerReturnRequestsQuery,
  ShipmentTracking,
  StatusOption,
} from '@shared/models';
import { DEMO_SHIPMENT, DEMO_TRACKING_ORDER_ID } from '../data/shipment-tracking';
import { ORDER_SUMMARIES } from '../data/order-summaries';

export interface OrderManagementFilters {
  DAYS: number;
  ORDER_STATUS: number;
  PAYMENT_STATUS: number;
  SHIPPING_STATUS: number;
}

/** Seller login: `order_dashboard/get` scoped to one seller, searched and paged by the API. */
// CHANGED (new): query for the Seller variant of the Order Management listing.
export interface SellerOrderManagementQuery extends OrderManagementFilters {
  SELLER_ID: number;
  SEARCH: string;
  LIMIT: number;
  OFFSET: number;
}

export interface OrderManagementOrder {
  id: number;
  orderNo: string;
  orderDate: string;
  customer: string;
  mobile: string;
  productId: number | null;
  // CHANGED (new): PRODUCT_NAME when the API sends it (the Seller response does); null otherwise.
  productName: string | null;
  quantity: number | null;
  amount: number | null;
  paymentStatusId: number | null;
  orderStatusId: number | null;
  shippingStatusId: number | null;
}

export interface OrderManagementCounts {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
}

/** One API page of orders with its `total_records` and the `dashboard` summary counts. */
// CHANGED (new): Seller response shape (dashboard + total_records + data).
export interface OrderManagementPage {
  orders: OrderManagementOrder[];
  totalRecords: number;
  counts: OrderManagementCounts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function readNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapStatusLookup(
  response: unknown,
  idKey: string,
  labelKey: string,
  subject: string,
): StatusOption[] {
  if (!isRecord(response)) {
    throw new Error(`The ${subject} status API returned an invalid response.`);
  }
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  const message = response['message'] ?? response['MESSAGE'];
  const successValues = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];
  const failedSuccess =
    success !== undefined &&
    success !== true &&
    success !== 1 &&
    success !== 200 &&
    success !== 201 &&
    !(typeof success === 'string' && successValues.includes(success.trim().toUpperCase()));
  if (
    failedSuccess ||
    status !== undefined &&
    status !== true &&
    status !== 1 &&
    status !== 200 &&
    status !== 201 &&
    !(
      typeof status === 'string' &&
      successValues.includes(status.trim().toUpperCase())
    )
  ) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `${subject} statuses could not be loaded.`,
    );
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error(`The ${subject} status API returned an invalid status list.`);
  }

  const seen = new Set<number>();
  const options: StatusOption[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = readNumber(item[idKey]);
    const label = readText(item, labelKey);
    if (id === null || !Number.isSafeInteger(id) || id <= 0 || !label || seen.has(id)) continue;
    seen.add(id);
    options.push({ id, label });
  }
  return options;
}

const RETURN_REQUEST_SUCCESS_VALUES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];

function readNullableText(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`The return requests API returned an invalid ${key} value.`);
  }
  const text = String(value).trim();
  return text || null;
}

function readNullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (value === null || value === undefined || value === '') return null;
  const parsed = readNumber(value);
  if (parsed === null) {
    throw new Error(`The return requests API returned an invalid ${key} value.`);
  }
  return parsed;
}
function returnImageUrl(fileName: string): string {
  if (/^(?:https?:|blob:|data:)/i.test(fileName)) return fileName;
  if (fileName.startsWith('/')) return fileName;
  const uploadPath = fileName.startsWith('uploads/') ? fileName : `uploads/${fileName}`;
  return `/${uploadPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function mapReturnImages(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  const images: string[] = [];
  for (const image of values) {
    if (typeof image !== 'string') {
      throw new Error('The return requests API returned an invalid return image.');
    }
    // A single field may carry several comma-separated file names.
    for (const part of image.split(',')) {
      const path = part.trim();
      if (path) images.push(returnImageUrl(path));
    }
  }
  return images;
}

function mapReturnRequest(value: unknown): ReturnRequestRow {
  if (!isRecord(value)) {
    throw new Error('The return requests API returned an invalid request.');
  }
  const returnId = readNumber(value['RETURN_ID']);
  if (returnId === null || !Number.isSafeInteger(returnId) || returnId <= 0) {
    throw new Error('The return requests API returned an invalid return ID.');
  }

  return {
    returnId,
    orderId: readNullableNumber(value, 'ORDER_ID'),
    orderNumber: readNullableText(value, 'ORDER_NUMBER'),
    productId: readNullableNumber(value, 'PRODUCT_ID'),
    productName: readNullableText(value, 'PRODUCT_NAME'),
    quantity: readNullableNumber(value, 'QUANTITY'),
    reason: readNullableText(value, 'RETURN_REASON'),
    description: readNullableText(value, 'RETURN_DESCRIPTION'),
    images: mapReturnImages(value['RETURN_IMAGES']),
    pickupAddressId: readNullableNumber(value, 'PICKUP_ADDRESS_ID'),
    address: readNullableText(value, 'ADDRESS'),
    sellerId: readNullableNumber(value, 'SELLER_ID'),
    customerId: readNullableNumber(value, 'CUSTOMER_ID'),
    customerName: readNullableText(value, 'CUSTOMER_NAME'),
    customerMobile: readNullableText(value, 'CUSTOMER_MOBILE'),
    variantId: readNullableNumber(value, 'VARIANT_ID'),
    status: readNullableText(value, 'RETURN_STATUS'),
    createdAt: readNullableText(value, 'CREATED_AT'),
  };
}

function mapReturnRequestsResponse(response: unknown): ReturnRequestsPage {
  if (!isRecord(response)) {
    throw new Error('The return requests API returned an invalid response.');
  }
  const success = response['success'] ?? response['SUCCESS'];
  const status = response['status'] ?? response['STATUS'];
  const message = readText(response, 'message') || readText(response, 'MESSAGE');
  const isSuccessful = (value: unknown): boolean =>
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' &&
      RETURN_REQUEST_SUCCESS_VALUES.includes(value.trim().toUpperCase()));
  if (
    (success !== undefined && !isSuccessful(success)) ||
    (status !== undefined && !isSuccessful(status)) ||
    (success === undefined && status === undefined)
  ) {
    throw new Error(message || 'Return requests could not be loaded.');
  }

  const totalRecords = readNumber(response['total_records']);
  if (totalRecords === null || !Number.isSafeInteger(totalRecords) || totalRecords < 0) {
    throw new Error('The return requests API returned an invalid total_records value.');
  }
  const data = response['data'] ?? response['DATA'];
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    throw new Error('The return requests API returned an invalid request list.');
  }

  return {
    requests: (data ?? []).map(mapReturnRequest),
    totalRecords,
  };
}

// CHANGED: shared LIMIT/OFFSET validation for the paged listings (return requests, Seller orders).
// `subject` keeps the original messages, e.g. "Return request page size must be …".
function assertPaging(limit: number, offset: number, subject: string): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError(`${subject} page size must be a positive safe integer.`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError(`${subject} page offset must be a non-negative safe integer.`);
  }
}

// CHANGED (new): DAYS + status filter validation shared by the Admin and Seller order listings (moved, messages unchanged).
function assertOrderManagementFilters(params: OrderManagementFilters): void {
  if (!Number.isSafeInteger(params.DAYS) || params.DAYS < 1) {
    throw new RangeError('The order date filter must be a positive number of days.');
  }
  for (const key of ['ORDER_STATUS', 'PAYMENT_STATUS', 'SHIPPING_STATUS'] as const) {
    const value = params[key];
    if (!Number.isSafeInteger(value) || (value !== -1 && value <= 0)) {
      throw new RangeError(`${key} must be -1 or a positive safe integer.`);
    }
  }
}

function mapReturnRequestUpdateResponse(
  response: unknown,
  decision: ReturnRequestStatusUpdate['RETURN_STATUS'],
): string {
  const action = decision === 'APPROVED' ? 'approval' : 'rejection';
  const fallback = `Return request ${action} completed successfully.`;
  if (response === null || response === undefined) return fallback;
  if (typeof response === 'string') {
    if (['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(response.trim().toUpperCase())) {
      return fallback;
    }
    throw new Error(response.trim() || `Return request ${action} failed.`);
  }
  if (!isRecord(response)) {
    throw new Error(`The return request ${action} API returned an invalid response.`);
  }

  const success = response['success'] ?? response['SUCCESS'];
  const status = response['status'] ?? response['STATUS'];
  const message = readText(response, 'message') || readText(response, 'MESSAGE');
  const isSuccessful = (value: unknown): boolean =>
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' &&
      ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(value.trim().toUpperCase()));
  if (
    (success !== undefined && !isSuccessful(success)) ||
    (status !== undefined && !isSuccessful(status))
  ) {
    throw new Error(message || `Return request ${action} failed.`);
  }
  return message || fallback;
}

function mapReturnReasonsResponse(response: unknown): ReturnReasonOption[] {
  if (!isRecord(response)) {
    throw new Error('The return reasons API returned an invalid response.');
  }

  const success = response['success'] ?? response['SUCCESS'];
  const message = readText(response, 'message') || readText(response, 'MESSAGE');
  if (
    success !== undefined &&
    success !== true &&
    success !== 1 &&
    !(
      typeof success === 'string' &&
      ['TRUE', '1', 'SUCCESS', 'OK', '200'].includes(success.trim().toUpperCase())
    )
  ) {
    throw new Error(message || 'Return reasons could not be loaded.');
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error('The return reasons API returned an invalid reason list.');
  }

  const seen = new Set<number>();
  const reasons: ReturnReasonOption[] = [];
  for (const item of data) {
    if (!isRecord(item)) {
      throw new Error('The return reasons API returned an invalid reason.');
    }
    const id = readNumber(item['REASON_ID']);
    const label = readText(item, 'REASON');
    if (id === null || !Number.isSafeInteger(id) || id <= 0 || !label || seen.has(id)) {
      throw new Error('The return reasons API returned an invalid or duplicate reason.');
    }
    seen.add(id);
    reasons.push({ REASON_ID: id, REASON: label });
  }
  return reasons;
}

function mapOrder(value: unknown): OrderManagementOrder | null {
  if (!isRecord(value)) return null;
  const id = readNumber(value['ORDER_ID']);
  if (id === null || !Number.isSafeInteger(id) || id <= 0) return null;

  return {
    id,
    orderNo: readText(value, 'ORDER_NUMBER') || '—',
    orderDate: readText(value, 'ORDER_DATE') || '—',
    customer: readText(value, 'CUSTOMER_NAME') || '—',
    mobile: readText(value, 'CUSTOMER_MOBILE') || '—',
    productId: readNumber(value['PRODUCT_ID']),
    productName: readText(value, 'PRODUCT_NAME') || null,
    quantity: readNumber(value['QUANTITY']),
    amount: readNumber(value['ORDER_AMOUNT']),
    paymentStatusId: readNumber(value['PAYMENT_STATUS']),
    orderStatusId: readNumber(value['ORDER_STATUS']),
    shippingStatusId: readNumber(value['SHIPPING_STATUS']),
  };
}

// CHANGED (new): status check shared by the order dashboard and order count responses (moved, messages unchanged).
function successfulOrderManagementResponse(
  response: unknown,
  api: string,
  fallback: string,
): Record<string, unknown> {
  if (!isRecord(response)) {
    throw new Error(`The ${api} API returned an invalid response.`);
  }
  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  if (
    status !== undefined &&
    status !== true &&
    !(
      typeof status === 'string' &&
      ['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase())
    )
  ) {
    throw new Error(typeof message === 'string' && message.trim() ? message.trim() : fallback);
  }
  return response;
}

// CHANGED (new): the `data` order list, shared by the Admin and Seller dashboard responses (moved unchanged).
function mapOrderList(response: Record<string, unknown>): OrderManagementOrder[] {
  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error('The order management API returned an invalid order list.');
  }
  return data.map(mapOrder).filter((order): order is OrderManagementOrder => order !== null);
}

/**
 * Summary counts (TOTAL_ORDERS … DELIVERED_ORDERS). `nullAsZero` reads a null/missing total as 0,
 * which is what an SQL SUM/COUNT over no orders returns.
 */
// CHANGED (new): shared by the order count response (Admin) and the `dashboard` block (Seller).
function mapOrderCounts(data: Record<string, unknown>, api: string, nullAsZero = false): OrderManagementCounts {
  const readRequiredCount = (key: string, integer: boolean): number => {
    const raw = data[key];
    const value = nullAsZero && (raw === null || raw === undefined) ? 0 : readNumber(raw);
    if (value === null || value < 0 || (integer && !Number.isSafeInteger(value))) {
      throw new Error(`The ${api} API returned an invalid ${key} value.`);
    }
    return value;
  };

  return {
    totalOrders: readRequiredCount('TOTAL_ORDERS', true),
    totalRevenue: readRequiredCount('TOTAL_REVENUE', false),
    pendingOrders: readRequiredCount('PENDING_ORDERS', true),
    shippedOrders: readRequiredCount('SHIPPED_ORDERS', true),
    deliveredOrders: readRequiredCount('DELIVERED_ORDERS', true),
  };
}

function mapOrderManagementResponse(response: unknown): OrderManagementOrder[] {
  return mapOrderList(
    successfulOrderManagementResponse(response, 'order management', 'Orders could not be loaded.'),
  );
}

// CHANGED (new): Seller response: `dashboard` counts, `total_records` and one page of `data`.
function mapSellerOrderManagementResponse(response: unknown): OrderManagementPage {
  const record = successfulOrderManagementResponse(response, 'order management', 'Orders could not be loaded.');
  const dashboard = record['dashboard'] ?? record['DASHBOARD'];
  if (!isRecord(dashboard)) {
    throw new Error('The order management API returned no usable dashboard data.');
  }
  const totalRecords = readNumber(record['total_records'] ?? record['TOTAL_RECORDS']);
  if (totalRecords === null || !Number.isSafeInteger(totalRecords) || totalRecords < 0) {
    throw new Error('The order management API returned an invalid total_records value.');
  }
  return {
    orders: mapOrderList(record),
    totalRecords,
    counts: mapOrderCounts(dashboard, 'order management', true),
  };
}

function mapOrderManagementCountsResponse(response: unknown): OrderManagementCounts {
  const record = successfulOrderManagementResponse(response, 'order count', 'Order counts could not be loaded.');
  const data = record['data'] ?? record['DATA'];
  if (!isRecord(data)) {
    throw new Error('The order count API returned no usable count data.');
  }
  return mapOrderCounts(data, 'order count');
}

const CUSTOMER_ORDER_SUCCESS_VALUES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];

function requiredOrderNumber(value: unknown, label: string, positive = true): number {
  const parsed = readNumber(value);
  if (
    parsed === null ||
    !Number.isSafeInteger(parsed) ||
    (positive ? parsed <= 0 : parsed < 0)
  ) {
    throw new Error(`The customer orders API returned an invalid ${label}.`);
  }
  return parsed;
}

function mapCustomerOrdersResponse(response: unknown, customerId: number): CustomerOrdersPage {
  if (!isRecord(response)) {
    throw new Error('The customer orders API returned an invalid response.');
  }

  const success = response['success'] ?? response['SUCCESS'];
  const status = response['status'] ?? response['STATUS'];
  const message = readText(response, 'message') || readText(response, 'MESSAGE');
  const successfulValue = (value: unknown): boolean =>
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' &&
      CUSTOMER_ORDER_SUCCESS_VALUES.includes(value.trim().toUpperCase()));
  if (
    (success !== undefined && !successfulValue(success)) ||
    (status !== undefined && !successfulValue(status)) ||
    (success === undefined && status === undefined)
  ) {
    throw new Error(message || 'Customer orders could not be loaded.');
  }

  const totalRecords = requiredOrderNumber(response['total_records'], 'total_records', false);
  const data = response['data'] ?? response['DATA'];
  if (data !== null && !Array.isArray(data)) {
    throw new Error('The customer orders API returned an invalid order list.');
  }

  const orders = (data ?? []).map((value: unknown): OrderSummary => {
    if (!isRecord(value)) {
      throw new Error('The customer orders API returned an invalid order.');
    }

    const orderId = requiredOrderNumber(value['ORDER_ID'], 'order ID');
    const orderNumber = readText(value, 'ORDER_NUMBER');
    const rowCustomerId = requiredOrderNumber(value['CUSTOMER_ID'], 'customer ID');
    if (rowCustomerId !== customerId) {
      throw new Error('The customer orders API returned an order for a different customer.');
    }
    const productId = requiredOrderNumber(value['PRODUCT_ID'], 'product ID');
    const rawVariantId = value['PRODUCT_VARIANT_ID'];
    const productVariantId =
      rawVariantId === null || rawVariantId === undefined
        ? null
        : requiredOrderNumber(rawVariantId, 'product variant ID');
    const quantity = requiredOrderNumber(value['QUANTITY'], 'quantity');
    const orderDate = readText(value, 'ORDER_DATE');
    const statusText = readText(value, 'STATUS');
    if (!orderNumber || !orderDate || !statusText || !Number.isFinite(Date.parse(orderDate))) {
      throw new Error('The customer orders API returned an order with incomplete details.');
    }

    return {
      id: orderNumber,
      placedOn: orderDate,
      total: requiredOrderNumber(value['TOTAL_AMOUNT'], 'total amount', false),
      status: statusText,
      items: [{ productId, productVariantId, quantity }],
      orderId,
    };
  });

  return { orders, totalRecords };
}

const PLACE_ORDER_SUCCESS_VALUES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];
const PLACE_ORDER_FAILURE = /\b(?:failure|failed|error|could not|unable|invalid|not found)\b/i;
const PLACE_ORDER_DEFAULT_MESSAGE = 'Your order has been placed.';
const PLACE_ORDER_DEFAULT_ERROR = 'The order could not be placed. Please try again.';

/**
 * UNCONFIRMED: the place_order response format is not documented. These are the names the
 * existing order list API (order_dashboard/get) uses for the order number and id. They only
 * decide whether a number is SHOWN after a successful order; they never decide success.
 * Replace them with the real field once a place_order response is available.
 */
const ORDER_NUMBER_FIELDS = ['ORDER_NUMBER', 'ORDER_ID'] as const;

function isPlaceOrderSuccessValue(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' && PLACE_ORDER_SUCCESS_VALUES.includes(value.trim().toUpperCase()))
  );
}

function readOrderNumber(response: Record<string, unknown>): string | undefined {
  const data = response['data'] ?? response['DATA'];
  for (const source of [response, isRecord(data) ? data : undefined]) {
    if (!source) continue;
    for (const field of ORDER_NUMBER_FIELDS) {
      const value = readText(source, field);
      if (value) return value;
    }
  }
  return undefined;
}

/** Returns a message for the customer, or throws when the body clearly reports a failure. */
function mapPlaceOrderResponse(response: string): PlaceOrderResult {
  const body = response.trim();
  if (!body) return { message: PLACE_ORDER_DEFAULT_MESSAGE };

  if (body.startsWith('{') || body.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined) {
      if (!isRecord(parsed)) return { message: PLACE_ORDER_DEFAULT_MESSAGE };
      const status = parsed['status'] ?? parsed['STATUS'];
      const success = parsed['success'] ?? parsed['SUCCESS'];
      const error = parsed['error'] ?? parsed['ERROR'];
      const message = readText(parsed, 'message') || readText(parsed, 'MESSAGE');
      const failedStatus = status !== undefined && status !== null && !isPlaceOrderSuccessValue(status);
      const failedFlag = success !== undefined && success !== null && !isPlaceOrderSuccessValue(success);
      const reportedError = error === true || (typeof error === 'string' && error.trim() !== '');
      if (failedStatus || failedFlag || reportedError) {
        throw new Error(message || (typeof error === 'string' ? error.trim() : '') || PLACE_ORDER_DEFAULT_ERROR);
      }
      const orderNumber = readOrderNumber(parsed);
      return {
        message: message || PLACE_ORDER_DEFAULT_MESSAGE,
        ...(orderNumber ? { orderNumber } : {}),
      };
    }
  }

  if (PLACE_ORDER_FAILURE.test(body)) throw new Error(body);
  // Plain text: show it only when it reads like a short message (not a page of markup).
  return { message: body.length <= 200 && !body.includes('<') ? body : PLACE_ORDER_DEFAULT_MESSAGE };
}

/** The reason a payload cannot be sent, or null when it is valid. */
function placeOrderPayloadProblem(payload: PlaceOrderPayload): string | null {
  const isId = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
  if (!Number.isSafeInteger(payload.CART_ID) || payload.CART_ID < 0) {
    return 'Cart ID must be 0 (the whole cart) or a positive whole number.';
  }
  if (!isId(payload.DELIVERY_ADDRESS_ID)) return 'Choose a delivery address.';
  if (!isId(payload.BILLING_ADDRESS_ID)) return 'Choose a billing address.';
  if (!isId(payload.PAYMENT_METHOD)) return 'Choose a payment method.';
  if (!Number.isFinite(payload.SHIPPING_CHARGES) || payload.SHIPPING_CHARGES < 0) {
    return 'Shipping charges must be zero or more.';
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiService);

  /**
   * The documented endpoint accepts LIMIT and OFFSET. The bearer-token interceptor supplies the
   * signed-in identity; customerId is used to reject any response rows outside that customer.
   */
  getCustomerOrders(customerId: number, limit: number, offset: number): Observable<CustomerOrdersPage> {
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new RangeError('Customer ID must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new RangeError('Order page size must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError('Order page offset must be a non-negative safe integer.');
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.customerOrders.get, { LIMIT: limit, OFFSET: offset })
      .pipe(map((response) => mapCustomerOrdersResponse(response, customerId)));
  }

  getReturnReasons(): Observable<ReturnReasonOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.returnReasons.get, { REASON_ID: -1, REASON: -1 })
      .pipe(map(mapReturnReasonsResponse));
  }

  getReturnRequests(filters: ReturnRequestsQuery): Observable<ReturnRequestsPage> {
    if (!Number.isSafeInteger(filters.DAYS) || filters.DAYS < 1) {
      throw new RangeError('The return request date filter must be a positive number of days.');
    }
    for (const key of ['RETURN_STATUS', 'RETURN_REASON'] as const) {
      const value = filters[key];
      if (!Number.isSafeInteger(value) || (value !== -1 && value <= 0)) {
        throw new RangeError(`${key} must be -1 or a positive safe integer.`);
      }
    }
    assertPaging(filters.LIMIT, filters.OFFSET, 'Return request');

    return this.api
      .get<unknown>(API_ENDPOINTS.returnRequests.get, {
        DAYS: filters.DAYS,
        RETURN_STATUS: filters.RETURN_STATUS,
        RETURN_REASON: filters.RETURN_REASON,
        LIMIT: filters.LIMIT,
        OFFSET: filters.OFFSET,
      })
      .pipe(map(mapReturnRequestsResponse));
  }

  /** Seller login: the same endpoint and response shape, scoped to one seller. */
  // CHANGED (new): Seller variant of getReturnRequests; reuses the endpoint and response mapping.
  getSellerReturnRequests(query: SellerReturnRequestsQuery): Observable<ReturnRequestsPage> {
    if (!Number.isSafeInteger(query.SELLER_ID) || query.SELLER_ID <= 0) {
      throw new RangeError('SELLER_ID must be a positive safe integer.');
    }
    assertPaging(query.LIMIT, query.OFFSET, 'Return request');

    return this.api
      .get<unknown>(API_ENDPOINTS.returnRequests.get, {
        SELLER_ID: query.SELLER_ID,
        LIMIT: query.LIMIT,
        OFFSET: query.OFFSET,
      })
      .pipe(map(mapReturnRequestsResponse));
  }

  updateReturnRequestStatus(payload: ReturnRequestStatusUpdate): Observable<string> {
    if (!Number.isSafeInteger(payload.RETURN_ID) || payload.RETURN_ID <= 0) {
      throw new RangeError('Return ID must be a positive safe integer.');
    }
    if (!['APPROVED', 'REJECTED'].includes(payload.RETURN_STATUS)) {
      throw new RangeError('Return status must be APPROVED or REJECTED.');
    }

    return this.api
      .put<unknown>(API_ENDPOINTS.returnRequests.update, payload)
      .pipe(map((response) => mapReturnRequestUpdateResponse(response, payload.RETURN_STATUS)));
  }

  getOrderStatuses(limit?: number, offset?: number): Observable<StatusOption[]> {
    const params: Record<string, number> = { ORDER_STATUS_ID: -1 };
    if (limit !== undefined || offset !== undefined) {
      const pageSize = limit ?? 10;
      const pageOffset = offset ?? 0;
      if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
        throw new RangeError('Status page size must be a positive safe integer.');
      }
      if (!Number.isSafeInteger(pageOffset) || pageOffset < 0) {
        throw new RangeError('Status page offset must be a non-negative safe integer.');
      }
      params['LIMIT'] = pageSize;
      params['OFFSET'] = pageOffset;
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.orderStatuses, params)
      .pipe(map((response) => mapStatusLookup(response, 'ORDER_STATUS_ID', 'ORDER_STATUS', 'order')));
  }

  getPaymentStatuses(): Observable<StatusOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.paymentStatuses, { PAYMENT_STATUS_ID: -1 })
      .pipe(
        map((response) =>
          mapStatusLookup(response, 'PAYMENT_STATUS_ID', 'PAYMENT_STATUS', 'payment'),
        ),
      );
  }

  getShippingStatuses(): Observable<StatusOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.shippingStatuses, { SHIPPING_STATUS_ID: -1 })
      .pipe(
        map((response) =>
          mapStatusLookup(response, 'SHIPPING_STATUS_ID', 'SHIPPING_STATUS', 'shipping'),
        ),
      );
  }

  getManagementOrders(
    filters: Partial<OrderManagementFilters> = {},
  ): Observable<OrderManagementOrder[]> {
    const params: OrderManagementFilters = {
      DAYS: filters.DAYS ?? 7,
      ORDER_STATUS: filters.ORDER_STATUS ?? 1,
      PAYMENT_STATUS: filters.PAYMENT_STATUS ?? -1,
      SHIPPING_STATUS: filters.SHIPPING_STATUS ?? -1,
    };
    assertOrderManagementFilters(params);

    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.get, {
        DAYS: params.DAYS,
        ORDER_STATUS: params.ORDER_STATUS,
        PAYMENT_STATUS: params.PAYMENT_STATUS,
        SHIPPING_STATUS: params.SHIPPING_STATUS,
      })
      .pipe(map(mapOrderManagementResponse));
  }

  /**
   * Seller login: one page of the seller's orders with the `dashboard` summary counts, from the same
   * endpoint as getManagementOrders. Search and paging are done by the API (SEARCH, LIMIT, OFFSET).
   */
  // CHANGED (new): Seller variant of getManagementOrders.
  getSellerManagementOrders(query: SellerOrderManagementQuery): Observable<OrderManagementPage> {
    if (!Number.isSafeInteger(query.SELLER_ID) || query.SELLER_ID <= 0) {
      throw new RangeError('SELLER_ID must be a positive safe integer.');
    }
    assertOrderManagementFilters(query);
    assertPaging(query.LIMIT, query.OFFSET, 'Order');

    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.get, {
        SELLER_ID: query.SELLER_ID,
        DAYS: query.DAYS,
        SEARCH: query.SEARCH.trim(),
        ORDER_STATUS: query.ORDER_STATUS,
        PAYMENT_STATUS: query.PAYMENT_STATUS,
        SHIPPING_STATUS: query.SHIPPING_STATUS,
        LIMIT: query.LIMIT,
        OFFSET: query.OFFSET,
      })
      .pipe(map(mapSellerOrderManagementResponse));
  }

  getManagementCounts(days: number): Observable<OrderManagementCounts> {
    if (!Number.isSafeInteger(days) || days < 1) {
      throw new RangeError('The order count date filter must be a positive number of days.');
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.orderCount, { DAYS: days })
      .pipe(map(mapOrderManagementCountsResponse));
  }

  /** Demo order summaries retained only for the existing shipment-tracking preview. */
  readonly orders: readonly OrderSummary[] = ORDER_SUMMARIES;

  /** Shipment tracking for an order, or undefined when the order is unknown (demo data until the API is wired). */
  findTracking(orderId: string): ShipmentTracking | undefined {
    const known = orderId === DEMO_TRACKING_ORDER_ID || this.orders.some((order) => order.id === orderId);
    return known ? { ...DEMO_SHIPMENT, orderId } : undefined;
  }

  /**
   * POST place_order. CART_ID 0 orders every product in the cart; a CART_ID orders that cart row.
   * The response format is not confirmed, so plain text or a JSON envelope is accepted and only a
   * body that clearly reports a failure is treated as one. A non-2xx status already errors.
   */
  placeOrder(payload: PlaceOrderPayload): Observable<PlaceOrderResult> {
    const problem = placeOrderPayloadProblem(payload);
    if (problem) return throwError(() => new RangeError(problem));
    return this.api
      .postText(API_ENDPOINTS.placeOrder.insert, payload)
      .pipe(map(mapPlaceOrderResponse));
  }

  /** A readable message for a failed place_order call. */
  placeOrderErrorMessage(error: unknown): string {
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
        const message =
          readText(body, 'message') || readText(body, 'MESSAGE') || readText(body, 'error') || readText(body, 'ERROR');
        if (message) return message;
      }
      return error.status ? `${PLACE_ORDER_DEFAULT_ERROR} (HTTP ${error.status})` : PLACE_ORDER_DEFAULT_ERROR;
    }
    return error instanceof Error && error.message ? error.message : PLACE_ORDER_DEFAULT_ERROR;
  }

  // Order detail API calls will be added here.
}