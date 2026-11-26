import { formatDate } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { ShipmentTracking } from '@shared/models';
import {
  OrderService,
  SHIPMENT_STEPS,
  mapShipmentTracking,
  parseDeliveryAddress,
  shipmentSteps,
  validIsoDate,
} from './order.service';

// CHANGED (new): the tracking API sample row (GET tracking?ORDER_NUMBER=ORD0016&LIMIT=10&OFFSET=0).
function trackingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ORDER_ID: 33, ORDER_NUMBER: 'ORD0016', ORDER_DATE: '2026-11-25T06:56:08.000Z',
    ORDER_STATUS_ID: 7, ORDER_STATUS_NAME: 'APPROVED', ORDER_SHIPPING_STATUS_ID: 3, ORDER_SHIPPING_STATUS_NAME: 'IN TRANSIT',
    PRODUCT_ID: 17, PRODUCT_NAME: 'Wireless Mosue', SKU: 'SKU0017', QUANTITY: 4, PRICE: '56666.00',
    SUBTOTAL: '226664.00', DISCOUNT: '0.00', TAX: '0.00', TOTAL_AMOUNT: '226714.00', DELIVERY_ADDRESS_ID: 1,
    DELIVERY_ADDRESS: 'pooja, 9876543210, 13/5a, 2nd Street, Near Bus Stand, Chennai, Tamil Nadu, India, 600040',
    SHIPPING_ID: 1, SHIPMENT_NUMBER: 'SHP001', SHIPPING_PROVIDER_ID: 1, SHIPPING_PROVIDER_NAME: 'BlueDart',
    TRACKING_NUMBER: 'TRK001', SHIPPING_DATE: '2026-11-26T18:30:00.000Z', EXPECTED_DELIVERY_DATE: '2026-11-31',
    STATUS: 'On schedule',
    ...overrides,
  };
}

/** shipping_status/get rows, in the order the API sends them (IDs are not in delivery order). */
const SHIPPING_STATUSES = [
  { id: 4, label: 'DELIVERED' },
  { id: 3, label: 'IN TRANSIT' },
  { id: 2, label: 'NOT SHIPPED' },
  { id: 1, label: 'SHIPPED' },
  { id: 5, label: 'RETURNED' },
];

// CHANGED: the design's caption format.
const dateTime = (value: string): string => formatDate(value, 'd MMM, hh:mm a', 'en-US');

