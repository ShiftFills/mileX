import { formatDate } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { ReturnRequestsPage, ShipmentTracking } from '@shared/models';
import {
  OrderService,
  SHIPMENT_STEPS,
  ShipmentClosure,
  mapShipmentTracking,
  parseDeliveryAddress,
  shipmentClosure,
  shipmentStage,
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
      // CHANGED: with the row's own IDs (a return request sends them): ORDER_ID, PRODUCT_ID, SHIPPING_ID and
      // DELIVERY_ADDRESS_ID.
      items: [{
        orderId: 33, productId: 17, shippingId: 1, deliveryAddressId: 1,
        name: 'Wireless Mosue', sku: 'SKU0017', quantity: 4, price: 56666, tone: 'accent',
      }],
      address: {
        name: 'pooja',
        phone: '9876543210',
        lines: ['13/5a, 2nd Street, Near Bus Stand', 'Chennai, Tamil Nadu, India, 600040'],
        city: 'Chennai',
      },
      // TOTAL_AMOUNT − (SUBTOTAL + TAX − DISCOUNT) = 50 is the shipping.
      totals: { subtotal: 226664, discount: 0, tax: 0, shipping: 50, total: 226714 },
    });
    // CHANGED (new): this sample row has no PRODUCT_VARIANT_ID or SELLER_ID.
    expect(shipment.items[0].variantId).toBeUndefined();
    expect(shipment.items[0].sellerId).toBeUndefined();
    // Nothing the API does not send.
    expect(shipment.currentLocation).toBeUndefined();
    expect(shipment.distanceKm).toBeUndefined();
    expect(shipment.route).toBeUndefined();
    expect(shipment.payment).toBeUndefined();
  });

  // CHANGED (new): each product keeps its own row's IDs (the documented tracking row has PRODUCT_VARIANT_ID and
  // SELLER_ID), so a return request never mixes the IDs of two products.
  it('keeps each row\'s own IDs on its item (a null PRODUCT_VARIANT_ID: ordered without a variant)', () => {
    const shipment = mapShipmentTracking([
      trackingRow({ PRODUCT_VARIANT_ID: 13, SELLER_ID: 24 }),
      trackingRow({
        ORDER_ID: 30, PRODUCT_ID: 16, PRODUCT_VARIANT_ID: 25, SELLER_ID: 49, SHIPPING_ID: 5, DELIVERY_ADDRESS_ID: 10,
      }),
      trackingRow({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: null, SELLER_ID: '25' }),
      trackingRow({ PRODUCT_ID: 19, PRODUCT_VARIANT_ID: 'n/a', SELLER_ID: 0, SHIPPING_ID: null }),
    ], 'ORD0016') as ShipmentTracking;

    expect(shipment.items.map(({ orderId, productId, variantId, sellerId, shippingId, deliveryAddressId }) => ({
      orderId, productId, variantId, sellerId, shippingId, deliveryAddressId,
    }))).toEqual([
      { orderId: 33, productId: 17, variantId: 13, sellerId: 24, shippingId: 1, deliveryAddressId: 1 },
      { orderId: 30, productId: 16, variantId: 25, sellerId: 49, shippingId: 5, deliveryAddressId: 10 },
      { orderId: 33, productId: 18, variantId: null, sellerId: 25, shippingId: 1, deliveryAddressId: 1 },
      { orderId: 33, productId: 19, variantId: undefined, sellerId: undefined, shippingId: undefined, deliveryAddressId: 1 },
    ]);
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

    // CHANGED: ORDER_SHIPPING_STATUS_NAME first (the list's name for the ID used to win).
    it('reads the current status from ORDER_SHIPPING_STATUS_NAME, and from the list by ID only without a name', () => {
      // ID 4 is DELIVERED in the list, but the API's name says IN TRANSIT: the name decides.
      expect(shipmentSteps({ ...source, shippingStatusId: 4, shippingStatus: 'IN TRANSIT' }, SHIPPING_STATUSES).currentStep).toBe(3);
      expect(shipmentSteps({ ...source, shippingStatusId: 3, shippingStatus: 'SHIPPED' }, SHIPPING_STATUSES).currentStep).toBe(2);
      // No name sent: the list's name for the ID.
      expect(shipmentSteps({ ...source, shippingStatusId: 1, shippingStatus: '' }, SHIPPING_STATUSES).currentStep).toBe(2);
      expect(shipmentSteps({ ...source, shippingStatusId: 2, shippingStatus: undefined }, SHIPPING_STATUSES).currentStep).toBe(0);
      expect(shipmentSteps({ ...source, shippingStatusId: 99, shippingStatus: 'NOT SHIPPED' }, SHIPPING_STATUSES).currentStep).toBe(0);
    });

    // CHANGED (new): Delivered is a completed step (it was shown as the current one).
    it('completes every step once delivered', () => {
      const delivered = shipmentSteps({ ...source, shippingStatusId: 4, shippingStatus: 'DELIVERED' }, SHIPPING_STATUSES);
      expect(delivered.currentStep).toBe(SHIPMENT_STEPS.length);
      // No "Pending Arrival" any more.
      expect(delivered.steps.at(-1)).toEqual({ label: 'Delivered', caption: '' });
    });

    it('puts each status on the last step at or before its stage', () => {
      const current = (shippingStatus: string): number =>
        shipmentSteps({ placedOn: source.placedOn, estimatedDelivery: null, shippingStatus }, null).currentStep;
      expect(current('Processing')).toBe(1);
      expect(current('SHIPPED')).toBe(2);
      // Out for delivery has no step of its own: it is shown on In Transit.
      expect(current('Out for delivery')).toBe(3);
      // CHANGED: every step completed (it was 4, the Delivered step as the current one).
      expect(current('Delivered')).toBe(5);
      expect(current('Something new')).toBe(0);
    });

    // CHANGED (new): one rule for the statuses that take a shipment off the delivery path.
    it('tells how a shipping status ended the delivery, and nothing for one on the delivery path', () => {
      const cases: [string, ShipmentClosure | null][] = [
        ['CANCELLED', 'cancelled'], ['Cancelled by customer', 'cancelled'],
        ['RETURNED', 'returned'], ['RETURN/REFUND', 'returned'], ['RETURN/REPLACE', 'returned'], ['RTO', 'returned'],
        ['FAILED', 'failed'], ['Delivery failed', 'failed'], ['LOST', 'failed'], ['UNDELIVERED', 'failed'],
        ['NOT SHIPPED', null], ['SHIPPED', null], ['IN TRANSIT', null], ['Out for delivery', null], ['DELIVERED', null],
        ['ON SCHEDULE', null],
      ];
      for (const [status, closure] of cases) {
        expect(shipmentClosure(status), status).toBe(closure);
        // Off the path, there is no step to show.
        if (closure) expect(shipmentStage(status), status).toBeNull();
      }
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
      // CHANGED: the status comes from ORDER_SHIPPING_STATUS_NAME; delivered completes all five steps.
      trackingRequest(0).flush({
        success: true, count: 1, data: [trackingRow({ ORDER_SHIPPING_STATUS_ID: 4, ORDER_SHIPPING_STATUS_NAME: 'DELIVERED' })],
      });
      http.expectNone((request) => request.url.endsWith('/shipping_status/get'));

      expect(results.map((shipment) => shipment?.currentStep)).toEqual([3, 3, 5]);
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

  // CHANGED (new): the Cancel / Return Item dialog's Return Type and request.
  describe('return requests', () => {
    const SHIPPING_STATUSES_URL = 'https://api.example.test/api/shipping_status/get';
    const RETURN_REQUEST_URL = 'https://api.example.test/api/return_request';

    // CHANGED: the return types come from return_status, by RETURN_STATUS_ID (they were the RETURN/… shipping statuses).
    it('offers the RETURN/… return statuses as return types, by RETURN_STATUS_ID and RETURN_STATUS_NAME', () => {
      let types: unknown;
      service.getReturnTypes().subscribe((result) => (types = result));

      http
        .expectOne(
          (candidate) =>
            candidate.url === 'https://api.example.test/api/return_status' &&
            candidate.params.get('RETURN_STATUS_ID') === '-1' &&
            candidate.params.get('LIMIT') === '10' &&
            candidate.params.get('OFFSET') === '0',
        )
        .flush({
          STATUS: 'SUCCESS',
          MESSAGE: 'Return status retrieved successfully',
          DATA: [
            { RETURN_STATUS_ID: 1, RETURN_STATUS_NAME: 'RETURN/REPLACE', CREATED_AT: '2026-11-26T12:03:32.000Z' },
            { RETURN_STATUS_ID: 2, RETURN_STATUS_NAME: 'RETURN/REFUND', CREATED_AT: '2026-11-26T12:03:32.000Z' },
            // Not a return type the customer chooses.
            { RETURN_STATUS_ID: 6, RETURN_STATUS_NAME: 'PENDING', CREATED_AT: '2026-11-26T12:03:32.000Z' },
          ],
        });

      expect(types).toEqual([{ id: 1, label: 'RETURN/REPLACE' }, { id: 2, label: 'RETURN/REFUND' }]);
      http.expectNone(SHIPPING_STATUSES_URL);
    });

    /** The backend contract's sample body. */
    // CHANGED: with ORDER_ID and REFUND_METHOD.
    const VALID = {
      ORDER_NUMBER: 'ORD0014', ORDER_ID: 30, REASON_ID: 1, RETURN_DESCRIPTION: 'Product damaged', RETURN_OPTION: 2,
      PRODUCT_ID: 16, VARIANT_ID: 25, SELLER_ID: 49, PICKUP_ADDRESS_ID: 1, REFUND_METHOD: 3,
    };

    // CHANGED: the backend contract's full body, with ORDER_ID and REFUND_METHOD.
    it('POSTs the full return request body (trimmed) and maps the created request', () => {
      let result: unknown;
      service
        .createReturnRequest({ ...VALID, ORDER_NUMBER: ' ORD0014 ', RETURN_DESCRIPTION: ' Product damaged ' })
        .subscribe((created) => (result = created));

      const request = http.expectOne(RETURN_REQUEST_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        ORDER_NUMBER: 'ORD0014', ORDER_ID: 30, REASON_ID: 1, RETURN_DESCRIPTION: 'Product damaged', RETURN_OPTION: 2,
        PRODUCT_ID: 16, VARIANT_ID: 25, SELLER_ID: 49, PICKUP_ADDRESS_ID: 1, REFUND_METHOD: 3,
      });
      request.flush({
        STATUS: 'SUCCESS', ORDER_NUMBER: 'ORD0001', RETURN_REASON_ID: 2, RETURN_REASON: 'Poor product quality',
        RETURN_REQUEST_COUNT: 1, RETURN_STATUS_ID: 6, RETURN_STATUS_NAME: 'PENDING',
      });

      expect(result).toEqual({
        orderNumber: 'ORD0001', reasonId: 2, reason: 'Poor product quality', requestCount: 1, statusId: 6,
        statusName: 'PENDING', message: 'Your return request has been submitted.',
      });
    });

    it('reports a failure the body sends, and the API message of an HTTP error', () => {
      const payload = { ...VALID, RETURN_DESCRIPTION: '' };
      let error: unknown;
      service.createReturnRequest(payload).subscribe({ error: (value: unknown) => (error = value) });
      http.expectOne(RETURN_REQUEST_URL).flush({ STATUS: 'FAILED', message: 'Order is not eligible for return' });
      expect(service.returnRequestErrorMessage(error)).toBe('Order is not eligible for return');

      service.createReturnRequest(payload).subscribe({ error: (value: unknown) => (error = value) });
      http.expectOne(RETURN_REQUEST_URL).flush({ message: 'Access token is required' }, { status: 401, statusText: 'Unauthorized' });
      expect(service.returnRequestErrorMessage(error)).toBe('Access token is required');

      service.createReturnRequest(payload).subscribe({ error: (value: unknown) => (error = value) });
      http.expectOne(RETURN_REQUEST_URL).flush('', { status: 500, statusText: 'Server Error' });
      expect(service.returnRequestErrorMessage(error)).toBe(
        'The return request could not be submitted. Please try again. (HTTP 500)',
      );
    });

    // CHANGED: also REFUND_METHOD null (a replacement).
    it('sends VARIANT_ID null for a product ordered without a variant, and REFUND_METHOD null for a replacement', () => {
      service.createReturnRequest({ ...VALID, VARIANT_ID: null, REFUND_METHOD: null }).subscribe();
      const request = http.expectOne(RETURN_REQUEST_URL);
      expect(request.request.body).toMatchObject({ PRODUCT_ID: 16, VARIANT_ID: null, REFUND_METHOD: null });
      request.flush({ STATUS: 'SUCCESS' });
    });

    // CHANGED: also ORDER_ID and REFUND_METHOD.
    it('refuses a request with a missing ID or over-long details before sending it', () => {
      const messages: string[] = [];
      const collect = { error: (error: Error) => messages.push(error.message) };
      for (const invalid of [
        { ORDER_NUMBER: '  ' },
        { ORDER_ID: 0 },
        { PRODUCT_ID: 0 },
        { VARIANT_ID: -1 },
        { SELLER_ID: 0 },
        { PICKUP_ADDRESS_ID: 0 },
        { RETURN_OPTION: 0 },
        { REASON_ID: 0 },
        { REFUND_METHOD: 0 },
        { RETURN_DESCRIPTION: 'x'.repeat(501) },
      ]) {
        service.createReturnRequest({ ...VALID, ...invalid }).subscribe(collect);
      }

      expect(messages).toEqual([
        'Order number is required.',
        'The product to return could not be identified. Please refresh the page and try again.',
        'The product to return could not be identified. Please refresh the page and try again.',
        'The product to return could not be identified. Please refresh the page and try again.',
        'The seller of this product could not be found, so it cannot be returned here.',
        'The pickup address of this order could not be found, so it cannot be returned here.',
        'Select refund or replacement to continue.',
        'Select a reason to continue.',
        'Select a refund method to continue.',
        'Additional details must be 500 characters or fewer.',
      ]);
      http.expectNone(RETURN_REQUEST_URL);
    });

    // CHANGED (new): the Cancel / Return Item dialog's Product (return_dropdown).
    it('loads the order\'s products to return by ORDER_NUMBER, with each product\'s order line IDs', () => {
      let products: unknown;
      service.getReturnProducts(' ORD0014 ').subscribe((result) => (products = result));

      const request = http.expectOne(
        (candidate) =>
          candidate.url === 'https://api.example.test/api/return_dropdown' &&
          candidate.params.get('ORDER_NUMBER') === 'ORD0014' &&
          candidate.params.get('LIMIT') === '10' &&
          candidate.params.get('OFFSET') === '0',
      );
      request.flush({
        STATUS: 'SUCCESS',
        MESSAGE: 'Return request dropdown retrieved successfully',
        DATA: [
          { ORDER_ID: 30, ORDER_NUMBER: 'ORD0014', PRODUCT_ID: 16, PRODUCT_VARIANT_ID: 25, PRODUCT_NAME: 'Lenovo IdeaPad Slim 57' },
          { ORDER_ID: 29, ORDER_NUMBER: 'ORD0014', PRODUCT_ID: 19, PRODUCT_VARIANT_ID: 31, PRODUCT_NAME: 'Ear Buds' },
          { ORDER_ID: 28, ORDER_NUMBER: 'ORD0014', PRODUCT_ID: 20, PRODUCT_VARIANT_ID: null, PRODUCT_NAME: 'Charger' },
          // Left out: a repeated row, another order's row, and rows that cannot be identified.
          { ORDER_ID: 30, ORDER_NUMBER: 'ORD0014', PRODUCT_ID: 16, PRODUCT_VARIANT_ID: 25, PRODUCT_NAME: 'Lenovo IdeaPad Slim 57' },
          { ORDER_ID: 40, ORDER_NUMBER: 'ORD0099', PRODUCT_ID: 5, PRODUCT_VARIANT_ID: 2, PRODUCT_NAME: 'Other order' },
          { ORDER_NUMBER: 'ORD0014', PRODUCT_ID: 6, PRODUCT_VARIANT_ID: 2, PRODUCT_NAME: 'No order line' },
          { ORDER_ID: 41, ORDER_NUMBER: 'ORD0014', PRODUCT_ID: 7, PRODUCT_NAME: 'No variant field' },
        ],
      });

      expect(products).toEqual([
        { orderId: 30, orderNumber: 'ORD0014', productId: 16, variantId: 25, name: 'Lenovo IdeaPad Slim 57' },
        { orderId: 29, orderNumber: 'ORD0014', productId: 19, variantId: 31, name: 'Ear Buds' },
        { orderId: 28, orderNumber: 'ORD0014', productId: 20, variantId: null, name: 'Charger' },
      ]);
    });

    it('reports a failed products response and needs an order number', () => {
      let error: unknown;
      service.getReturnProducts('ORD0014').subscribe({ error: (value: unknown) => (error = value) });
      http
        .expectOne((candidate) => candidate.url.endsWith('/return_dropdown'))
        .flush({ STATUS: 'FAILED', MESSAGE: 'Order not found' });
      expect(error).toEqual(new Error('Order not found'));

      service.getReturnProducts('  ').subscribe({ error: (value: unknown) => (error = value) });
      expect(error).toEqual(new RangeError('Order number is required.'));
      http.expectNone((candidate) => candidate.url.endsWith('/return_dropdown'));
    });

    // CHANGED (new): the Cancel / Return Item dialog's Refund Method (refund_method).
    it('loads only the active refund methods, by REFUND_METHOD_ID and REFUND_METHOD_NAME', () => {
      let methods: unknown;
      service.getRefundMethods().subscribe((result) => (methods = result));

      http
        .expectOne(
          (candidate) =>
            candidate.url === 'https://api.example.test/api/refund_method' &&
            candidate.params.get('REFUND_METHOD_ID') === '-1' &&
            candidate.params.get('LIMIT') === '10' &&
            candidate.params.get('OFFSET') === '0',
        )
        .flush({
          STATUS: 'SUCCESS',
          MESSAGE: 'Refund methods fetched successfully',
          DATA: [
            { REFUND_METHOD_ID: 3, REFUND_METHOD_NAME: 'Wallet', IS_ACTIVE: 'ACTIVE' },
            { REFUND_METHOD_ID: 2, REFUND_METHOD_NAME: 'UPI', IS_ACTIVE: 'ACTIVE' },
            { REFUND_METHOD_ID: 1, REFUND_METHOD_NAME: 'Bank Transfer', IS_ACTIVE: 'INACTIVE' },
          ],
        });

      expect(methods).toEqual([{ id: 3, label: 'Wallet' }, { id: 2, label: 'UPI' }]);
    });
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
          // CHANGED (new): not sent by this response.
          statusId: null, reasonId: null, returnOptionId: null, returnOptionName: null, sellerName: null,
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
          statusId: null, reasonId: null, returnOptionId: null, returnOptionName: null, sellerName: null,
        },
      ],
    });
  });

  // CHANGED (new): the return_request APIs answer in upper case (STATUS, MESSAGE, …).
  it('reads an upper-case return requests envelope (STATUS, TOTAL_RECORDS, DATA)', () => {
    let result: { totalRecords: number; requests: { returnId: number }[] } | undefined;
    service
      .getReturnRequests({ DAYS: 7, RETURN_STATUS: -1, RETURN_REASON: -1, LIMIT: 10, OFFSET: 0 })
      .subscribe((page) => (result = page));
    http
      .expectOne((candidate) => candidate.url === 'https://api.example.test/api/return_request/get')
      .flush({ STATUS: 'SUCCESS', MESSAGE: 'Return requests fetched', TOTAL_RECORDS: '1', DATA: [{ RETURN_ID: 9 }] });

    expect(result?.totalRecords).toBe(1);
    expect(result?.requests.map((request) => request.returnId)).toEqual([9]);
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
    // CHANGED: the status name (RETURN_STATUS_NAME) with its ID (RETURN_STATUS); it was the ID '6' alone.
    expect(result?.requests[0]).toMatchObject({ returnId: 2, sellerId: 1, status: 'PENDING', statusId: 6 });
  });

  it('rejects an invalid SELLER_ID or paging before requesting seller return requests', () => {
    expect(() => service.getSellerReturnRequests({ SELLER_ID: 0, LIMIT: 10, OFFSET: 0 })).toThrow(RangeError);
    expect(() => service.getSellerReturnRequests({ SELLER_ID: 24, LIMIT: 0, OFFSET: 0 })).toThrow(RangeError);
    expect(() => service.getSellerReturnRequests({ SELLER_ID: 24, LIMIT: 10, OFFSET: -1 })).toThrow(RangeError);
    http.expectNone((request) => request.url.endsWith('/return_request/get'));
  });

  // CHANGED: Approve / Reject send { RETURN_ID, RETURN_STATUS, ACTION } with the current status ID and APPROVE /
  // REJECT (updateReturnRequestStatus, which sent RETURN_STATUS 'APPROVED' / 'REJECTED', is removed).
  it('reviews a return request with PUT { RETURN_ID, RETURN_STATUS, ACTION }', () => {
    let message: string | undefined;
    service
      .reviewReturnRequest({ RETURN_ID: 3, RETURN_STATUS: 6, ACTION: 'APPROVED' })
      .subscribe((result) => (message = result));

    const approval = http.expectOne('https://api.example.test/api/return_request/update');
    expect(approval.request.method).toBe('PUT');
    expect(approval.request.body).toEqual({ RETURN_ID: 3, RETURN_STATUS: 6, ACTION: 'APPROVED' });
    approval.flush({ STATUS: 'SUCCESS', MESSAGE: 'Return request approved' });
    expect(message).toBe('Return request approved');

    service
      .reviewReturnRequest({ RETURN_ID: 3, RETURN_STATUS: 6, ACTION: 'REJECTED' })
      .subscribe((result) => (message = result));
    const rejection = http.expectOne('https://api.example.test/api/return_request/update');
    expect(rejection.request.body).toEqual({ RETURN_ID: 3, RETURN_STATUS: 6, ACTION: 'REJECTED' });
    rejection.flush({ success: true });
    expect(message).toBe('Return request rejection completed successfully.');

    // CHANGED (new): a status-only update sends ACTION null.
    service
      .reviewReturnRequest({ RETURN_ID: 24, RETURN_STATUS: 9, ACTION: null })
      .subscribe((result) => (message = result));
    const statusOnly = http.expectOne('https://api.example.test/api/return_request/update');
    expect(statusOnly.request.body).toEqual({ RETURN_ID: 24, RETURN_STATUS: 9, ACTION: null });
    statusOnly.flush({ success: true });
    expect(message).toBe('Return request status update completed successfully.');
  });

  it('surfaces unsuccessful reviews and refuses an invalid ID or action without a request', () => {
    let error: unknown;
    service
      .reviewReturnRequest({ RETURN_ID: 1, RETURN_STATUS: 6, ACTION: 'REJECTED' })
      .subscribe({ error: (caught: unknown) => (error = caught) });
    http
      .expectOne('https://api.example.test/api/return_request/update')
      .flush({ STATUS: 'ERROR', MESSAGE: 'Return request is not pending' });
    expect(error).toEqual(new Error('Return request is not pending'));

    service
      .reviewReturnRequest({ RETURN_ID: 1, RETURN_STATUS: 6, ACTION: 'APPROVED' })
      .subscribe({ error: (caught: unknown) => (error = caught) });
    http.expectOne('https://api.example.test/api/return_request/update').flush('', { status: 500, statusText: 'Server Error' });
    expect(service.returnReviewErrorMessage(error, 'APPROVED')).toBe('Return request approval failed. (HTTP 500)');
    // CHANGED (new)
    expect(service.returnReviewErrorMessage(error, null)).toBe('Return request status update failed. (HTTP 500)');

    const errors: unknown[] = [];
    const collect = { error: (caught: unknown) => errors.push(caught) };
    service.reviewReturnRequest({ RETURN_ID: 0, RETURN_STATUS: 6, ACTION: 'APPROVED' }).subscribe(collect);
    service.reviewReturnRequest({ RETURN_ID: 1, RETURN_STATUS: -1, ACTION: 'APPROVED' }).subscribe(collect);
    service
      .reviewReturnRequest({ RETURN_ID: 1, RETURN_STATUS: 6, ACTION: 'PENDING' as 'APPROVED' })
      .subscribe(collect);
    expect(errors.map((caught) => (caught as Error).message)).toEqual([
      'Return ID must be a positive safe integer.',
      'Return status must be a positive status ID.',
      'Action must be APPROVED, REJECTED or null.',
    ]);
    http.expectNone((request) => request.url.endsWith('/return_request/update'));
  });

  // CHANGED (new): the Admin screen's IDs, when the API sends them.
  it('maps the return status, reason and return option IDs and the seller name of a request', () => {
    let result: ReturnRequestsPage | undefined;
    service
      .getReturnRequests({ DAYS: 30, RETURN_STATUS: -1, RETURN_REASON: -1, LIMIT: 10, OFFSET: 0 })
      .subscribe((page) => (result = page));
    http.expectOne((candidate) => candidate.url === 'https://api.example.test/api/return_request/get').flush({
      STATUS: 'SUCCESS',
      TOTAL_RECORDS: 3,
      DATA: [
        {
          RETURN_ID: 3, RETURN_STATUS_ID: 6, RETURN_STATUS_NAME: 'PENDING', RETURN_STATUS: 6, RETURN_REASON_ID: 2,
          RETURN_REASON: 'Poor product quality', RETURN_OPTION: 27, RETURN_OPTION_NAME: 'RETURN/REPLACE', SELLER_ID: 49,
          SELLER_NAME: 'Lenovo Store',
        },
        { RETURN_ID: 4, RETURN_STATUS: '25', REASON_ID: '19', RETURN_OPTION: '28', BUSINESS_NAME: 'Acme Traders' },
        { RETURN_ID: 5, RETURN_STATUS: 'APPROVED' },
      ],
    });

    const ids = result?.requests.map(({ returnId, status, statusId, reasonId, returnOptionId, returnOptionName, sellerName }) => ({
      returnId, status, statusId, reasonId, returnOptionId, returnOptionName, sellerName,
    }));
    expect(ids).toEqual([
      {
        returnId: 3, status: 'PENDING', statusId: 6, reasonId: 2, returnOptionId: 27, returnOptionName: 'RETURN/REPLACE',
        sellerName: 'Lenovo Store',
      },
      { returnId: 4, status: '25', statusId: 25, reasonId: 19, returnOptionId: 28, returnOptionName: null, sellerName: 'Acme Traders' },
      { returnId: 5, status: 'APPROVED', statusId: null, reasonId: null, returnOptionId: null, returnOptionName: null, sellerName: null },
    ]);
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

  // CHANGED (new): the Return Request Review's Return status options.
  it('loads the return statuses with RETURN_STATUS_ID=-1 and paging, by RETURN_STATUS_ID and RETURN_STATUS_NAME', () => {
    let returnStatuses: unknown;
    service.getReturnStatuses().subscribe((options) => (returnStatuses = options));

    http
      .expectOne(
        (request) =>
          request.url === 'https://api.example.test/api/return_status' &&
          request.params.get('RETURN_STATUS_ID') === '-1' &&
          request.params.get('LIMIT') === '10' &&
          request.params.get('OFFSET') === '0',
      )
      .flush({
        STATUS: 'SUCCESS',
        MESSAGE: 'Return status retrieved successfully',
        DATA: [
          { RETURN_STATUS_ID: 1, RETURN_STATUS_NAME: 'RETURN/REPLACE', CREATED_AT: '2026-11-26T12:03:32.000Z' },
          { RETURN_STATUS_ID: 2, RETURN_STATUS_NAME: 'RETURN/REFUND', CREATED_AT: '2026-11-26T12:03:32.000Z' },
        ],
      });

    expect(returnStatuses).toEqual([
      { id: 1, label: 'RETURN/REPLACE' },
      { id: 2, label: 'RETURN/REFUND' },
    ]);
  });

  it('reports a failed return status response, and refuses invalid paging without a request', () => {
    let error: unknown;
    service.getReturnStatuses().subscribe({ error: (result: unknown) => (error = result) });
    http
      .expectOne((request) => request.url.endsWith('/return_status'))
      .flush({ STATUS: 'FAILED', MESSAGE: 'Return statuses unavailable.' });
    expect(error).toEqual(new Error('Return statuses unavailable.'));

    expect(() => service.getReturnStatuses(0, 0)).toThrow('Return status page size must be a positive safe integer.');
    http.expectNone((request) => request.url.endsWith('/return_status'));
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
