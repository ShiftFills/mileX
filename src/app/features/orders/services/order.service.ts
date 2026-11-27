import { formatDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, defer, expand, last, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import {
  CustomerOrderDetail,
  CustomerOrderLine,
  CustomerOrdersPage,
  OrderSummary,
  PlaceOrderPayload,
  PlaceOrderResult,
  ReturnProductOption,
  ReturnReasonOption,
  ReturnRequestInsert,
  ReturnRequestReview,
  ReturnRequestResult,
  ReturnRequestRow,
  ReturnRequestsPage,
  ReturnRequestsQuery,
  ReturnDecision,
  SellerReturnRequestsQuery,
  ShipmentItem,
  ShipmentStep,
  ShipmentTotals,
  ShipmentTracking,
  StatusOption,
} from '@shared/models';
// CHANGED: the demo shipment and order summaries (data/shipment-tracking.ts, data/order-summaries.ts) are removed;
// Shipment Tracking reads the tracking API (getShipmentTracking).

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

/**
 * Request body for PUT place_order/update. Each status is an ID from its lookup API (all_status/get,
 * payment_status/get, shipping_status/get), the same IDs order_dashboard/get returns for an order.
 */
// CHANGED (new): Order Management status update (Admin).
export interface OrderStatusUpdate {
  ORDER_ID: number;
  ORDER_STATUS: number;
  PAYMENT_STATUS: number;
  SHIPPING_STATUS: number;
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

/** A positive whole-number ID, or null. */
// CHANGED (new)
function positiveId(value: unknown): number | null {
  const id = readNumber(value);
  return id !== null && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
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
    // CHANGED: the status name when the API sends one (RETURN_STATUS_NAME), else RETURN_STATUS as before.
    status: optionalText(value, 'RETURN_STATUS_NAME') ?? readNullableText(value, 'RETURN_STATUS'),
    createdAt: readNullableText(value, 'CREATED_AT'),
    // CHANGED (new): IDs for the Admin screen (null when not sent).
    statusId: positiveId(value['RETURN_STATUS_ID']) ?? positiveId(value['RETURN_STATUS']),
    reasonId: positiveId(value['RETURN_REASON_ID'] ?? value['REASON_ID']),
    returnOptionId: positiveId(value['RETURN_OPTION'] ?? value['RETURN_OPTION_ID']),
    returnOptionName: optionalText(value, 'RETURN_OPTION_NAME'),
    sellerName: optionalText(value, 'SELLER_NAME') ?? optionalText(value, 'BUSINESS_NAME'),
  };
}

/** A text field the API may or may not send (null when absent, empty or not text). */
// CHANGED (new)
function optionalText(record: Record<string, unknown>, key: string): string | null {
  return readText(record, key) || null;
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

  // CHANGED: TOTAL_RECORDS / totalRecords are accepted too, as the envelope's other fields already are
  // (status / STATUS, message / MESSAGE, data / DATA); the return_request APIs answer in upper case.
  const totalRecords = readNumber(response['total_records'] ?? response['TOTAL_RECORDS'] ?? response['totalRecords']);
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

/** What a return_request/update does, for its messages: approval, rejection, or (ACTION null) status update. */
// CHANGED (new)
function returnUpdateNoun(decision: ReturnDecision | null): string {
  return decision === 'APPROVED' ? 'approval' : decision === 'REJECTED' ? 'rejection' : 'status update';
}

// CHANGED: maps the Approve / Reject / status-only update (reviewReturnRequest); `decision` names it in the messages.
function mapReturnRequestUpdateResponse(response: unknown, decision: ReturnDecision | null): string {
  const action = returnUpdateNoun(decision);
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

const ORDER_UPDATE_DEFAULT_MESSAGE = 'Order updated successfully.';
const ORDER_UPDATE_DEFAULT_ERROR = 'The order could not be updated.';

/**
 * PUT place_order/update (`{ status: true, message: "Order updated successfully" }`): its message, or an error when
 * the body reports a failure. A non-2xx status already errors in HttpClient.
 */
// CHANGED (new)
function mapOrderUpdateResponse(response: unknown): string {
  if (response === null || response === undefined) return ORDER_UPDATE_DEFAULT_MESSAGE;
  if (typeof response === 'string') {
    const body = response.trim();
    if (!body || ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(body.toUpperCase())) {
      return ORDER_UPDATE_DEFAULT_MESSAGE;
    }
    throw new Error(body);
  }
  if (!isRecord(response)) throw new Error('The order update API returned an invalid response.');

  const success = response['success'] ?? response['SUCCESS'];
  const status = response['status'] ?? response['STATUS'];
  const message = readText(response, 'message') || readText(response, 'MESSAGE');
  const isSuccessful = (value: unknown): boolean =>
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' && ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'].includes(value.trim().toUpperCase()));
  if ((success !== undefined && !isSuccessful(success)) || (status !== undefined && !isSuccessful(status))) {
    throw new Error(message || ORDER_UPDATE_DEFAULT_ERROR);
  }
  return message || ORDER_UPDATE_DEFAULT_MESSAGE;
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

// ---- Cancel / Return Item request (CHANGED (new)) ----

const RETURN_REQUEST_DEFAULT_MESSAGE = 'Your return request has been submitted.';
const RETURN_REQUEST_DEFAULT_ERROR = 'The return request could not be submitted. Please try again.';
/** The longest RETURN_DESCRIPTION the dialog takes. */
export const RETURN_DESCRIPTION_MAX_LENGTH = 500;

/**
 * A status that is a return type, "RETURN/<kind>" ("RETURN/REFUND", "RETURN/REPLACE"): what a customer chooses
 * between. CHANGED: used for the return_status list (the Cancel / Return Item dialog), and still for the shipping
 * statuses the Admin Return Request screen names return types with.
 */
export function isReturnType(status: StatusOption): boolean {
  return /^\s*RETURN\s*\/\s*\S/i.test(status.label);
}

const RETURN_PRODUCT_UNKNOWN = 'The product to return could not be identified. Please refresh the page and try again.';


/** The reason a return request cannot be sent, or null when it is valid. */
// CHANGED: checks every ID of the backend contract.
function returnRequestProblem(payload: ReturnRequestInsert): string | null {
  if (!payload.ORDER_NUMBER.trim()) return 'Order number is required.';
  // CHANGED: the chosen product's order line (ORDER_ID) too.
  if (!isPositiveId(payload.ORDER_ID)) return RETURN_PRODUCT_UNKNOWN;
  if (!isPositiveId(payload.PRODUCT_ID)) return RETURN_PRODUCT_UNKNOWN;
  if (payload.VARIANT_ID !== null && !isPositiveId(payload.VARIANT_ID)) return RETURN_PRODUCT_UNKNOWN;
  if (!isPositiveId(payload.SELLER_ID)) return 'The seller of this product could not be found, so it cannot be returned here.';
  if (!isPositiveId(payload.PICKUP_ADDRESS_ID)) {
    return 'The pickup address of this order could not be found, so it cannot be returned here.';
  }
  if (!isPositiveId(payload.RETURN_OPTION)) return 'Select refund or replacement to continue.';
  if (!isPositiveId(payload.REASON_ID)) return 'Select a reason to continue.';
  // CHANGED (new): null for a replacement; the dialog requires one for a refund.
  if (payload.REFUND_METHOD !== null && !isPositiveId(payload.REFUND_METHOD)) return 'Select a refund method to continue.';
  if (payload.RETURN_DESCRIPTION.trim().length > RETURN_DESCRIPTION_MAX_LENGTH) {
    return `Additional details must be ${RETURN_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/**
 * The DATA rows of a successful `{ STATUS, MESSAGE, DATA }` lookup; a failed STATUS / success throws the API's
 * message (else `fallback`). No DATA is an empty list.
 */
// CHANGED (new): the Cancel / Return Item dialog's product and refund method lookups.
function returnLookupRows(response: unknown, subject: string, fallback: string): unknown[] {
  if (!isRecord(response)) throw new Error(`The ${subject} API returned an invalid response.`);
  const isSuccessful = (value: unknown): boolean =>
    value === undefined ||
    value === true ||
    value === 1 ||
    value === 200 ||
    (typeof value === 'string' && RETURN_REQUEST_SUCCESS_VALUES.includes(value.trim().toUpperCase()));
  if (!isSuccessful(response['status'] ?? response['STATUS']) || !isSuccessful(response['success'] ?? response['SUCCESS'])) {
    throw new Error(readText(response, 'message') || readText(response, 'MESSAGE') || fallback);
  }
  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new Error(`The ${subject} API returned an invalid list.`);
  return data;
}

/**
 * return_dropdown rows as the products a return can be requested for. Left out: rows of another order, rows without a
 * valid ORDER_ID or PRODUCT_ID, rows without PRODUCT_VARIANT_ID (null is a product without a variant) or with an
 * invalid one, and repeated rows of the same order line.
 */
// CHANGED (new)
function mapReturnProducts(response: unknown, orderNumber: string): ReturnProductOption[] {
  const rows = returnLookupRows(response, 'return product', 'The products of this order could not be loaded.');
  const seen = new Set<string>();
  const products: ReturnProductOption[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const rowOrderNumber = readText(row, 'ORDER_NUMBER');
    const orderId = positiveId(row['ORDER_ID']);
    const productId = positiveId(row['PRODUCT_ID']);
    const rawVariantId = row['PRODUCT_VARIANT_ID'];
    const variantId = rawVariantId === null ? null : positiveId(rawVariantId);
    if (
      (rowOrderNumber && rowOrderNumber !== orderNumber) ||
      orderId === null ||
      productId === null ||
      rawVariantId === undefined ||
      (rawVariantId !== null && variantId === null)
    ) {
      continue;
    }
    const key = `${orderId}|${productId}|${variantId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    products.push({
      orderId,
      orderNumber: rowOrderNumber || orderNumber,
      productId,
      variantId,
      name: readText(row, 'PRODUCT_NAME') || `Product #${productId}`,
    });
  }
  return products;
}

/** refund_method rows as options: only the ACTIVE ones with a valid REFUND_METHOD_ID and name, once each. */
// CHANGED (new)
function mapRefundMethods(response: unknown): StatusOption[] {
  const rows = returnLookupRows(response, 'refund method', 'Refund methods could not be loaded.');
  const seen = new Set<number>();
  const methods: StatusOption[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = positiveId(row['REFUND_METHOD_ID']);
    const label = readText(row, 'REFUND_METHOD_NAME');
    const active = row['IS_ACTIVE'];
    const isActive = active === true || active === 1 || (typeof active === 'string' && active.trim().toUpperCase() === 'ACTIVE');
    if (id === null || !label || !isActive || seen.has(id)) continue;
    seen.add(id);
    methods.push({ id, label });
  }
  return methods;
}

/**
 * POST return_request (`{ STATUS: "SUCCESS", ORDER_NUMBER, RETURN_REASON_ID, RETURN_REASON, RETURN_REQUEST_COUNT,
 * RETURN_STATUS_ID, RETURN_STATUS_NAME }`): the request as created, or an error when the body reports a failure.
 * A non-2xx status already errors in HttpClient.
 */
function mapReturnRequestInsertResponse(response: unknown): ReturnRequestResult {
  const empty: ReturnRequestResult = {
    orderNumber: null, reasonId: null, reason: null, requestCount: null, statusId: null, statusName: null,
    message: RETURN_REQUEST_DEFAULT_MESSAGE,
  };
  if (response === null || response === undefined) return empty;
  if (typeof response === 'string') {
    const body = response.trim();
    if (!body || RETURN_REQUEST_SUCCESS_VALUES.includes(body.toUpperCase())) return empty;
    throw new Error(body);
  }
  if (!isRecord(response)) throw new Error('The return request API returned an invalid response.');

  const success = response['success'] ?? response['SUCCESS'];
  const status = response['status'] ?? response['STATUS'];
  const message = readText(response, 'message') || readText(response, 'MESSAGE');
  const isSuccessful = (value: unknown): boolean =>
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' && RETURN_REQUEST_SUCCESS_VALUES.includes(value.trim().toUpperCase()));
  if ((success !== undefined && !isSuccessful(success)) || (status !== undefined && !isSuccessful(status))) {
    throw new Error(message || RETURN_REQUEST_DEFAULT_ERROR);
  }

  // The fields are at the top level (as documented), or in a `data` object.
  const data = isRecord(response['data']) ? response['data'] : response;
  const id = (key: string): number | null => {
    const value = readNumber(data[key]);
    return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  return {
    orderNumber: readText(data, 'ORDER_NUMBER') || null,
    reasonId: id('RETURN_REASON_ID') ?? id('REASON_ID'),
    reason: readText(data, 'RETURN_REASON') || null,
    requestCount: id('RETURN_REQUEST_COUNT'),
    statusId: id('RETURN_STATUS_ID'),
    statusName: readText(data, 'RETURN_STATUS_NAME') || null,
    message: message || RETURN_REQUEST_DEFAULT_MESSAGE,
  };
}

/** A readable message for a failed request: the API's message when it sends one, else `fallback` (with the HTTP status). */
function httpErrorMessage(error: unknown, fallback: string): string {
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
    return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
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

/** A non-negative amount, or null when the API leaves it out or sends something that is not a number. */
function optionalOrderAmount(value: unknown): number | null {
  const parsed = readNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

/** Checks the customer_orders/get envelope and returns its total_records and raw `data` rows. */
function customerOrderRows(response: unknown): { totalRecords: number; rows: unknown[] } {
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
  return { totalRecords, rows: data ?? [] };
}

/** One customer_orders/get row. Rejects rows for another customer and rows missing required fields. */
function mapCustomerOrderLine(value: unknown, customerId: number): CustomerOrderLine {
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
  const paymentMethodId = readNumber(value['PAYMENT_METHOD']);
  // Required, but in rupees and paise (e.g. "4128.82" after GST), so not limited to whole numbers.
  const total = optionalOrderAmount(value['TOTAL_AMOUNT']);
  if (total === null) {
    throw new Error('The customer orders API returned an invalid total amount.');
  }

  return {
    orderId,
    orderNumber,
    productId,
    productVariantId,
    quantity,
    subtotal: optionalOrderAmount(value['SUBTOTAL']),
    discount: optionalOrderAmount(value['DISCOUNT']),
    tax: optionalOrderAmount(value['TAX']),
    shippingCharges: optionalOrderAmount(value['SHIPPING_CHARGES']),
    total,
    paymentMethodId:
      paymentMethodId !== null && Number.isSafeInteger(paymentMethodId) && paymentMethodId > 0
        ? paymentMethodId
        : null,
    orderDate,
    status: statusText,
  };
}

function mapCustomerOrdersResponse(response: unknown, customerId: number): CustomerOrdersPage {
  const { totalRecords, rows } = customerOrderRows(response);
  const orders = rows.map((row): OrderSummary => {
    const line = mapCustomerOrderLine(row, customerId);
    // CHANGED (new): TRACKING_NUMBER, when the row has one, makes the card link to Shipment Tracking. NOTE:
    // customer_orders/get does not send it today; until it does, tracking is opened from the Order Details page.
    const trackingNo = isRecord(row) ? readText(row, 'TRACKING_NUMBER') : '';
    return {
      id: line.orderNumber,
      placedOn: line.orderDate,
      total: line.total,
      status: line.status,
      ...(trackingNo ? { trackingNo } : {}),
      items: [{ productId: line.productId, productVariantId: line.productVariantId, quantity: line.quantity }],
      orderId: line.orderId,
    };
  });

  return { orders, totalRecords };
}

/** Rows requested per customer_orders/get call while looking up one order. */
const ORDER_LOOKUP_PAGE_SIZE = 50;
/** Upper bound on the requests one order lookup makes. */
const MAX_ORDER_LOOKUP_PAGES = 20;

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

// ---- Shipment tracking (CHANGED (new)) ----

/** Rows per tracking request: the API returns one row per product of the order. */
const TRACKING_PAGE_SIZE = 10;
/** Upper bound on the requests one tracking lookup makes. */
const MAX_TRACKING_PAGES = 20;
/** The carrier badge colour (the API sends none; this was the page's colour). */
const DEFAULT_CARRIER_COLOR = '#e63946';
/** A parcel, the icon of every package item (the API sends no product image). */
const PACKAGE_ICON = 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9';
const TRACKING_SUCCESS_VALUES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];

/**
 * Carrier websites by SHIPPING_PROVIDER_NAME (the tracking API sends no URL). A carrier that is not listed gets no
 * website, so the page shows no "Visit Site" button for it.
 */
const CARRIER_SITES: readonly { pattern: RegExp; url: string }[] = [
  { pattern: /blue\s*dart/i, url: 'https://www.bluedart.com/tracking' },
  { pattern: /delhivery/i, url: 'https://www.delhivery.com/tracking' },
  { pattern: /\bdtdc\b/i, url: 'https://www.dtdc.in/' },
  { pattern: /\bekart\b/i, url: 'https://ekartlogistics.com/' },
  { pattern: /india\s*post|speed\s*post/i, url: 'https://www.indiapost.gov.in/' },
  { pattern: /xpress\s*bees/i, url: 'https://www.xpressbees.com/' },
  { pattern: /ecom\s*express/i, url: 'https://ecomexpress.in/' },
];

/**
 * The progress steps of the design, always all five, with the stage each one stands for (see shipmentStage). An "out
 * for delivery" status is shown on In Transit.
 */
// CHANGED: always the design's five steps (they were built from the shipping-status list, which has no "Packed").
export const SHIPMENT_STEPS: readonly string[] = ['Order Placed', 'Packed', 'Shipped', 'In Transit', 'Delivered'];
const SHIPMENT_STEP_STAGES: readonly number[] = [0, 1, 2, 3, 5];
/** Stage of the "Shipped" step (see shipmentStage). */
const SHIPPED_STAGE = 2;

/**
 * An ISO date or date-time ("2026-11-30", "2026-11-26T18:30:00.000Z") that is a real calendar date, else ''.
 * JavaScript reads an impossible date such as "2026-11-31" as 1 Dec, so the day is checked against the month.
 */
export function validIsoDate(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
  if (!match || !Number.isFinite(Date.parse(text))) return '';
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : '';
}

/**
 * Where a shipping status sits in a delivery: 0 ordered (not shipped yet), 1 packed, 2 shipped, 3 in transit,
 * 4 out for delivery, 5 delivered; null for a status outside that path (cancelled, returned, …) or unknown.
 */
export function shipmentStage(status: string): number | null {
  const key = ` ${status.toUpperCase().replace(/[^A-Z]+/g, ' ').trim()} `;
  if (/ (CANCEL\w*|FAIL\w*|RETURN\w*|RTO|LOST|UNDELIVERED) /.test(key)) return null;
  if (/ NOT (SHIPPED|DISPATCHED) | PENDING | ORDERED | PLACED | CONFIRMED | NEW /.test(key)) return 0;
  if (/ OUT FOR DELIVERY /.test(key)) return 4;
  if (/ DELIVERED /.test(key)) return 5;
  if (/ TRANSIT /.test(key)) return 3;
  if (/ (SHIPPED|DISPATCHED|PICKED UP) /.test(key)) return SHIPPED_STAGE;
  if (/ (PACKED|PACKING|PROCESSING|READY) /.test(key)) return 1;
  return null;
}

/** A shipping status for display: "IN TRANSIT" / "in_transit" -> "In Transit". */
// CHANGED (new)
export function shippingStatusLabel(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * DELIVERY_ADDRESS ("pooja, 9876543210, 13/5a, 2nd Street, Near Bus Stand, Chennai, Tamil Nadu, India, 600040"): the
 * name, then the phone, then the address. The address is shown as two lines, the street part and the last four parts
 * (city, state, country, PIN), or one line when it is shorter. Text in any other form is one line, with no name or
 * phone. `city` is the city of an address that ends in city, state, country and a numeric PIN (else absent).
 */
// CHANGED: also returns the city (the destination shown in the Live Route GPS Tracking card).
export function parseDeliveryAddress(value: unknown): { name: string; phone: string; lines: string[]; city?: string } {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { name: '', phone: '', lines: [] };
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  const phone = parts[1] ?? '';
  if (parts.length < 3 || !/^\+?\d{7,15}$/.test(phone.replace(/[\s-]/g, ''))) {
    return { name: '', phone: '', lines: [text] };
  }
  const rest = parts.slice(2);
  // City, state and country in words, then a numeric PIN (else no city: the parts mean something else).
  const [cityPart = '', state = '', country = '', pin = ''] = rest.length >= 4 ? rest.slice(-4) : [];
  const words = /^[A-Za-z][A-Za-z .'-]*$/;
  const city =
    /^\d{4,10}$/.test(pin.replace(/\s/g, '')) && [cityPart, state, country].every((part) => words.test(part)) ? cityPart : '';
  return {
    name: parts[0],
    phone,
    lines: rest.length > 4 ? [rest.slice(0, -4).join(', '), rest.slice(-4).join(', ')] : [rest.join(', ')],
    ...(city ? { city } : {}),
  };
}

/**
 * The schedule state when the tracking API sends no STATUS, from its EXPECTED_DELIVERY_DATE: "On Schedule" up to and
 * including that day, "Delayed" after it. '' without a valid date, and for a delivered, cancelled, failed or returned
 * shipment (no schedule to keep).
 */
// CHANGED (new)
export function derivedScheduleStatus(
  expectedDelivery: string | null,
  shippingStatus: string,
  orderStatus: string,
  today: Date,
  locale = 'en-US',
): string {
  if (!expectedDelivery || /CANCEL|FAIL|RETURN/i.test(orderStatus)) return '';
  const stage = shippingStatus ? shipmentStage(shippingStatus) : 0;
  if (stage === null || stage === 5) return '';
  const day = (value: string | Date): string => formatDate(value, 'yyyy-MM-dd', locale);
  return day(today) <= day(expectedDelivery) ? 'On Schedule' : 'Delayed';
}

/** The dated fields the progress steps are built from. */
type ShipmentStepSource = Pick<
  ShipmentTracking,
  'placedOn' | 'shippedOn' | 'estimatedDelivery' | 'shippingStatusId' | 'shippingStatus'
>;

/**
 * The design's progress steps (SHIPMENT_STEPS) and the current one. The API sends only the current shipping status (no
 * event history). The current status is the order's ORDER_SHIPPING_STATUS_ID in the shipping-status list
 * (shipping_status/get), else its ORDER_SHIPPING_STATUS_NAME; the current step is the last step at or before the stage
 * that status reads as (Order Placed for a status that is not on the delivery path or not known).
 * Captions, as in the design ("22 Sep, 10:30 AM"), are only the dates the API sends: ORDER_DATE under "Order Placed",
 * SHIPPING_DATE under "Shipped", and "Pending Arrival" under "Delivered" until it is reached. No date or place is
 * made up (the API has no packing date and no current location).
 */
// CHANGED: always the design's five steps, the design's caption format, and "Pending Arrival" (it was "Expected
// <date>" when there was a valid one; the design shows the expected date in the status card only).
export function shipmentSteps(
  source: ShipmentStepSource,
  statuses: readonly StatusOption[] | null,
  locale = 'en-US',
): { steps: ShipmentStep[]; currentStep: number } {
  const listed = statuses?.find((status) => status.id === source.shippingStatusId);
  const name = listed?.label.trim() || source.shippingStatus?.trim() || '';
  const stage = name ? shipmentStage(name) : null;
  const currentStep = stage === null ? 0 : SHIPMENT_STEP_STAGES.filter((candidate) => candidate <= stage).length - 1;
  const last = SHIPMENT_STEPS.length - 1;
  // A date-time shows its time too ("22 Sep, 10:30 AM"). A plain date, or a date sent as local midnight (SHIPPING_DATE
  // "2026-11-26T18:30:00.000Z" is 27 Nov 00:00 in India), shows the day only: it has no time of day to show.
  const when = (value: string | null | undefined): string => {
    if (!value) return '';
    const hasTime = /[T ]\d{2}:\d{2}/.test(value) && formatDate(value, 'HH:mm:ss', locale) !== '00:00:00';
    return formatDate(value, hasTime ? 'd MMM, hh:mm a' : 'd MMM', locale);
  };

  const steps = SHIPMENT_STEPS.map((label, index): ShipmentStep => {
    if (index === 0) return { label, caption: when(source.placedOn) };
    if (SHIPMENT_STEP_STAGES[index] === SHIPPED_STAGE) return { label, caption: when(source.shippedOn) };
    if (index === last && currentStep < last) return { label, caption: 'Pending Arrival' };
    return { label, caption: '' };
  });
  return { steps, currentStep };
}

/**
 * SUBTOTAL, DISCOUNT, TAX and TOTAL_AMOUNT as the API sends them. Each order record (ORDER_ID) counts once: rows of
 * one record repeat its amounts, rows of different records (one per product) are added up. An amount missing from
 * any record is null. Shipping is what TOTAL_AMOUNT adds on top of SUBTOTAL + TAX − DISCOUNT, when that is more than 0.
 */
function shipmentTotals(rows: readonly Record<string, unknown>[]): ShipmentTotals {
  const records = new Map<string, Record<string, unknown>>();
  rows.forEach((row, index) => {
    const key = readText(row, 'ORDER_ID') || `row-${index}`;
    if (!records.has(key)) records.set(key, row);
  });
  const sum = (field: string): number | null => {
    let total = 0;
    for (const record of records.values()) {
      const value = optionalOrderAmount(record[field]);
      if (value === null) return null;
      total += value;
    }
    return Math.round(total * 100) / 100;
  };
  const subtotal = sum('SUBTOTAL');
  const discount = sum('DISCOUNT');
  const tax = sum('TAX');
  const total = sum('TOTAL_AMOUNT');
  const shipping =
    subtotal !== null && total !== null
      ? Math.round((total - (subtotal + (tax ?? 0) - (discount ?? 0))) * 100) / 100
      : null;
  return { subtotal, discount, tax, total, shipping: shipping !== null && shipping > 0 ? shipping : null };
}

/** One tracking row as a package item (PRODUCT_NAME, SKU, QUANTITY, PRICE); a missing number is null, never 0. */
function shipmentItem(row: Record<string, unknown>, index: number): ShipmentItem {
  const quantity = readNumber(row['QUANTITY']);
  const productId = readText(row, 'PRODUCT_ID');
  // CHANGED (new): this row's own IDs, which a Cancel / Return Item request sends (ORDER_ID, PRODUCT_ID,
  // PRODUCT_VARIANT_ID, SELLER_ID, SHIPPING_ID, DELIVERY_ADDRESS_ID). A missing or invalid ID is left out; a
  // PRODUCT_VARIANT_ID sent as null means the product was ordered without a variant.
  const orderId = positiveId(row['ORDER_ID']);
  const productIdValue = positiveId(row['PRODUCT_ID']);
  const variantIdValue = positiveId(row['PRODUCT_VARIANT_ID']);
  const sellerId = positiveId(row['SELLER_ID']);
  const shippingId = positiveId(row['SHIPPING_ID']);
  const deliveryAddressId = positiveId(row['DELIVERY_ADDRESS_ID']);
  return {
    ...(orderId !== null ? { orderId } : {}),
    ...(productIdValue !== null ? { productId: productIdValue } : {}),
    ...(row['PRODUCT_VARIANT_ID'] === null
      ? { variantId: null }
      : variantIdValue !== null
        ? { variantId: variantIdValue }
        : {}),
    ...(sellerId !== null ? { sellerId } : {}),
    ...(shippingId !== null ? { shippingId } : {}),
    ...(deliveryAddressId !== null ? { deliveryAddressId } : {}),
    name: readText(row, 'PRODUCT_NAME') || (productId ? `Product #${productId}` : 'Product'),
    sku: readText(row, 'SKU') || readText(row, 'PRODUCT_CODE_SKU'),
    quantity: quantity !== null && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null,
    price: optionalOrderAmount(row['PRICE']),
    icon: PACKAGE_ICON,
    tone: index === 0 ? 'accent' : 'neutral',
  };
}

/**
 * Every tracking row of one order as one shipment: the order, shipping and carrier fields from the first row, one
 * package item per row, and the order totals. Null when there are no rows. The steps are built without the
 * shipping-status list (see shipmentSteps); OrderService replaces them once that list is loaded.
 * The schedule state is STATUS, or, when the API sends none, derivedScheduleStatus (`today` is for tests).
 */
export function mapShipmentTracking(rows: readonly unknown[], orderNumber = '', today = new Date()): ShipmentTracking | null {
  const records = rows.filter(isRecord);
  const first = records[0];
  if (!first) return null;

  const providerName = readText(first, 'SHIPPING_PROVIDER_NAME');
  const siteUrl = providerName ? CARRIER_SITES.find(({ pattern }) => pattern.test(providerName))?.url : undefined;
  const shippingStatusId = readNumber(first['ORDER_SHIPPING_STATUS_ID']);
  const shippingStatus = readText(first, 'ORDER_SHIPPING_STATUS_NAME');
  const orderStatus = readText(first, 'ORDER_STATUS_NAME');
  // CHANGED: from EXPECTED_DELIVERY_DATE when the API sends no STATUS.
  const scheduleStatus =
    readText(first, 'STATUS') ||
    derivedScheduleStatus(validIsoDate(first['EXPECTED_DELIVERY_DATE']) || null, shippingStatus, orderStatus, today);
  const shipmentNumber = readText(first, 'SHIPMENT_NUMBER');
  const shippedOn = validIsoDate(first['SHIPPING_DATE']);
  // NOTE (backend dependency): no API sends live tracking data (current location, coordinates, distance, route,
  // driver, vehicle, tracking events), so currentLocation, distanceKm and route stay unset and the Live Tracking UI
  // says the live location is not available yet. Map them here once the backend defines those fields.
  const source: ShipmentStepSource = {
    placedOn: validIsoDate(first['ORDER_DATE']),
    // NOTE: the backend must send a real date here; "2026-11-31" (the sample) is not one, so it is not shown.
    estimatedDelivery: validIsoDate(first['EXPECTED_DELIVERY_DATE']) || null,
    ...(shippedOn ? { shippedOn } : {}),
    ...(shippingStatusId !== null && Number.isSafeInteger(shippingStatusId) && shippingStatusId > 0
      ? { shippingStatusId }
      : {}),
    ...(shippingStatus ? { shippingStatus } : {}),
  };

  return {
    orderId: readText(first, 'ORDER_NUMBER') || orderNumber.trim(),
    ...source,
    ...(orderStatus ? { orderStatus } : {}),
    ...(shipmentNumber ? { shipmentNumber } : {}),
    carrier: {
      name: providerName,
      code: providerName.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase(),
      color: DEFAULT_CARRIER_COLOR,
      trackingNo: readText(first, 'TRACKING_NUMBER'),
      ...(siteUrl ? { siteUrl } : {}),
    },
    scheduleStatus,
    onSchedule: !/delay|late/i.test(scheduleStatus),
    ...shipmentSteps(source, null),
    items: records.map(shipmentItem),
    address: parseDeliveryAddress(first['DELIVERY_ADDRESS']),
    totals: shipmentTotals(records),
  };
}

/** The shipment with its steps built from the shipping-status list (see shipmentSteps). */
export function withShipmentSteps(shipment: ShipmentTracking, statuses: readonly StatusOption[] | null): ShipmentTracking {
  return { ...shipment, ...shipmentSteps(shipment, statuses) };
}

/** Checks the tracking envelope and returns its `count` (null when absent) and `data` rows. */
function trackingRows(response: unknown): { count: number | null; rows: unknown[] } {
  if (!isRecord(response)) throw new Error('The shipment tracking API returned an invalid response.');
  const success = response['success'] ?? response['SUCCESS'];
  const status = response['status'] ?? response['STATUS'];
  const message = readText(response, 'message') || readText(response, 'MESSAGE');
  const isSuccessful = (value: unknown): boolean =>
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' && TRACKING_SUCCESS_VALUES.includes(value.trim().toUpperCase()));
  if (
    (success !== undefined && !isSuccessful(success)) ||
    (status !== undefined && !isSuccessful(status)) ||
    (success === undefined && status === undefined)
  ) {
    throw new Error(message || 'Shipment tracking could not be loaded.');
  }
  const data = response['data'] ?? response['DATA'];
  if (data !== null && data !== undefined && !Array.isArray(data)) {
    throw new Error('The shipment tracking API returned an invalid list.');
  }
  const count = readNumber(response['count'] ?? response['total_records']);
  return {
    count: count !== null && Number.isSafeInteger(count) && count >= 0 ? count : null,
    rows: Array.isArray(data) ? data : [],
  };
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
  /** The shipping-status list for shipment tracking, loaded once (see trackingShippingStatuses). */
  // CHANGED (new)
  private trackingStatuses$?: Observable<StatusOption[]>;

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

  /**
   * Every customer_orders/get row of one order number, or null when the signed-in customer has no such
   * order. The API has no order filter, so the customer's orders are paged with LIMIT/OFFSET until the
   * order is found. One order's rows are stored together, so paging stops on the page where that order's
   * rows end. It also stops at total_records, when a page brings no new rows (an API that ignores OFFSET),
   * or after MAX_ORDER_LOOKUP_PAGES. OFFSET advances by the rows actually returned, so a server-side LIMIT
   * cap cannot skip rows.
   */
  getCustomerOrderDetail(customerId: number, orderNumber: string): Observable<CustomerOrderDetail | null> {
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new RangeError('Customer ID must be a positive safe integer.');
    }
    const wanted = orderNumber.trim();
    if (!wanted) {
      throw new RangeError('Order number is required.');
    }

    return defer(() => {
      const seenIds = new Set<number>();
      const lines: CustomerOrderLine[] = [];
      const loadPage = (pageIndex: number, offset: number) =>
        this.api
          .get<unknown>(API_ENDPOINTS.customerOrders.get, { LIMIT: ORDER_LOOKUP_PAGE_SIZE, OFFSET: offset })
          .pipe(
            map((response) => {
              const { totalRecords, rows } = customerOrderRows(response);
              const pageLines = rows.map((row) => mapCustomerOrderLine(row, customerId));
              const added = pageLines.filter((line) => !seenIds.has(line.orderId));
              for (const line of added) seenIds.add(line.orderId);
              lines.push(...added.filter((line) => line.orderNumber === wanted));

              const nextOffset = offset + pageLines.length;
              const orderEnded = lines.length > 0 && pageLines.at(-1)?.orderNumber !== wanted;
              const done =
                orderEnded ||
                !added.length ||
                nextOffset >= totalRecords ||
                pageIndex + 1 >= MAX_ORDER_LOOKUP_PAGES;
              return { pageIndex, nextOffset, done };
            }),
          );

      return loadPage(0, 0).pipe(
        expand(({ pageIndex, nextOffset, done }) => (done ? EMPTY : loadPage(pageIndex + 1, nextOffset))),
        last(),
        map((): CustomerOrderDetail | null => (lines.length ? { orderNumber: wanted, lines: [...lines] } : null)),
      );
    });
  }

  getReturnReasons(): Observable<ReturnReasonOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.returnReasons.get, { REASON_ID: -1, REASON: -1 })
      .pipe(map(mapReturnReasonsResponse));
  }

  /**
   * The return types of the Cancel / Return Item dialog: the "RETURN/<kind>" return statuses ("RETURN/REPLACE",
   * "RETURN/REFUND") of GET return_status (getReturnStatuses), each as `{ id: RETURN_STATUS_ID, label:
   * RETURN_STATUS_NAME }`, in the API's order. The chosen one's RETURN_STATUS_ID is sent as RETURN_OPTION.
   */
  // CHANGED: from return_status (it was the "RETURN/…" entries of shipping_status/get, by SHIPPING_STATUS_ID).
  getReturnTypes(): Observable<StatusOption[]> {
    return this.getReturnStatuses().pipe(map((statuses) => statuses.filter(isReturnType)));
  }

  /**
   * The products of one order a return can be requested for (the Cancel / Return Item dialog's Product): GET
   * return_dropdown `?ORDER_NUMBER=…&LIMIT=…&OFFSET=…`, each with its ORDER_ID, PRODUCT_ID and PRODUCT_VARIANT_ID.
   */
  // CHANGED (new)
  getReturnProducts(orderNumber: string, limit = 10, offset = 0): Observable<ReturnProductOption[]> {
    const wanted = orderNumber.trim();
    if (!wanted) return throwError(() => new RangeError('Order number is required.'));
    assertPaging(limit, offset, 'Return product');
    return this.api
      .get<unknown>(API_ENDPOINTS.returnProducts.get, { ORDER_NUMBER: wanted, LIMIT: limit, OFFSET: offset })
      .pipe(map((response) => mapReturnProducts(response, wanted)));
  }

  /**
   * The active refund methods (the Cancel / Return Item dialog's Refund Method): GET refund_method
   * `?REFUND_METHOD_ID=-1&LIMIT=…&OFFSET=…`, each as `{ id: REFUND_METHOD_ID, label: REFUND_METHOD_NAME }`.
   */
  // CHANGED (new)
  getRefundMethods(limit = 10, offset = 0): Observable<StatusOption[]> {
    assertPaging(limit, offset, 'Refund method');
    return this.api
      .get<unknown>(API_ENDPOINTS.refundMethods.get, { REFUND_METHOD_ID: -1, LIMIT: limit, OFFSET: offset })
      .pipe(map(mapRefundMethods));
  }

  /**
   * The customer's Cancel / Return Item request: POST return_request `{ ORDER_NUMBER, PRODUCT_ID, REASON_ID,
   * RETURN_DESCRIPTION }` (the access token identifies the customer). Emits the request as the API created it.
   */
  // CHANGED (new)
  // CHANGED: the backend contract's full body (RETURN_OPTION, PRODUCT_ID, VARIANT_ID, SELLER_ID, PICKUP_ADDRESS_ID).
  createReturnRequest(payload: ReturnRequestInsert): Observable<ReturnRequestResult> {
    const problem = returnRequestProblem(payload);
    if (problem) return throwError(() => new RangeError(problem));
    // CHANGED: with ORDER_ID and REFUND_METHOD, in the backend contract's order.
    const body: ReturnRequestInsert = {
      ORDER_NUMBER: payload.ORDER_NUMBER.trim(),
      ORDER_ID: payload.ORDER_ID,
      REASON_ID: payload.REASON_ID,
      RETURN_DESCRIPTION: payload.RETURN_DESCRIPTION.trim(),
      RETURN_OPTION: payload.RETURN_OPTION,
      PRODUCT_ID: payload.PRODUCT_ID,
      VARIANT_ID: payload.VARIANT_ID,
      SELLER_ID: payload.SELLER_ID,
      PICKUP_ADDRESS_ID: payload.PICKUP_ADDRESS_ID,
      REFUND_METHOD: payload.REFUND_METHOD,
    };
    return this.api
      .post<unknown>(API_ENDPOINTS.returnRequests.insert, body)
      .pipe(map(mapReturnRequestInsertResponse));
  }

  /** A readable message for a failed return request (the API's message when it sends one). */
  // CHANGED (new)
  returnRequestErrorMessage(error: unknown): string {
    return httpErrorMessage(error, RETURN_REQUEST_DEFAULT_ERROR);
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

  /**
   * Approves, rejects or only moves a return request to another status (the Return Request screen's actions dialog):
   * PUT return_request/update `{ RETURN_ID, RETURN_STATUS, ACTION }`, where RETURN_STATUS is the Return Status picked (a
   * SHIPPING_STATUS_ID) and ACTION is APPROVED or REJECTED, or null for a status-only update.
   * Emits the API's message.
   */
  // CHANGED (new): replaces updateReturnRequestStatus, whose `{ RETURN_ID, RETURN_STATUS: 'APPROVED' | 'REJECTED' }`
  // the backend refuses ("ACTION must be APPROVE or REJECT").
  reviewReturnRequest(payload: ReturnRequestReview): Observable<string> {
    if (!isPositiveId(payload.RETURN_ID)) {
      return throwError(() => new RangeError('Return ID must be a positive safe integer.'));
    }
    if (!isPositiveId(payload.RETURN_STATUS)) {
      return throwError(() => new RangeError('Return status must be a positive status ID.'));
    }
    // CHANGED: APPROVED / REJECTED (it was APPROVE / REJECT), or null to update the return status only.
    if (payload.ACTION !== 'APPROVED' && payload.ACTION !== 'REJECTED' && payload.ACTION !== null) {
      return throwError(() => new RangeError('Action must be APPROVED, REJECTED or null.'));
    }

    return this.api
      .put<unknown>(API_ENDPOINTS.returnRequests.update, {
        RETURN_ID: payload.RETURN_ID,
        RETURN_STATUS: payload.RETURN_STATUS,
        ACTION: payload.ACTION,
      })
      .pipe(map((response) => mapReturnRequestUpdateResponse(response, payload.ACTION)));
  }

  /**
   * The return statuses: GET return_status `?RETURN_STATUS_ID=-1&LIMIT=…&OFFSET=…`, each as `{ id: RETURN_STATUS_ID,
   * label: RETURN_STATUS_NAME }`. The Cancel / Return Item dialog's Return Type options (getReturnTypes).
   */
  // CHANGED (new)
  getReturnStatuses(limit = 10, offset = 0): Observable<StatusOption[]> {
    assertPaging(limit, offset, 'Return status');
    return this.api
      .get<unknown>(API_ENDPOINTS.returnStatuses.get, { RETURN_STATUS_ID: -1, LIMIT: limit, OFFSET: offset })
      .pipe(map((response) => mapStatusLookup(response, 'RETURN_STATUS_ID', 'RETURN_STATUS_NAME', 'return')));
  }

  /** A readable message for a failed approval, rejection or status update (the API's message when it sends one). */
  // CHANGED: also the status-only update (action null).
  returnReviewErrorMessage(error: unknown, action: ReturnDecision | null): string {
    return httpErrorMessage(error, `Return request ${returnUpdateNoun(action)} failed.`);
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

  // CHANGED: ORDER_STATUS defaults to -1 (every order status), like PAYMENT_STATUS and SHIPPING_STATUS; it was 1, so
  // the Admin listing only showed orders with status 1 at first.
  getManagementOrders(
    filters: Partial<OrderManagementFilters> = {},
  ): Observable<OrderManagementOrder[]> {
    const params: OrderManagementFilters = {
      DAYS: filters.DAYS ?? 7,
      ORDER_STATUS: filters.ORDER_STATUS ?? -1,
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

  /**
   * Admin: updates one order's statuses with PUT place_order/update `{ ORDER_ID, ORDER_STATUS, PAYMENT_STATUS,
   * SHIPPING_STATUS }`. Every ID must be a positive whole number (status IDs come from the status lookups; -1 "all"
   * is a filter value, never a status). Emits the API's message.
   */
  // CHANGED (new)
  updateOrderStatus(payload: OrderStatusUpdate): Observable<string> {
    for (const key of ['ORDER_ID', 'ORDER_STATUS', 'PAYMENT_STATUS', 'SHIPPING_STATUS'] as const) {
      if (!Number.isSafeInteger(payload[key]) || payload[key] <= 0) {
        return throwError(() => new RangeError(`${key} must be a positive safe integer.`));
      }
    }
    return this.api
      .put<unknown>(API_ENDPOINTS.placeOrder.update, {
        ORDER_ID: payload.ORDER_ID,
        ORDER_STATUS: payload.ORDER_STATUS,
        PAYMENT_STATUS: payload.PAYMENT_STATUS,
        SHIPPING_STATUS: payload.SHIPPING_STATUS,
      })
      .pipe(map(mapOrderUpdateResponse));
  }

  /** A readable message for a failed order update (the API's message when it sends one). */
  // CHANGED (new)
  // CHANGED: shares httpErrorMessage with the other order requests (same messages).
  orderUpdateErrorMessage(error: unknown): string {
    return httpErrorMessage(error, ORDER_UPDATE_DEFAULT_ERROR);
  }

  getManagementCounts(days: number): Observable<OrderManagementCounts> {
    if (!Number.isSafeInteger(days) || days < 1) {
      throw new RangeError('The order count date filter must be a positive number of days.');
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.orderCount, { DAYS: days })
      .pipe(map(mapOrderManagementCountsResponse));
  }

  /**
   * Shipment tracking of one order: GET tracking?ORDER_NUMBER=…&LIMIT=…&OFFSET=… (the access token identifies the
   * customer). The API returns one row per product, so pages are read until `count` rows arrived (or a page is short
   * or empty, or MAX_TRACKING_PAGES); OFFSET advances by the rows returned. Rows of another order number are left out.
   * The current progress step is read from the shipping-status list (getShippingStatuses), or from the status name when
   * it cannot be loaded. Null when the order has no tracking rows.
   */
  // CHANGED (new): replaces findTracking (demo data).
  getShipmentTracking(orderNumber: string): Observable<ShipmentTracking | null> {
    const wanted = orderNumber.trim();
    if (!wanted) return throwError(() => new RangeError('Order number is required.'));

    return defer(() => {
      const rows: unknown[] = [];
      const loadPage = (pageIndex: number, offset: number) =>
        this.api
          .get<unknown>(API_ENDPOINTS.shipmentTracking.get, {
            ORDER_NUMBER: wanted,
            LIMIT: TRACKING_PAGE_SIZE,
            OFFSET: offset,
          })
          .pipe(
            map((response) => {
              const page = trackingRows(response);
              rows.push(...page.rows);
              const nextOffset = offset + page.rows.length;
              const done =
                !page.rows.length ||
                (page.count !== null ? nextOffset >= page.count : page.rows.length < TRACKING_PAGE_SIZE) ||
                pageIndex + 1 >= MAX_TRACKING_PAGES;
              return { pageIndex, nextOffset, done };
            }),
          );

      return loadPage(0, 0).pipe(
        expand(({ pageIndex, nextOffset, done }) => (done ? EMPTY : loadPage(pageIndex + 1, nextOffset))),
        last(),
        map(() =>
          mapShipmentTracking(
            rows.filter((row) => !isRecord(row) || !readText(row, 'ORDER_NUMBER') || readText(row, 'ORDER_NUMBER') === wanted),
            wanted,
          ),
        ),
        switchMap((shipment) =>
          shipment
            ? this.trackingShippingStatuses().pipe(
                map((statuses) => withShipmentSteps(shipment, statuses)),
                // Without the list the fixed steps stay.
                catchError(() => of(shipment)),
              )
            : of(null),
        ),
      );
    });
  }

  /**
   * getShippingStatuses for shipment tracking, loaded once and shared, so loading the tracking again (the page's
   * Refresh) requests only GET tracking. A failed load is not kept: the next tracking load asks again.
   */
  // CHANGED (new)
  private trackingShippingStatuses(): Observable<StatusOption[]> {
    this.trackingStatuses$ ??= this.getShippingStatuses().pipe(
      catchError((error: unknown) => {
        this.trackingStatuses$ = undefined;
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.trackingStatuses$;
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
  // CHANGED: shares httpErrorMessage with the other order requests (same messages).
  placeOrderErrorMessage(error: unknown): string {
    return httpErrorMessage(error, PLACE_ORDER_DEFAULT_ERROR);
  }

  /** A readable message for a failed customer_orders/get call. `subject` starts the fallback ("Orders"). */
  customerOrdersErrorMessage(error: unknown, subject = 'Orders'): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'string' && body.trim()) return body.trim();
      if (isRecord(body)) {
        const message = body['message'] ?? body['MESSAGE'];
        if (typeof message === 'string' && message.trim()) return message.trim();
      }
      return error.status
        ? `${subject} could not be loaded (HTTP ${error.status}).`
        : `${subject} could not be loaded. Check your connection and try again.`;
    }
    return error instanceof Error && error.message
      ? error.message
      : `${subject} could not be loaded. Please try again.`;
  }
}