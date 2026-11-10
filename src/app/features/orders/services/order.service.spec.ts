import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api' },
      ],
    });
    service = TestBed.inject(OrderService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads all three dynamic status lookups using the expected ID parameters', () => {
    let orderStatuses: unknown;
    let paymentStatuses: unknown;
    let shippingStatuses: unknown;
    service.getOrderStatuses().subscribe((options) => (orderStatuses = options));
    service.getPaymentStatuses().subscribe((options) => (paymentStatuses = options));
    service.getShippingStatuses().subscribe((options) => (shippingStatuses = options));

    http
      .expectOne(
        (request) =>
          request.url === 'https://api.example.test/api/all_status/get' &&
          request.params.get('ORDER_STATUS_ID') === '-1',
      )
      .flush({
        status: 'SUCCESS',
        data: [{ ORDER_STATUS_ID: 1, ORDER_STATUS: 'CONFIRMED' }],
      });
    http
      .expectOne(
        (request) =>
          request.url === 'https://api.example.test/api/payment_status/get' &&
          request.params.get('PAYMENT_STATUS_ID') === '-1',
      )
      .flush({
        status: 'SUCCESS',
        data: [
          { PAYMENT_STATUS_ID: 3, PAYMENT_STATUS: 'FAILED' },
          { PAYMENT_STATUS_ID: 2, PAYMENT_STATUS: 'PENDING' },
          { PAYMENT_STATUS_ID: 1, PAYMENT_STATUS: 'PAID' },
        ],
      });
    http
      .expectOne(
        (request) =>
          request.url === 'https://api.example.test/api/shipping_status/get' &&
          request.params.get('SHIPPING_STATUS_ID') === '-1',
      )
      .flush({
        status: 'SUCCESS',
        data: [
          { SHIPPING_STATUS_ID: 4, SHIPPING_STATUS: 'DELIVERED' },
          { SHIPPING_STATUS_ID: 3, SHIPPING_STATUS: 'IN TRANSIT' },
          { SHIPPING_STATUS_ID: 2, SHIPPING_STATUS: 'NOT SHIPPED' },
          { SHIPPING_STATUS_ID: 1, SHIPPING_STATUS: 'SHIPPED' },
        ],
      });

    expect(orderStatuses).toEqual([{ id: 1, label: 'CONFIRMED' }]);
    expect(paymentStatuses).toEqual([
      { id: 3, label: 'FAILED' },
      { id: 2, label: 'PENDING' },
      { id: 1, label: 'PAID' },
    ]);
    expect(shippingStatuses).toEqual([
      { id: 4, label: 'DELIVERED' },
      { id: 3, label: 'IN TRANSIT' },
      { id: 2, label: 'NOT SHIPPED' },
      { id: 1, label: 'SHIPPED' },
    ]);
  });

  it('reports a failed status lookup response without affecting other lookups', () => {
    let error: unknown;
    service.getPaymentStatuses().subscribe({ error: (result: unknown) => (error = result) });

    http
      .expectOne((request) => request.url.endsWith('/payment_status/get'))
      .flush({ status: 'FAILED', message: 'Payment statuses unavailable.' });

    expect(error).toEqual(new Error('Payment statuses unavailable.'));
  });

  it('uses the required default filters and maps the order response', () => {
    let result: unknown;
    service.getManagementOrders().subscribe((orders) => (result = orders));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/api/order_dashboard/get' &&
        candidate.params.get('DAYS') === '7' &&
        candidate.params.get('ORDER_STATUS') === '1' &&
        candidate.params.get('PAYMENT_STATUS') === '-1' &&
        candidate.params.get('SHIPPING_STATUS') === '-1',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      status: 'SUCCESS',
      data: [
        {
          ORDER_ID: 1,
          ORDER_NUMBER: 'ORD0001',
          ORDER_DATE: '2026-10-28T18:30:00.000Z',
          CUSTOMER_ID: null,
          CUSTOMER_NAME: 'Ravi Kumar',
          CUSTOMER_MOBILE: '9876543210',
          PRODUCT_ID: 3,
          QUANTITY: 2,
          ORDER_AMOUNT: '1500.00',
          PAYMENT_STATUS: 1,
          ORDER_STATUS: 1,
          SHIPPING_STATUS: 1,
        },
        {
          ORDER_ID: 2,
          ORDER_NUMBER: 'ORD0002',
          CUSTOMER_ID: null,
          CUSTOMER_NAME: null,
          CUSTOMER_MOBILE: null,
          PRODUCT_ID: null,
          QUANTITY: null,
          ORDER_AMOUNT: null,
          PAYMENT_STATUS: null,
          ORDER_STATUS: null,
          SHIPPING_STATUS: null,
        },
        { ORDER_NUMBER: 'missing ID' },
      ],
    });

    expect(result).toEqual([
      {
        id: 1,
        orderNo: 'ORD0001',
        orderDate: '2026-10-28T18:30:00.000Z',
        customer: 'Ravi Kumar',
        mobile: '9876543210',
        productId: 3,
        quantity: 2,
        amount: 1500,
        paymentStatusId: 1,
        orderStatusId: 1,
        shippingStatusId: 1,
      },
      {
        id: 2,
        orderNo: 'ORD0002',
        orderDate: '—',
        customer: '—',
        mobile: '—',
        productId: null,
        quantity: null,
        amount: null,
        paymentStatusId: null,
        orderStatusId: null,
        shippingStatusId: null,
      },
    ]);
  });

  it('sends the selected values for all filters', () => {
    service
      .getManagementOrders({
        DAYS: 30,
        ORDER_STATUS: 3,
        PAYMENT_STATUS: 2,
        SHIPPING_STATUS: -1,
      })
      .subscribe();

    http.expectOne(
      (request) =>
        request.params.get('DAYS') === '30' &&
        request.params.get('ORDER_STATUS') === '3' &&
        request.params.get('PAYMENT_STATUS') === '2' &&
        request.params.get('SHIPPING_STATUS') === '-1',
    ).flush({ status: 'SUCCESS', data: [] });
  });

  it('returns an empty list for an empty response', () => {
    let result: unknown;
    service.getManagementOrders().subscribe((orders) => (result = orders));

    http.expectOne((request) => request.url.endsWith('/order_dashboard/get')).flush({
      status: 'SUCCESS',
      data: null,
    });

    expect(result).toEqual([]);
  });

  it('reports an unsuccessful API response', () => {
    let error: unknown;
    service.getManagementOrders().subscribe({ error: (result: unknown) => (error = result) });

    http.expectOne((request) => request.url.endsWith('/order_dashboard/get')).flush({
      status: 'FAILED',
      message: 'Orders are unavailable.',
    });

    expect(error).toEqual(new Error('Orders are unavailable.'));
  });

  it('rejects invalid filter values before making a request', () => {
    expect(() => service.getManagementOrders({ DAYS: 0 })).toThrowError(
      'The order date filter must be a positive number of days.',
    );
    expect(() => service.getManagementOrders({ ORDER_STATUS: 0 })).toThrowError(
      'ORDER_STATUS must be -1 or a positive safe integer.',
    );
    http.expectNone((request) => request.url.endsWith('/order_dashboard/get'));
  });

  it('loads order counts for the selected date range and maps the response', () => {
    let result: unknown;
    service.getManagementCounts(30).subscribe((counts) => (result = counts));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/api/order_count/get' &&
        candidate.params.get('DAYS') === '30',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      status: 'SUCCESS',
      message: 'Order dashboard counts fetched successfully',
      data: {
        TOTAL_ORDERS: 4,
        TOTAL_REVENUE: 6000,
        PENDING_ORDERS: 0,
        SHIPPED_ORDERS: 4,
        DELIVERED_ORDERS: 0,
      },
    });

    expect(result).toEqual({
      totalOrders: 4,
      totalRevenue: 6000,
      pendingOrders: 0,
      shippedOrders: 4,
      deliveredOrders: 0,
    });
  });

  it('rejects invalid date ranges and empty count data', () => {
    expect(() => service.getManagementCounts(0)).toThrowError(
      'The order count date filter must be a positive number of days.',
    );

    let error: unknown;
    service.getManagementCounts(7).subscribe({ error: (result: unknown) => (error = result) });
    http
      .expectOne((request) => request.url.endsWith('/order_count/get'))
      .flush({ status: 'SUCCESS', data: null });
    expect(error).toEqual(new Error('The order count API returned no usable count data.'));
  });
});
