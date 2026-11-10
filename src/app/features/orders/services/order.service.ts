import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { OrderSummary, ShipmentTracking, StatusOption } from '@shared/models';
import { DEMO_SHIPMENT, DEMO_TRACKING_ORDER_ID } from '../data/shipment-tracking';
import { ORDER_SUMMARIES } from '../data/order-summaries';

export interface OrderManagementFilters {
  DAYS: number;
  ORDER_STATUS: number;
  PAYMENT_STATUS: number;
  SHIPPING_STATUS: number;
}

export interface OrderManagementOrder {
  id: number;
  orderNo: string;
  orderDate: string;
  customer: string;
  mobile: string;
  productId: number | null;
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
  const message = response['message'] ?? response['MESSAGE'];
  if (
    status !== undefined &&
    status !== true &&
    !(
      typeof status === 'string' &&
      ['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase())
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
    quantity: readNumber(value['QUANTITY']),
    amount: readNumber(value['ORDER_AMOUNT']),
    paymentStatusId: readNumber(value['PAYMENT_STATUS']),
    orderStatusId: readNumber(value['ORDER_STATUS']),
    shippingStatusId: readNumber(value['SHIPPING_STATUS']),
  };
}

function mapOrderManagementResponse(response: unknown): OrderManagementOrder[] {
  if (!isRecord(response)) {
    throw new Error('The order management API returned an invalid response.');
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
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Orders could not be loaded.',
    );
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error('The order management API returned an invalid order list.');
  }
  return data.map(mapOrder).filter((order): order is OrderManagementOrder => order !== null);
}

function mapOrderManagementCountsResponse(response: unknown): OrderManagementCounts {
  if (!isRecord(response)) {
    throw new Error('The order count API returned an invalid response.');
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
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Order counts could not be loaded.',
    );
  }

  const data = response['data'] ?? response['DATA'];
  if (!isRecord(data)) {
    throw new Error('The order count API returned no usable count data.');
  }

  const readRequiredCount = (key: string, integer: boolean): number => {
    const value = readNumber(data[key]);
    if (value === null || value < 0 || (integer && !Number.isSafeInteger(value))) {
      throw new Error(`The order count API returned an invalid ${key} value.`);
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

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiService);

  getOrderStatuses(): Observable<StatusOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.orderStatuses, { ORDER_STATUS_ID: -1 })
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
    if (!Number.isSafeInteger(params.DAYS) || params.DAYS < 1) {
      throw new RangeError('The order date filter must be a positive number of days.');
    }
    for (const key of ['ORDER_STATUS', 'PAYMENT_STATUS', 'SHIPPING_STATUS'] as const) {
      const value = params[key];
      if (!Number.isSafeInteger(value) || (value !== -1 && value <= 0)) {
        throw new RangeError(`${key} must be -1 or a positive safe integer.`);
      }
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.get, {
        DAYS: params.DAYS,
        ORDER_STATUS: params.ORDER_STATUS,
        PAYMENT_STATUS: params.PAYMENT_STATUS,
        SHIPPING_STATUS: params.SHIPPING_STATUS,
      })
      .pipe(map(mapOrderManagementResponse));
  }

  getManagementCounts(days: number): Observable<OrderManagementCounts> {
    if (!Number.isSafeInteger(days) || days < 1) {
      throw new RangeError('The order count date filter must be a positive number of days.');
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.orderManagement.orderCount, { DAYS: days })
      .pipe(map(mapOrderManagementCountsResponse));
  }

  /** Order history for the signed-in user (demo data until the API is wired). */
  readonly orders: readonly OrderSummary[] = ORDER_SUMMARIES;

  /** Shipment tracking for an order, or undefined when the order is unknown (demo data until the API is wired). */
  findTracking(orderId: string): ShipmentTracking | undefined {
    const known = orderId === DEMO_TRACKING_ORDER_ID || this.orders.some((order) => order.id === orderId);
    return known ? { ...DEMO_SHIPMENT, orderId } : undefined;
  }

  // Order detail / placement API calls will be added here.
}