describe('shipment tracking mapping', () => {
  it('maps one row: order, carrier, schedule, item, address and the API totals', () => {
    const shipment = mapShipmentTracking([trackingRow()], 'ORD0016') as ShipmentTracking;

    expect(shipment).toMatchObject({
      orderId: 'ORD0016',
      placedOn: '2026-11-25T06:56:08.000Z',
      orderStatus: 'APPROVED',
      shippingStatusId: 3,
      shippingStatus: 'IN TRANSIT',
      shipmentNumber: 'SHP001',
      shippedOn: '2026-11-26T18:30:00.000Z',
      carrier: { name: 'BlueDart', code: 'BLU', color: '#e63946', trackingNo: 'TRK001', siteUrl: 'https://www.bluedart.com/tracking' },
      scheduleStatus: 'On schedule',
      onSchedule: true,
      items: [{ name: 'Wireless Mosue', sku: 'SKU0017', quantity: 4, price: 56666, tone: 'accent' }],
      address: {
        name: 'pooja',
        phone: '9876543210',
        lines: ['13/5a, 2nd Street, Near Bus Stand', 'Chennai, Tamil Nadu, India, 600040'],
        city: 'Chennai',
      },
      // TOTAL_AMOUNT − (SUBTOTAL + TAX − DISCOUNT) = 50 is the shipping.
      totals: { subtotal: 226664, discount: 0, tax: 0, shipping: 50, total: 226714 },
    });
    // Nothing the API does not send.
    expect(shipment.currentLocation).toBeUndefined();
    expect(shipment.distanceKm).toBeUndefined();
    expect(shipment.route).toBeUndefined();
    expect(shipment.payment).toBeUndefined();
  });

  it('shows no expected delivery for the impossible EXPECTED_DELIVERY_DATE "2026-11-31"', () => {
    expect(mapShipmentTracking([trackingRow()])?.estimatedDelivery).toBeNull();
    expect(mapShipmentTracking([trackingRow({ EXPECTED_DELIVERY_DATE: '2026-11-30' })])?.estimatedDelivery).toBe('2026-11-30');

    expect(validIsoDate('2026-11-31')).toBe('');
    expect(validIsoDate('2026-02-29')).toBe('');
    expect(validIsoDate('2028-02-29')).toBe('2028-02-29');
    expect(validIsoDate('2026-11-26T18:30:00.000Z')).toBe('2026-11-26T18:30:00.000Z');
    expect(validIsoDate('30/11/2026')).toBe('');
    expect(validIsoDate(null)).toBe('');
  });

  it('makes one item per product row and adds up the amounts of each order record once', () => {
    const shipment = mapShipmentTracking([
      trackingRow(),
      trackingRow({
        ORDER_ID: 34, PRODUCT_ID: 18, PRODUCT_NAME: 'USB Cable', SKU: 'SKU0018', QUANTITY: 2, PRICE: '100.00',
        SUBTOTAL: '200.00', DISCOUNT: '20.00', TAX: '18.00', TOTAL_AMOUNT: '198.00',
      }),
      // Another row of order record 34 repeats its amounts: they are not added twice.
      trackingRow({ ORDER_ID: 34, PRODUCT_NAME: 'USB Cable (2)', SUBTOTAL: '200.00', DISCOUNT: '20.00', TAX: '18.00', TOTAL_AMOUNT: '198.00' }),
    ]) as ShipmentTracking;

    expect(shipment.items.map((item) => [item.name, item.tone])).toEqual([
      ['Wireless Mosue', 'accent'], ['USB Cable', 'neutral'], ['USB Cable (2)', 'neutral'],
    ]);
    expect(shipment.totals).toEqual({ subtotal: 226864, discount: 20, tax: 18, shipping: 50, total: 226912 });
  });

  it('copes with missing fields without inventing values', () => {
    const shipment = mapShipmentTracking(
      [{ ORDER_NUMBER: 'ORD0020', PRODUCT_ID: 9, QUANTITY: 'two', PRICE: null, ORDER_DATE: 'yesterday', STATUS: 'Delayed' }],
      'ORD0020',
    ) as ShipmentTracking;

    expect(shipment).toMatchObject({
      orderId: 'ORD0020',
      placedOn: '',
      estimatedDelivery: null,
      carrier: { name: '', code: '', trackingNo: '' },
      scheduleStatus: 'Delayed',
      onSchedule: false,
      items: [{ name: 'Product #9', sku: '', quantity: null, price: null }],
      address: { name: '', phone: '', lines: [] },
      totals: { subtotal: null, discount: null, tax: null, shipping: null, total: null },
    });
    expect(shipment.carrier.siteUrl).toBeUndefined();
    expect(shipment.shipmentNumber).toBeUndefined();
    expect(shipment.shippedOn).toBeUndefined();
    // An unknown carrier has no website.
    expect(mapShipmentTracking([trackingRow({ SHIPPING_PROVIDER_NAME: 'Local Courier' })])?.carrier.siteUrl).toBeUndefined();
    expect(mapShipmentTracking([trackingRow({ STATUS: 'Running late' })])?.onSchedule).toBe(false);
    expect(mapShipmentTracking([])).toBeNull();
  });

  // CHANGED (new): "On Schedule" / "Delayed" from EXPECTED_DELIVERY_DATE when the API sends no STATUS.
  it('works out the schedule state from the expected delivery date when the API sends no STATUS', () => {
    const today = new Date(2026, 10, 25);
    const schedule = (overrides: Record<string, unknown>, day = today) => {
      const shipment = mapShipmentTracking([trackingRow({ STATUS: null, ...overrides })], 'ORD0016', day);
      return [shipment?.scheduleStatus, shipment?.onSchedule];
    };

    expect(schedule({ EXPECTED_DELIVERY_DATE: '2026-11-30' })).toEqual(['On Schedule', true]);
    // Up to and including the expected day.
    expect(schedule({ EXPECTED_DELIVERY_DATE: '2026-11-30' }, new Date(2026, 10, 30, 23, 0))).toEqual(['On Schedule', true]);
    expect(schedule({ EXPECTED_DELIVERY_DATE: '2026-11-30' }, new Date(2026, 11, 1))).toEqual(['Delayed', false]);
    // Nothing to work it out from, or no schedule to keep.
    expect(schedule({ EXPECTED_DELIVERY_DATE: '2026-11-31' })[0]).toBe('');
    expect(schedule({ EXPECTED_DELIVERY_DATE: '2026-11-30', ORDER_SHIPPING_STATUS_NAME: 'DELIVERED' })[0]).toBe('');
    expect(schedule({ EXPECTED_DELIVERY_DATE: '2026-11-30', ORDER_STATUS_NAME: 'CANCELLED' })[0]).toBe('');
    // STATUS, when sent, is shown as it is.
    expect(mapShipmentTracking([trackingRow({ EXPECTED_DELIVERY_DATE: '2026-11-01' })], '', today)?.scheduleStatus).toBe('On schedule');
  });

  it('parses DELIVERY_ADDRESS as name, phone and address lines, or keeps it as one line', () => {
    expect(parseDeliveryAddress('pooja, 9876543210, 13/5a, 2nd Street, Chennai, 600040')).toEqual({
      name: 'pooja', phone: '9876543210', lines: ['13/5a, 2nd Street, Chennai, 600040'],
    });
    expect(parseDeliveryAddress('Asha K, +91 98765 43210, 4 Main Rd, Velachery, Chennai, Tamil Nadu, India, 600042')).toEqual({
      name: 'Asha K',
      phone: '+91 98765 43210',
      lines: ['4 Main Rd, Velachery', 'Chennai, Tamil Nadu, India, 600042'],
      // CHANGED (new): the city of a "city, state, country, PIN" address.
      city: 'Chennai',
    });
    expect(parseDeliveryAddress('pooja, 9876543210, Chennai, Tamil Nadu, India, 600040').city).toBe('Chennai');
    // Not "name, phone, address": shown as it is.
    expect(parseDeliveryAddress('13/5a 2nd Street Chennai 600040')).toEqual({
      name: '', phone: '', lines: ['13/5a 2nd Street Chennai 600040'],
    });
    expect(parseDeliveryAddress('pooja, Chennai, India')).toEqual({ name: '', phone: '', lines: ['pooja, Chennai, India'] });
    expect(parseDeliveryAddress(undefined)).toEqual({ name: '', phone: '', lines: [] });
  });

  // CHANGED: always the design's five steps, with "22 Sep, 10:30 AM"-style captions.
  describe('progress steps', () => {
    const source = {
      placedOn: '2026-11-25T06:56:08.000Z',
      // Local time, so the caption is the same in every time zone.
      shippedOn: '2026-11-26T15:45:00',
      estimatedDelivery: '2026-11-30',
      shippingStatusId: 3,
      shippingStatus: 'IN TRANSIT',
    };

    it('always shows the design\'s five steps, with the dates the API sends', () => {
      const { steps, currentStep } = shipmentSteps(source, SHIPPING_STATUSES);

      expect(steps).toEqual([
        { label: 'Order Placed', caption: dateTime(source.placedOn) },
        { label: 'Packed', caption: '' },
        { label: 'Shipped', caption: dateTime(source.shippedOn) },
        { label: 'In Transit', caption: '' },
        // The expected date is in the status card, not here.
        { label: 'Delivered', caption: 'Pending Arrival' },
      ]);
      expect(currentStep).toBe(3);
      expect(SHIPMENT_STEPS).toEqual(['Order Placed', 'Packed', 'Shipped', 'In Transit', 'Delivered']);
    });

    it('formats a date-time as "d MMM, hh:mm a" and a plain date as "d MMM"', () => {
      const { steps } = shipmentSteps({ ...source, placedOn: '2026-09-22T10:30:00', shippedOn: '2026-09-23' }, null);
      expect(steps[0].caption).toBe('22 Sep, 10:30 AM');
      expect(steps[2].caption).toBe('23 Sep');
      // A date sent as local midnight has no time of day to show.
      expect(shipmentSteps({ ...source, shippedOn: '2026-09-23T00:00:00' }, null).steps[2].caption).toBe('23 Sep');
    });

    it('finds the current status by ID in the shipping-status list, else by name', () => {
      // ID 4 is DELIVERED in the list, whatever the name says.
      const delivered = shipmentSteps({ ...source, shippingStatusId: 4, shippingStatus: 'IN TRANSIT' }, SHIPPING_STATUSES);
      expect(delivered.currentStep).toBe(4);
      // Delivered: no "Pending Arrival" any more.
      expect(delivered.steps.at(-1)).toEqual({ label: 'Delivered', caption: '' });
      expect(shipmentSteps({ ...source, shippingStatusId: 99, shippingStatus: 'Delivered' }, SHIPPING_STATUSES).currentStep).toBe(4);
      expect(shipmentSteps({ ...source, shippingStatusId: 2, shippingStatus: 'NOT SHIPPED' }, SHIPPING_STATUSES).currentStep).toBe(0);
    });

    it('puts each status on the last step at or before its stage', () => {
      const current = (shippingStatus: string): number =>
        shipmentSteps({ placedOn: source.placedOn, estimatedDelivery: null, shippingStatus }, null).currentStep;
      expect(current('Processing')).toBe(1);
      expect(current('SHIPPED')).toBe(2);
      // Out for delivery has no step of its own: it is shown on In Transit.
      expect(current('Out for delivery')).toBe(3);
      expect(current('Delivered')).toBe(4);
      expect(current('Something new')).toBe(0);
    });

    it('adds no caption the API has no date for', () => {
      expect(shipmentSteps({ placedOn: '', estimatedDelivery: null }, null)).toEqual({
        steps: SHIPMENT_STEPS.map((label, index) => ({
          label,
          caption: index === SHIPMENT_STEPS.length - 1 ? 'Pending Arrival' : '',
        })),
        currentStep: 0,
      });
    });
  });
});

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

  // CHANGED (new): GET tracking?ORDER_NUMBER=…&LIMIT=…&OFFSET=…, then the shipping-status list for the steps.
  describe('getShipmentTracking', () => {
    const TRACKING_URL = 'https://api.example.test/api/tracking';
    const trackingRequest = (offset: number) =>
      http.expectOne(
        (request) =>
          request.url === TRACKING_URL &&
          request.params.get('ORDER_NUMBER') === 'ORD0016' &&
          request.params.get('LIMIT') === '10' &&
          request.params.get('OFFSET') === String(offset),
      );
    const statusesRequest = () =>
      http.expectOne(
        (request) => request.url.endsWith('/shipping_status/get') && request.params.get('SHIPPING_STATUS_ID') === '-1',
      );
    const statusRows = SHIPPING_STATUSES.map(({ id, label }) => ({ SHIPPING_STATUS_ID: id, SHIPPING_STATUS: label }));

    it('sends ORDER_NUMBER, LIMIT and OFFSET, then builds the steps from the shipping statuses', () => {
      let result: ShipmentTracking | null | undefined;
      service.getShipmentTracking(' ORD0016 ').subscribe((shipment) => (result = shipment));

      const request = trackingRequest(0);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.keys()).toEqual(['ORDER_NUMBER', 'LIMIT', 'OFFSET']);
      request.flush({ success: true, message: 'Shipment tracking details fetched successfully', count: 1, data: [trackingRow()] });
      statusesRequest().flush({ status: 'SUCCESS', data: statusRows });

      expect(result?.carrier.trackingNo).toBe('TRK001');
      // CHANGED: the design's five steps; ID 3 is IN TRANSIT in the list.
      expect(result?.steps.map((step) => step.label)).toEqual([...SHIPMENT_STEPS]);
      expect(result?.currentStep).toBe(3);
    });

    it('reads the next pages while count is more than the rows received', () => {
      let result: ShipmentTracking | null | undefined;
      service.getShipmentTracking('ORD0016').subscribe((shipment) => (result = shipment));

      const firstPage = Array.from({ length: 10 }, (_, index) => trackingRow({ PRODUCT_NAME: `Product ${index + 1}` }));
      trackingRequest(0).flush({ success: true, count: 12, data: firstPage });
      trackingRequest(10).flush({
        success: true, count: 12, data: [trackingRow({ PRODUCT_NAME: 'Product 11' }), trackingRow({ PRODUCT_NAME: 'Product 12' })],
      });
      statusesRequest().flush({ status: 'SUCCESS', data: statusRows });

      expect(result?.items).toHaveLength(12);
      expect(result?.items.at(-1)?.name).toBe('Product 12');
    });

    it('returns null for an order without tracking rows, and leaves out rows of another order', () => {
      const results: (ShipmentTracking | null)[] = [];
      service.getShipmentTracking('ORD0016').subscribe((shipment) => results.push(shipment));
      trackingRequest(0).flush({ success: true, count: 0, data: [] });

      service.getShipmentTracking('ORD0016').subscribe((shipment) => results.push(shipment));
      trackingRequest(0).flush({ success: true, count: 1, data: [trackingRow({ ORDER_NUMBER: 'ORD0099' })] });

      expect(results).toEqual([null, null]);
      http.expectNone((request) => request.url.endsWith('/shipping_status/get'));
    });

    it('keeps the steps from the status name when the shipping statuses cannot be loaded', () => {
      let result: ShipmentTracking | null | undefined;
      service.getShipmentTracking('ORD0016').subscribe((shipment) => (result = shipment));
      trackingRequest(0).flush({ success: true, count: 1, data: [trackingRow()] });
      statusesRequest().flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

      expect(result?.steps.map((step) => step.label)).toEqual([...SHIPMENT_STEPS]);
      expect(result?.currentStep).toBe(3);
    });

    // CHANGED (new): loading the tracking again (the page's Refresh) does not load the shipping statuses again.
    it('loads the shipping statuses once for every tracking load, and again only after a failed load', () => {
      const results: (ShipmentTracking | null)[] = [];
      service.getShipmentTracking('ORD0016').subscribe((shipment) => results.push(shipment));
      trackingRequest(0).flush({ success: true, count: 1, data: [trackingRow()] });
      statusesRequest().flush({ message: 'Unavailable' }, { status: 503, statusText: 'Unavailable' });

      service.getShipmentTracking('ORD0016').subscribe((shipment) => results.push(shipment));
      trackingRequest(0).flush({ success: true, count: 1, data: [trackingRow()] });
      statusesRequest().flush({ status: 'SUCCESS', data: statusRows });

      service.getShipmentTracking('ORD0016').subscribe((shipment) => results.push(shipment));
      trackingRequest(0).flush({ success: true, count: 1, data: [trackingRow({ ORDER_SHIPPING_STATUS_ID: 4 })] });
      http.expectNone((request) => request.url.endsWith('/shipping_status/get'));

      expect(results.map((shipment) => shipment?.currentStep)).toEqual([3, 3, 4]);
    });

    it('reports a failed response and sends nothing without an order number', () => {
      let error: unknown;
      service.getShipmentTracking('ORD0016').subscribe({ error: (caught: unknown) => (error = caught) });
      trackingRequest(0).flush({ success: false, message: 'Order not found for this customer' });
      expect(error).toEqual(new Error('Order not found for this customer'));

      service.getShipmentTracking('  ').subscribe({ error: (caught: unknown) => (error = caught) });
      expect(error).toBeInstanceOf(RangeError);
      http.expectNone((request) => request.url === TRACKING_URL);
    });
  });

  // CHANGED (new): customer_orders/get does not send TRACKING_NUMBER today; a row that has one links to tracking.
  it('maps a customer order row\'s TRACKING_NUMBER to trackingNo when it is sent', () => {
    let orders: { trackingNo?: string }[] = [];
    service.getCustomerOrders(1, 10, 0).subscribe((page) => (orders = page.orders));
    const row = {
      ORDER_ID: 33, ORDER_NUMBER: 'ORD0016', CUSTOMER_ID: 1, PRODUCT_ID: 17, PRODUCT_VARIANT_ID: null, QUANTITY: 4,
      TOTAL_AMOUNT: '226714.00', ORDER_DATE: '2026-11-25T06:56:08.000Z', STATUS: 'SHIPPED',
    };
    http.expectOne((request) => request.url.endsWith('/customer_orders/get')).flush({
      success: true, total_records: 2, data: [{ ...row, TRACKING_NUMBER: 'TRK001' }, { ...row, ORDER_ID: 34 }],
    });

    expect(orders.map((order) => order.trackingNo)).toEqual(['TRK001', undefined]);
    expect('trackingNo' in orders[1]).toBe(false);
  });

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

  describe('getCustomerOrderDetail', () => {
    function row(orderId: number, orderNumber: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        ORDER_ID: orderId,
        ORDER_NUMBER: orderNumber,
        CUSTOMER_ID: 1,
        PRODUCT_ID: 1,
        PRODUCT_VARIANT_ID: null,
        QUANTITY: 1,
        SUBTOTAL: '2000.00',
        DISCOUNT: '0.00',
        TAX: '360.00',
        ORDER_DATE: '2026-11-16T01:59:01.000Z',
        SHIPPING_CHARGES: '0.00',
        TOTAL_AMOUNT: '2360.00',
        PAYMENT_METHOD: 2,
        STATUS: 'ORDERED',
        ...overrides,
      };
    }

    function expectPage(offset: number) {
      return http.expectOne(
        (request) =>
          request.url.endsWith('/customer_orders/get') &&
          request.params.get('LIMIT') === '50' &&
          request.params.get('OFFSET') === String(offset),
      );
    }

    it('collects every row of the order across a page boundary and maps the pricing fields', () => {
      let result: unknown;
      service.getCustomerOrderDetail(1, ' ORD0005 ').subscribe((detail) => (result = detail));

      // Page 1 ends with a row of the wanted order, so the next page is needed too.
      const firstPage = Array.from({ length: 49 }, (_, index) => row(100 - index, `ORD9${index}`));
      expectPage(0).flush({
        success: true,
        total_records: 120,
        data: [...firstPage, row(15, 'ORD0005', { PRODUCT_VARIANT_ID: 13 })],
      });
      // Page 2: the order's last row, then another order, so the lookup stops here.
      expectPage(50).flush({
        success: true,
        total_records: 120,
        data: [row(14, 'ORD0005', { PRODUCT_ID: 2, QUANTITY: 2, DISCOUNT: '100.00' }), row(13, 'ORD0004')],
      });
      http.expectNone((request) => request.params.get('OFFSET') === '52');

      expect(result).toEqual({
        orderNumber: 'ORD0005',
        lines: [
          {
            orderId: 15, orderNumber: 'ORD0005', productId: 1, productVariantId: 13, quantity: 1,
            subtotal: 2000, discount: 0, tax: 360, shippingCharges: 0, total: 2360,
            paymentMethodId: 2, orderDate: '2026-11-16T01:59:01.000Z', status: 'ORDERED',
          },
          {
            orderId: 14, orderNumber: 'ORD0005', productId: 2, productVariantId: null, quantity: 2,
            subtotal: 2000, discount: 100, tax: 360, shippingCharges: 0, total: 2360,
            paymentMethodId: 2, orderDate: '2026-11-16T01:59:01.000Z', status: 'ORDERED',
          },
        ],
      });
    });

    it('keeps missing amounts as null instead of zero', () => {
      let result: { lines: { subtotal: number | null; tax: number | null; paymentMethodId: number | null }[] } | null = null;
      service.getCustomerOrderDetail(1, 'ORD0005').subscribe((detail) => (result = detail));
      expectPage(0).flush({
        success: true,
        total_records: 1,
        data: [row(15, 'ORD0005', { SUBTOTAL: null, TAX: '', PAYMENT_METHOD: null })],
      });

      expect(result!.lines[0]).toEqual(expect.objectContaining({ subtotal: null, tax: null, paymentMethodId: null }));
    });

    it('accepts totals with paise and still rejects a missing total', () => {
      let result: { lines: { total: number }[] } | null = null;
      service.getCustomerOrderDetail(1, 'ORD0005').subscribe((detail) => (result = detail));
      expectPage(0).flush({ success: true, total_records: 1, data: [row(15, 'ORD0005', { TOTAL_AMOUNT: '4128.82' })] });
      expect(result!.lines[0].total).toBe(4128.82);

      let error: unknown;
      service.getCustomerOrders(1, 10, 0).subscribe({ error: (caught: unknown) => (error = caught) });
      http
        .expectOne((request) => request.url.endsWith('/customer_orders/get'))
        .flush({ success: true, total_records: 1, data: [row(15, 'ORD0005', { TOTAL_AMOUNT: null })] });
      expect(error).toEqual(new Error('The customer orders API returned an invalid total amount.'));
    });

    it('emits null after the last record when the customer has no such order', () => {
      let result: unknown = 'pending';
      service.getCustomerOrderDetail(1, 'ORD0099').subscribe((detail) => (result = detail));
      expectPage(0).flush({ success: true, total_records: 2, data: [row(15, 'ORD0005'), row(14, 'ORD0004')] });

      expect(result).toBeNull();
    });

    it('stops when the API ignores OFFSET and repeats the same rows', () => {
      let result: unknown = 'pending';
      service.getCustomerOrderDetail(1, 'ORD0099').subscribe((detail) => (result = detail));
      const page = Array.from({ length: 50 }, (_, index) => row(200 - index, `ORD1${index}`));
      expectPage(0).flush({ success: true, total_records: 500, data: page });
      expectPage(50).flush({ success: true, total_records: 500, data: page });
      http.expectNone((request) => request.params.get('OFFSET') === '100');

      expect(result).toBeNull();
    });

    it('rejects an empty order number before making a request', () => {
      expect(() => service.getCustomerOrderDetail(1, '  ')).toThrowError(RangeError);
      expect(() => service.getCustomerOrderDetail(0, 'ORD0005')).toThrowError(RangeError);
      http.expectNone((request) => request.url.endsWith('/customer_orders/get'));
    });
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

  // CHANGED: the Admin default is every order status (ORDER_STATUS=-1); it was 1.
  it('uses the required default filters (DAYS=7, -1 for every status) and maps the order response', () => {
    let result: unknown;
    service.getManagementOrders().subscribe((orders) => (result = orders));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://api.example.test/api/order_dashboard/get' &&
        candidate.params.get('DAYS') === '7' &&
        candidate.params.get('ORDER_STATUS') === '-1' &&
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
        // CHANGED: PRODUCT_NAME is mapped when present; the Admin response has none.
        productName: null,
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
        productName: null,
        quantity: null,
        amount: null,
        paymentStatusId: null,
        orderStatusId: null,
        shippingStatusId: null,
      },
    ]);
  });

  // CHANGED (new): PUT place_order/update.
  describe('updateOrderStatus', () => {
    const update = { ORDER_ID: 1, ORDER_STATUS: 5, PAYMENT_STATUS: 12, SHIPPING_STATUS: 7 };

    it('sends PUT place_order/update with the documented body and emits the API message', () => {
      let message: unknown;
      service.updateOrderStatus(update).subscribe((result) => (message = result));

      const request = http.expectOne('https://api.example.test/api/place_order/update');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ ORDER_ID: 1, ORDER_STATUS: 5, PAYMENT_STATUS: 12, SHIPPING_STATUS: 7 });
      request.flush({ status: true, message: 'Order updated successfully' });

      expect(message).toBe('Order updated successfully');
    });

    it('reports a 2xx response that says the update failed', () => {
      let error: unknown;
      service.updateOrderStatus(update).subscribe({ error: (caught: unknown) => (error = caught) });
      http.expectOne('https://api.example.test/api/place_order/update').flush({ status: false, message: 'Order not found' });

      expect(error).toEqual(new Error('Order not found'));
    });

    it('reads the message of a failed request', () => {
      let error: unknown;
      service.updateOrderStatus(update).subscribe({ error: (caught: unknown) => (error = caught) });
      http.expectOne('https://api.example.test/api/place_order/update').flush(
        { message: 'Invalid shipping status' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(service.orderUpdateErrorMessage(error)).toBe('Invalid shipping status');
      expect(service.orderUpdateErrorMessage(new Error(''))).toBe('The order could not be updated.');
    });

    it('rejects a missing order or status ID (including the -1 filter value) without a request', () => {
      const errors: unknown[] = [];
      for (const payload of [
        { ...update, ORDER_ID: 0 },
        { ...update, ORDER_STATUS: -1 },
        { ...update, PAYMENT_STATUS: 1.5 },
        { ...update, SHIPPING_STATUS: Number.NaN },
      ]) {
        service.updateOrderStatus(payload).subscribe({ error: (caught: unknown) => errors.push(caught) });
      }

      expect(errors).toHaveLength(4);
      expect(errors.every((error) => error instanceof RangeError)).toBe(true);
      http.expectNone('https://api.example.test/api/place_order/update');
    });
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

  // CHANGED (new): Seller login uses the same endpoint with SELLER_ID, SEARCH and paging.
  describe('for a Seller', () => {
    const sellerQuery = {
      SELLER_ID: 24,
      DAYS: 30,
      SEARCH: '',
      ORDER_STATUS: -1,
      PAYMENT_STATUS: -1,
      SHIPPING_STATUS: -1,
      LIMIT: 10,
      OFFSET: 0,
    };
    const sampleResponse = {
      status: 'SUCCESS',
      message: 'Order management dashboard fetched successfully',
      dashboard: {
        TOTAL_ORDERS: '2',
        TOTAL_REVENUE: '0.00',
        PENDING_ORDERS: '2',
        SHIPPED_ORDERS: '0',
        DELIVERED_ORDERS: '0',
      },
      total_records: 2,
      data: [
        {
          ORDER_ID: 17,
          ORDER_NUMBER: 'ORD0006',
          ORDER_DATE: '2026-11-16T06:50:51.000Z',
          SELLER_ID: 24,
          CUSTOMER_ID: 1,
          CUSTOMER_NAME: 'pooja sree',
          PRODUCT_ID: 1,
          PRODUCT_NAME: 'Head Settttt',
          QUANTITY: 1,
          ORDER_AMOUNT: '2000.00',
          PAYMENT_STATUS: 1,
          ORDER_STATUS: 1,
          SHIPPING_STATUS: 1,
        },
      ],
    };

    it('sends SELLER_ID, DAYS, SEARCH, the status filters and paging, and maps dashboard + data', () => {
      let result: unknown;
      service
        .getSellerManagementOrders({ ...sellerQuery, SEARCH: ' ORD0006 ', ORDER_STATUS: 2, OFFSET: 10 })
        .subscribe((page) => (result = page));

      const request = http.expectOne(
        (candidate) => candidate.url === 'https://api.example.test/api/order_dashboard/get',
      );
      expect(request.request.method).toBe('GET');
      expect(request.request.params.keys()).toEqual([
        'SELLER_ID', 'DAYS', 'SEARCH', 'ORDER_STATUS', 'PAYMENT_STATUS', 'SHIPPING_STATUS', 'LIMIT', 'OFFSET',
      ]);
      expect(request.request.urlWithParams).toContain(
        'SELLER_ID=24&DAYS=30&SEARCH=ORD0006&ORDER_STATUS=2&PAYMENT_STATUS=-1&SHIPPING_STATUS=-1&LIMIT=10&OFFSET=10',
      );
      request.flush(sampleResponse);

      expect(result).toEqual({
        totalRecords: 2,
        counts: { totalOrders: 2, totalRevenue: 0, pendingOrders: 2, shippedOrders: 0, deliveredOrders: 0 },
        orders: [
          {
            id: 17,
            orderNo: 'ORD0006',
            orderDate: '2026-11-16T06:50:51.000Z',
            customer: 'pooja sree',
            mobile: '—',
            productId: 1,
            productName: 'Head Settttt',
            quantity: 1,
            amount: 2000,
            paymentStatusId: 1,
            orderStatusId: 1,
            shippingStatusId: 1,
          },
        ],
      });
    });

    it('sends an empty SEARCH as in the documented request', () => {
      service.getSellerManagementOrders(sellerQuery).subscribe();

      const request = http.expectOne((candidate) => candidate.url.endsWith('/order_dashboard/get'));
      expect(request.request.urlWithParams).toContain(
        'SELLER_ID=24&DAYS=30&SEARCH=&ORDER_STATUS=-1&PAYMENT_STATUS=-1&SHIPPING_STATUS=-1&LIMIT=10&OFFSET=0',
      );
      request.flush(sampleResponse);
    });

    it('reads null dashboard totals as 0 when the seller has no orders in the range', () => {
      let result: { totalRecords: number; counts: unknown; orders: unknown[] } | undefined;
      service.getSellerManagementOrders(sellerQuery).subscribe((page) => (result = page));

      http.expectOne((candidate) => candidate.url.endsWith('/order_dashboard/get')).flush({
        status: 'SUCCESS',
        dashboard: { TOTAL_ORDERS: 0, TOTAL_REVENUE: null, PENDING_ORDERS: null, SHIPPED_ORDERS: null, DELIVERED_ORDERS: null },
        total_records: 0,
        data: [],
      });

      expect(result).toEqual({
        totalRecords: 0,
        counts: { totalOrders: 0, totalRevenue: 0, pendingOrders: 0, shippedOrders: 0, deliveredOrders: 0 },
        orders: [],
      });
    });

    it('reports unsuccessful responses, a missing dashboard and an invalid total_records', () => {
      const errors: unknown[] = [];
      const capture = { error: (error: unknown) => errors.push(error) };
      for (const body of [
        { status: 'FAILED', message: 'Seller orders are unavailable.' },
        { status: 'SUCCESS', total_records: 0, data: [] },
        { ...sampleResponse, total_records: 'many' },
      ]) {
        service.getSellerManagementOrders(sellerQuery).subscribe(capture);
        http.expectOne((candidate) => candidate.url.endsWith('/order_dashboard/get')).flush(body);
      }

      expect(errors).toEqual([
        new Error('Seller orders are unavailable.'),
        new Error('The order management API returned no usable dashboard data.'),
        new Error('The order management API returned an invalid total_records value.'),
      ]);
    });

    it('rejects an invalid SELLER_ID, filter or paging value before making a request', () => {
      expect(() => service.getSellerManagementOrders({ ...sellerQuery, SELLER_ID: 0 })).toThrow(
        'SELLER_ID must be a positive safe integer.',
      );
      expect(() => service.getSellerManagementOrders({ ...sellerQuery, DAYS: 0 })).toThrow(
        'The order date filter must be a positive number of days.',
      );
      expect(() => service.getSellerManagementOrders({ ...sellerQuery, PAYMENT_STATUS: 0 })).toThrow(
        'PAYMENT_STATUS must be -1 or a positive safe integer.',
      );
      expect(() => service.getSellerManagementOrders({ ...sellerQuery, LIMIT: 0 })).toThrow(
        'Order page size must be a positive safe integer.',
      );
      expect(() => service.getSellerManagementOrders({ ...sellerQuery, OFFSET: -1 })).toThrow(
        'Order page offset must be a non-negative safe integer.',
      );
      http.expectNone((request) => request.url.endsWith('/order_dashboard/get'));
    });
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
