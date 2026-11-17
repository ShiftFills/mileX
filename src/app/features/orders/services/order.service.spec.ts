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

  it('loads customer orders with LIMIT/OFFSET and maps amounts and product IDs', () => {
    let result: unknown;
    service.getCustomerOrders(1, 10, 0).subscribe((page) => (result = page));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/api/customer_orders/get' &&
        candidate.params.get('LIMIT') === '10' &&
        candidate.params.get('OFFSET') === '0',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('CUSTOMER_ID')).toBeNull();
    request.flush({
      success: true,
      message: 'Customer orders fetched successfully',
      total_records: 9,
      data: [
        {
          ORDER_ID: 15,
          ORDER_NUMBER: 'ORD0005',
          CUSTOMER_ID: 1,
          PRODUCT_ID: 1,
          PRODUCT_VARIANT_ID: 13,
          QUANTITY: 1,
          SUBTOTAL: '2000.00',
          DISCOUNT: '0.00',
          TAX: '0.00',
          ORDER_DATE: '2026-11-16T01:59:01.000Z',
          SHIPPING_CHARGES: '0.00',
          TOTAL_AMOUNT: '2000.00',
          PAYMENT_METHOD: 1,
          STATUS: 'ORDERED',
        },
      ],
    });

    expect(result).toEqual({
      totalRecords: 9,
      orders: [
        {
          id: 'ORD0005',
          orderId: 15,
          placedOn: '2026-11-16T01:59:01.000Z',
          total: 2000,
          status: 'ORDERED',
          items: [{ productId: 1, productVariantId: 13, quantity: 1 }],
        },
      ],
    });
  });

  it('rejects customer rows that do not match the authenticated customer ID', () => {
    let error: unknown;
    service.getCustomerOrders(1, 10, 0).subscribe({
      error: (caught: unknown) => (error = caught),
    });
    http.expectOne((request) => request.url.endsWith('/customer_orders/get')).flush({
      success: true,
      total_records: 1,
      data: [
        {
          ORDER_ID: 15,
          ORDER_NUMBER: 'ORD0005',
          CUSTOMER_ID: 3,
          PRODUCT_ID: 1,
          PRODUCT_VARIANT_ID: 13,
          QUANTITY: 1,
          SUBTOTAL: '2000.00',
          DISCOUNT: '0.00',
          TAX: '0.00',
          ORDER_DATE: '2026-11-16T01:59:01.000Z',
          SHIPPING_CHARGES: '0.00',
          TOTAL_AMOUNT: '2000.00',
          PAYMENT_METHOD: 1,
          STATUS: 'ORDERED',
        },
      ],
    });

    expect(error).toEqual(
      new Error('The customer orders API returned an order for a different customer.'),
    );
  });

  it('validates customer ID, page size, and offset before making a request', () => {
    expect(() => service.getCustomerOrders(0, 10, 0)).toThrowError(RangeError);
    expect(() => service.getCustomerOrders(1, 0, 0)).toThrowError(RangeError);
    expect(() => service.getCustomerOrders(1, 10, -1)).toThrowError(RangeError);
    http.expectNone((request) => request.url.endsWith('/customer_orders/get'));
  });

  it('loads return reasons using the all-reasons filters and maps IDs and labels', () => {
    let result: unknown;
    service.getReturnReasons().subscribe((reasons) => (result = reasons));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/api/return_reason/get' &&
        candidate.params.get('REASON_ID') === '-1' &&
        candidate.params.get('REASON') === '-1',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      success: true,
      message: 'Return reasons fetched successfully',
      data: [
        { REASON_ID: 20, REASON: 'Other' },
        { REASON_ID: 19, REASON: 'Product is unsuitable for my needs' },
      ],
    });

    expect(result).toEqual([
      { REASON_ID: 20, REASON: 'Other' },
      { REASON_ID: 19, REASON: 'Product is unsuitable for my needs' },
    ]);
  });

  it('loads order statuses with pagination when requested by the return listing', () => {
    let result: unknown;
    service.getOrderStatuses(10, 0).subscribe((options) => (result = options));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/api/all_status/get' &&
        candidate.params.get('ORDER_STATUS_ID') === '-1' &&
        candidate.params.get('LIMIT') === '10' &&
        candidate.params.get('OFFSET') === '0',
    );
    request.flush({
      success: true,
      data: [
        { ORDER_STATUS_ID: 24, ORDER_STATUS: 'PENDING' },
        { ORDER_STATUS_ID: 25, ORDER_STATUS: 'APPROVED' },
      ],
    });

    expect(result).toEqual([
      { id: 24, label: 'PENDING' },
      { id: 25, label: 'APPROVED' },
    ]);
  });

  it('loads return requests with all filters and safely maps nullable fields', () => {
    let result: unknown;
    service
      .getReturnRequests({
        DAYS: 30,
        RETURN_STATUS: 24,
        RETURN_REASON: -1,
        LIMIT: 10,
        OFFSET: 0,
      })
      .subscribe((page) => (result = page));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/api/return_request/get' &&
        candidate.params.get('DAYS') === '30' &&
        candidate.params.get('RETURN_STATUS') === '24' &&
        candidate.params.get('RETURN_REASON') === '-1' &&
        candidate.params.get('LIMIT') === '10' &&
        candidate.params.get('OFFSET') === '0',
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      success: true,
      message: 'Return requests fetched successfully',
      total_records: 2,
      data: [
        {
          RETURN_ID: 2,
          ORDER_ID: 7,
          ORDER_NUMBER: 'ORDF0F7C67DDF4611F197100AFFFC1C7849',
          PRODUCT_ID: 7,
          PRODUCT_NAME: 'Lenovo ThinkPad E14',
          QUANTITY: 2,
          RETURN_REASON: 'Product Damaged',
          RETURN_DESCRIPTION: 'Received damaged product',
          RETURN_IMAGES: 'return_image1.jpg',
          PICKUP_ADDRESS_ID: 1,
          ADDRESS: '13/5a, 2nd Street',
          SELLER_ID: null,
          CUSTOMER_ID: 1,
          CUSTOMER_NAME: 'Pooja Sree',
          CUSTOMER_MOBILE: null,
          VARIANT_ID: 3,
          RETURN_STATUS: 'PENDING',
          CREATED_AT: '2026-11-16T02:45:11.000Z',
        },
        {
          RETURN_ID: 3,
          ORDER_ID: null,
          ORDER_NUMBER: null,
          PRODUCT_ID: null,
          PRODUCT_NAME: null,
          QUANTITY: null,
          RETURN_REASON: null,
          RETURN_DESCRIPTION: null,
          RETURN_IMAGES: null,
          PICKUP_ADDRESS_ID: null,
          ADDRESS: null,
          SELLER_ID: null,
          CUSTOMER_ID: null,
          CUSTOMER_NAME: null,
          CUSTOMER_MOBILE: null,
          VARIANT_ID: null,
          RETURN_STATUS: null,
          CREATED_AT: null,
        },
      ],
    });

    expect(result).toEqual({
      totalRecords: 2,
      requests: [
        {
          returnId: 2,
          orderId: 7,
          orderNumber: 'ORDF0F7C67DDF4611F197100AFFFC1C7849',
          productId: 7,
          productName: 'Lenovo ThinkPad E14',
          quantity: 2,
          reason: 'Product Damaged',
          description: 'Received damaged product',
            images: ['/uploads/return_image1.jpg'],
          pickupAddressId: 1,
          address: '13/5a, 2nd Street',
          sellerId: null,
          customerId: 1,
          customerName: 'Pooja Sree',
          customerMobile: null,
          variantId: 3,
          status: 'PENDING',
          createdAt: '2026-11-16T02:45:11.000Z',
        },
        {
          returnId: 3,
          orderId: null,
          orderNumber: null,
          productId: null,
          productName: null,
          quantity: null,
          reason: null,
          description: null,
          images: [],
          pickupAddressId: null,
          address: null,
          sellerId: null,
          customerId: null,
          customerName: null,
          customerMobile: null,
          variantId: null,
          status: null,
          createdAt: null,
        },
      ],
    });
  });

  // CHANGED (new): Seller login sends only SELLER_ID and paging to the same endpoint.
  it('loads a seller\'s return requests with SELLER_ID, LIMIT and OFFSET only', () => {
    let result: { totalRecords: number; requests: { returnId: number; sellerId: number | null; status: string | null }[] } | undefined;
    service
      .getSellerReturnRequests({ SELLER_ID: 24, LIMIT: 10, OFFSET: 10 })
      .subscribe((page) => (result = page));

    const request = http.expectOne(
      (candidate) => candidate.url === 'https://api.example.test/api/return_request/get',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['LIMIT', 'OFFSET', 'SELLER_ID']);
    expect(request.request.params.get('SELLER_ID')).toBe('24');
    expect(request.request.params.get('LIMIT')).toBe('10');
    expect(request.request.params.get('OFFSET')).toBe('10');
    request.flush({
      success: true,
      message: 'Return requests fetched successfully',
      total_records: 2,
      data: [
        {
          RETURN_ID: 2,
          ORDER_ID: 7,
          ORDER_NUMBER: 'ORDF0F7C67DDF4611F197100AFFFC1C7849',
          PRODUCT_ID: 7,
          PRODUCT_NAME: 'Lenovo ThinkPad E14',
          QUANTITY: 2,
          RETURN_REASON: 'Product Damaged',
          RETURN_DESCRIPTION: 'Received damaged product',
          RETURN_IMAGES: 'return_image1.jpg',
          SELLER_ID: 1,
          CUSTOMER_ID: 1,
          CUSTOMER_NAME: 'pooja sree',
          RETURN_STATUS: 6,
          RETURN_STATUS_NAME: 'PENDING',
        },
      ],
    });

    expect(result?.totalRecords).toBe(2);
    expect(result?.requests).toHaveLength(1);
    expect(result?.requests[0]).toMatchObject({ returnId: 2, sellerId: 1, status: '6' });
  });

  it('rejects an invalid SELLER_ID or paging before requesting seller return requests', () => {
    expect(() => service.getSellerReturnRequests({ SELLER_ID: 0, LIMIT: 10, OFFSET: 0 })).toThrow(RangeError);
    expect(() => service.getSellerReturnRequests({ SELLER_ID: 24, LIMIT: 0, OFFSET: 0 })).toThrow(RangeError);
    expect(() => service.getSellerReturnRequests({ SELLER_ID: 24, LIMIT: 10, OFFSET: -1 })).toThrow(RangeError);
    http.expectNone((request) => request.url.endsWith('/return_request/get'));
  });

  it('updates return requests with the supplied approval or rejection status', () => {
    let approvalMessage: string | undefined;
    service
      .updateReturnRequestStatus({ RETURN_ID: 1, RETURN_STATUS: 'APPROVED' })
      .subscribe((message) => (approvalMessage = message));

    const approval = http.expectOne('https://api.example.test/api/return_request/update');
    expect(approval.request.method).toBe('PUT');
    expect(approval.request.body).toEqual({ RETURN_ID: 1, RETURN_STATUS: 'APPROVED' });
    approval.flush({ success: true, message: 'Return request approved.' });
    expect(approvalMessage).toBe('Return request approved.');

    let rejectionMessage: string | undefined;
    service
      .updateReturnRequestStatus({ RETURN_ID: 7, RETURN_STATUS: 'REJECTED' })
      .subscribe((message) => (rejectionMessage = message));

    const rejection = http.expectOne('https://api.example.test/api/return_request/update');
    expect(rejection.request.method).toBe('PUT');
    expect(rejection.request.body).toEqual({ RETURN_ID: 7, RETURN_STATUS: 'REJECTED' });
    rejection.flush({ success: true, message: 'Return request rejected.' });
    expect(rejectionMessage).toBe('Return request rejected.');
  });

  it('surfaces unsuccessful return request update responses and rejects invalid IDs', () => {
    let error: unknown;
    service
      .updateReturnRequestStatus({ RETURN_ID: 1, RETURN_STATUS: 'REJECTED' })
      .subscribe({ error: (caught: unknown) => (error = caught) });
    http
      .expectOne('https://api.example.test/api/return_request/update')
      .flush({ success: false, message: 'The return request could not be rejected.' });

    expect(error).toEqual(new Error('The return request could not be rejected.'));
    expect(() =>
      service.updateReturnRequestStatus({ RETURN_ID: 0, RETURN_STATUS: 'APPROVED' }),
    ).toThrowError(RangeError);
    http.expectNone((request) => request.url.endsWith('/return_request/update'));
  });

    it('resolves return image file names to upload URLs', () => {
    let result: { requests: { images: string[] }[] } | undefined;
    service
      .getReturnRequests({ DAYS: 30, RETURN_STATUS: -1, RETURN_REASON: -1, LIMIT: 10, OFFSET: 0 })
      .subscribe((page) => (result = page));

    http
      .expectOne((candidate) => candidate.url === 'https://api.example.test/api/return_request/get')
      .flush({
        success: true,
        total_records: 1,
        data: [
          {
            RETURN_ID: 4,
            RETURN_IMAGES: 'a.jpg, uploads/returns/b.png,,https://cdn.example.test/c.jpg',
          },
        ],
      });

    expect(result?.requests[0].images).toEqual([
      '/uploads/a.jpg',
      '/uploads/returns/b.png',
      'https://cdn.example.test/c.jpg',
    ]);
  });

  it('rejects invalid return request query filters before making a request', () => {
    expect(() =>
      service.getReturnRequests({
        DAYS: 0,
        RETURN_STATUS: 24,
        RETURN_REASON: -1,
        LIMIT: 10,
        OFFSET: 0,
      }),
    ).toThrowError(RangeError);
    expect(() =>
      service.getReturnRequests({
        DAYS: 30,
        RETURN_STATUS: 0,
        RETURN_REASON: -1,
        LIMIT: 10,
        OFFSET: 0,
      }),
    ).toThrowError(RangeError);
    expect(() =>
      service.getReturnRequests({
        DAYS: 30,
        RETURN_STATUS: 24,
        RETURN_REASON: -1,
        LIMIT: 10,
        OFFSET: -1,
      }),
    ).toThrowError(RangeError);
    http.expectNone((request) => request.url.endsWith('/return_request/get'));
  });

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
