import { formatDate } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@core/config/api.config';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { OrderDetail } from './order-detail';

const CUSTOMER_ID = 1;
const USER_ID = 3;
const TOKEN = `header.${btoa(JSON.stringify({ USER_ID, CUSTOMER_ID })).replace(/=/g, '')}.signature`;
const ORDERS_URL = '/api/customer_orders/get?LIMIT=50&OFFSET=0';
const PAYMENT_METHODS_URL = '/api/payment_method/get?PAYMENT_METHOD_ID=-1';
// CHANGED (new): the order's tracking rows, read only for the delivery address, and the shipping statuses that
// OrderService.getShipmentTracking reads with them.
const TRACKING_URL = '/api/tracking?ORDER_NUMBER=ORD0005&LIMIT=10&OFFSET=0';
const SHIPPING_STATUSES_URL = '/api/shipping_status/get?SHIPPING_STATUS_ID=-1';
const DELIVERY_ADDRESS = 'pooja, 9876543210, 13/5a, 2nd Street, Near Bus Stand, Chennai, Tamil Nadu, India, 600040';

/** How the tracking request (the delivery address) is answered. */
type TrackingReply = 'address' | 'none' | 'error';

function orderRow(orderId: number, orderNumber: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ORDER_ID: orderId,
    ORDER_NUMBER: orderNumber,
    CUSTOMER_ID,
    PRODUCT_ID: 1,
    PRODUCT_VARIANT_ID: 13,
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

function ordersResponse(data: Record<string, unknown>[], totalRecords = data.length): Record<string, unknown> {
  return { success: true, message: 'Customer orders fetched successfully', total_records: totalRecords, data };
}

function productResponse(id: number, name: string, image: string | null = null): Record<string, unknown> {
  return { success: true, data: [{ PRODUCT_ID: id, PRODUCT_NAME: name, PRODUCT_IMAGE: image }] };
}

function trackingResponse(data: Record<string, unknown>[]): Record<string, unknown> {
  return { success: true, message: 'Shipment tracking details fetched successfully', count: data.length, data };
}

const trackingRow = (): Record<string, unknown> => ({
  ORDER_ID: 15, ORDER_NUMBER: 'ORD0005', ORDER_DATE: '2026-11-16T01:59:01.000Z', PRODUCT_ID: 1, QUANTITY: 1,
  ORDER_SHIPPING_STATUS_ID: 3, ORDER_SHIPPING_STATUS_NAME: 'IN TRANSIT', DELIVERY_ADDRESS_ID: 1,
  DELIVERY_ADDRESS, TRACKING_NUMBER: 'TRK001', SHIPPING_PROVIDER_NAME: 'BlueDart',
});

describe('OrderDetail', () => {
  let fixture: ComponentFixture<OrderDetail>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const text = (element: Element | null | undefined): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const card = (titleId: string): HTMLElement | null => root.querySelector(`section[aria-labelledby="${titleId}"]`);
  /** label → value of a card's rows. */
  const fields = (titleId: string): Record<string, string> =>
    Object.fromEntries(
      Array.from(card(titleId)?.querySelectorAll('dl > div') ?? [], (row) => [text(row.querySelector('dt')), text(row.querySelector('dd'))]),
    );
  const tableRows = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('.od-products-table tbody tr'));
  const cells = (row: HTMLElement): string[] => Array.from(row.querySelectorAll('td'), (cell) => text(cell));

  function signIn(token = TOKEN): void {
    localStorage.clear();
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
      token,
    );
  }

  async function open(orderNumber: string): Promise<void> {
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrderDetail);
    fixture.componentRef.setInput('id', orderNumber);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** CHANGED (new): answers the tracking request (and, with rows, the shipping statuses read with it). */
  async function answerTracking(reply: TrackingReply): Promise<void> {
    const request = http.expectOne(TRACKING_URL);
    if (reply === 'error') {
      request.flush('down', { status: 500, statusText: 'Server Error' });
    } else {
      request.flush(trackingResponse(reply === 'address' ? [trackingRow()] : []));
      if (reply === 'address') http.expectOne(SHIPPING_STATUSES_URL).flush({ status: 'SUCCESS', data: [] });
    }
    await settle();
  }

  /**
   * Opens ORD0005 with the given rows and answers the product, variant, tracking and payment lookups.
   * CHANGED: `images` sets PRODUCT_IMAGE per product ID and VARIANT_IMAGE of variant 13; `tracking` answers the
   * delivery address request.
   */
  async function renderOrder(
    rows: Record<string, unknown>[],
    images: { products?: Record<number, string | null>; variant?: string | null } = {},
    tracking: TrackingReply = 'address',
  ): Promise<void> {
    const productImages = images.products ?? { 1: 'uploads/products/headset.png' };
    signIn();
    await open('ORD0005');
    http.expectOne(ORDERS_URL).flush(ordersResponse(rows));
    for (const request of http.match((candidate) => candidate.url.endsWith('/products/get'))) {
      const id = Number(request.request.params.get('PRODUCT_ID'));
      request.flush(productResponse(id, id === 1 ? 'Head Set' : 'Wireless Mouse', productImages[id] ?? null));
    }
    for (const request of http.match((candidate) => candidate.url.endsWith('/product_variant/get'))) {
      request.flush({
        status: 'SUCCESS',
        data: [{ VARIANT_ID: 13, VARIANT_NAME: 'Black M', PRODUCT_ID: 1, COLOUR_NAME: 'Black', SIZE_NAME: 'M', STATUS: 'ACTIVE', PRICE: '2000.00', STOCK_QUANTITY: 4, VARIANT_IMAGE: images.variant ?? null }],
      });
    }
    await settle();
    await answerTracking(tracking);
    http.match(PAYMENT_METHODS_URL).forEach((request) =>
      request.flush({ success: true, data: [{ PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: 'Cash on Delivery' }] }),
    );
    await settle();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderDetail],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        provideRouter([]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    http.verify();
    TestBed.inject(ToastService).dismiss();
  });

  // CHANGED (new)
  describe('S3 item images', () => {
    const PRODUCT_KEY = 'images/bc4be536708a4a133f9c18b99217ba51.png';
    const VARIANT_KEY = 'variants/0123456789abcdef0123456789abcdef.webp';
    const signed = (key: string): string => `https://milex.s3.amazonaws.com/${key}?X-Amz-Signature=abc`;
    const rows = (): Record<string, unknown>[] => [
      orderRow(15, 'ORD0005'),
      orderRow(14, 'ORD0005', { PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null }),
    ];

    it("shows the ordered variant's S3 image, else the product's, as signed URLs", async () => {
      await renderOrder(rows(), { products: { 1: 'products/866dea6fc30de9342300a6e901f8df6f.png', 2: PRODUCT_KEY }, variant: VARIANT_KEY });

      const requests = http.match((request) => request.url.startsWith('/api/s3/images/'));
      expect(requests.map((request) => request.request.url).sort())
        .toEqual([`/api/s3/images/${PRODUCT_KEY}`, `/api/s3/images/${VARIANT_KEY}`]);
      const items = tableRows();
      expect(items[0].querySelector('img')).toBeNull();
      expect(items[0].querySelector('.od-product__thumb')?.getAttribute('aria-busy')).toBe('true');
      expect(root.querySelector('img[src^="/products/"], img[src^="/images/"]')).toBeNull();

      for (const request of requests) {
        const key = request.request.url.replace('/api/s3/images/', '');
        request.flush({ success: true, imageKey: key, imageUrl: signed(key), expiresIn: 3600 });
      }
      await settle();
      expect(items[0].querySelector('img')?.getAttribute('src')).toBe(signed(VARIANT_KEY));
      expect(items[1].querySelector('img')?.getAttribute('src')).toBe(signed(PRODUCT_KEY));
    });

    it('shows the bag icon when the signed URL cannot be loaded', async () => {
      await renderOrder(rows(), { products: { 1: null, 2: PRODUCT_KEY } });
      http.expectOne(`/api/s3/images/${PRODUCT_KEY}`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      await settle();

      const thumb = tableRows()[1].querySelector('.od-product__thumb');
      expect(thumb?.querySelector('img')).toBeNull();
      expect(thumb?.querySelector('svg')).not.toBeNull();
      expect(thumb?.hasAttribute('aria-busy')).toBe(false);
    });
  });

  // CHANGED: the order page's sections (it was a summary, a progress tracker, an item list and price details).
  it('shows the order information, customer, payment, products, delivery address and summary from the APIs', async () => {
    await renderOrder([
      orderRow(15, 'ORD0005'),
      orderRow(14, 'ORD0005', {
        PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null, QUANTITY: 2, SUBTOTAL: '1000.00',
        DISCOUNT: '100.00', TAX: '180.00', TOTAL_AMOUNT: '1080.00',
      }),
      orderRow(13, 'ORD0004'),
    ]);

    expect(root.querySelector('h1')?.textContent).toContain('Order Details');
    expect(text(root.querySelector('app-page-heading p'))).toBe(
      `Order #ORD0005 · Placed on ${formatDate('2026-11-16T01:59:01.000Z', 'd MMM y', 'en-US')}`,
    );
    expect(root.querySelector('.order-detail__back')?.getAttribute('href')).toBe('/orders');
    expect(root.querySelector('.order-detail__help')?.getAttribute('href')).toBe('/help');

    expect(fields('info-title')).toEqual({
      'Order Number': '#ORD0005',
      'Order Date': formatDate('2026-11-16T01:59:01.000Z', 'd MMM y, h:mm a', 'en-US'),
      'Order Status': 'Ordered',
      'Total Items': '3 items',
    });
    // The recipient's name and phone from the delivery address (the login API sends no email).
    expect(fields('customer-title')).toEqual({ Name: 'pooja', Mobile: '9876543210' });
    expect(fields('payment-title')).toEqual({ 'Payment Method': 'Cash on Delivery', 'Total Amount': '₹3,440.00' });

    expect(Array.from(root.querySelectorAll('.od-products-table thead th'), (th) => text(th))).toEqual([
      'Product', 'Unit Price', 'Quantity', 'Amount',
    ]);
    const [first, second] = tableRows();
    expect(tableRows().length).toBe(2);
    expect(cells(first).slice(1)).toEqual(['₹2,000.00', '1', '₹2,000.00']);
    expect(text(first.querySelector('.od-product__name'))).toBe('Head Set');
    expect(text(first.querySelector('.od-product__variant'))).toBe('Black / M');
    expect(first.querySelector('.od-product__name')?.getAttribute('href')).toBe('/products/1');
    expect(first.querySelector('img')?.getAttribute('src')).toBe('/uploads/products/headset.png');
    // CHANGED: the product cell also has the product's "Refund status" link (see the refund link test).
    expect(cells(second).slice(1)).toEqual(['₹500.00', '2', '₹1,000.00']);
    expect(text(second.querySelector('.od-product__name'))).toBe('Wireless Mouse');
    expect(text(second.querySelector('.od-product__refund'))).toBe('Refund status');
    expect(second.querySelector('img')).toBeNull();
    // Every item has the same status, so it is shown once (Order Information), not per item.
    expect(root.querySelector('.od-product__status')).toBeNull();

    const address = card('address-title')?.querySelector('address');
    expect(Array.from(address?.children ?? [], (line) => text(line))).toEqual([
      'pooja', '13/5a, 2nd Street, Near Bus Stand', 'Chennai, Tamil Nadu, India, 600040', 'Phone: 9876543210',
    ]);

    const price = root.querySelector('.od-price')?.textContent ?? '';
    expect(price).toContain('Items Subtotal₹3,000.00');
    expect(price).toContain('Discount−₹100.00');
    expect(price).toContain('Tax₹540.00');
    expect(price).toContain('ShippingFree');
    expect(price).toContain('Order Total₹3,440.00');
  });

  // CHANGED (new): phones get a list of the same products instead of the table.
  it('lists the same products, with their prices, for phones', async () => {
    await renderOrder([
      orderRow(15, 'ORD0005'),
      orderRow(14, 'ORD0005', { PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null, QUANTITY: 2, SUBTOTAL: '1000.00' }),
    ]);

    expect(root.querySelector('.od-products-table')?.classList).toContain('d-md-block');
    const list = root.querySelector('.od-product-list');
    expect(list?.classList).toContain('d-md-none');
    const items = Array.from(list?.querySelectorAll('li') ?? []);
    expect(items.map((item) => text(item.querySelector('.od-product__name')))).toEqual(['Head Set', 'Wireless Mouse']);
    expect(
      Array.from(items[1].querySelectorAll('dl > div'), (row) => `${text(row.querySelector('dt'))}: ${text(row.querySelector('dd'))}`),
    ).toEqual(['Unit Price: ₹500.00', 'Quantity: 2', 'Amount: ₹1,000.00']);
  });

  // CHANGED (new): each product opens its own refunds: the order number and that product's ORDER_ID (order line).
  it("links each product to its refunds by the order number and the product's own ORDER_ID", async () => {
    await renderOrder([
      orderRow(15, 'ORD0005'),
      orderRow(14, 'ORD0005', { PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null }),
      orderRow(13, 'ORD0004'),
    ]);

    const links = (selector: string): (string | null)[] =>
      Array.from(root.querySelectorAll(`${selector} .od-product__refund`), (link) => link.getAttribute('href'));
    expect(links('.od-products-table')).toEqual(['/refund/ORD0005/15', '/refund/ORD0005/14']);
    expect(links('.od-product-list')).toEqual(['/refund/ORD0005/15', '/refund/ORD0005/14']);
    expect(root.querySelector('.od-products-table .od-product__refund')?.getAttribute('aria-label')).toBe(
      'Refund status of Head Set',
    );
  });

  // CHANGED: no tracking UI for any status (the progress tracker and Track Shipment are removed).
  for (const status of ['ORDERED', 'APPROVED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED']) {
    it(`shows no tracking timeline, steps or Track Shipment for a ${status} order`, async () => {
      await renderOrder([orderRow(15, 'ORD0005', { STATUS: status })]);

      expect(root.querySelector('app-stepper, .stepper, [aria-current="step"]')).toBeNull();
      expect(root.querySelector('a[href$="/tracking"]')).toBeNull();
      expect(root.textContent).not.toContain('Track');
      expect(root.textContent).not.toContain('Timeline');
    });
  }

  it('does not show charges or actions the API does not provide', async () => {
    await renderOrder([orderRow(15, 'ORD0005', { SUBTOTAL: null, TAX: null, SHIPPING_CHARGES: null })]);

    const price = root.querySelector('.od-price')?.textContent ?? '';
    expect(price).not.toContain('Items Subtotal');
    expect(price).not.toContain('Tax');
    expect(price).not.toContain('Shipping');
    expect(price).not.toContain('Discount');
    expect(price).toContain('Order Total₹2,360.00');
    // No SUBTOTAL: no unit price or amount for the item.
    expect(cells(tableRows()[0]).slice(1)).toEqual(['—', '1', '—']);
    expect(root.textContent).not.toContain('Invoice');
    expect(root.textContent).not.toContain('Cancel Order');
  });

  it('shows a note above the order for a cancelled order', async () => {
    await renderOrder([orderRow(15, 'ORD0005', { STATUS: 'CANCELLED' })]);

    expect(text(root.querySelector('.order-detail__content > app-alert'))).toBe('This order was cancelled.');
    expect(fields('info-title')['Order Status']).toBe('Cancelled');
  });

  it('shows each item status when the items of one order differ', async () => {
    await renderOrder([
      orderRow(15, 'ORD0005', { STATUS: 'SHIPPED' }),
      orderRow(14, 'ORD0005', { PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null, STATUS: 'IN_TRANSIT' }),
    ]);

    expect(fields('info-title')['Order Status']).toBe('Multiple statuses');
    expect(tableRows().map((row) => text(row.querySelector('.od-product__status')))).toEqual(['Shipped', 'In Transit']);
  });

  // CHANGED (new): the delivery address is optional; the rest of the page does not depend on it.
  it('says the delivery address is not available when the order has no tracking rows', async () => {
    await renderOrder([orderRow(15, 'ORD0005')], {}, 'none');

    expect(text(card('address-title')?.querySelector('.od-note'))).toBe('The delivery address is not available for this order.');
    expect(card('address-title')?.querySelector('.order-detail__retry')).toBeNull();
    // The account name stands in for the recipient; there is no phone.
    expect(fields('customer-title')).toEqual({ Name: 'customer', Mobile: 'Not available' });
    expect(tableRows().length).toBe(1);
  });

  it('offers Try again when the delivery address cannot be loaded, and shows it once it loads', async () => {
    await renderOrder([orderRow(15, 'ORD0005')], {}, 'error');

    expect(text(card('address-title'))).toContain('The delivery address is not available for this order.');
    expect(TestBed.inject(ToastService).current()).toBeFalsy();
    card('address-title')?.querySelector<HTMLButtonElement>('.order-detail__retry')?.click();
    await settle();
    expect(text(card('address-title')?.querySelector('[role="status"]'))).toBe('Loading the delivery address…');
    expect(fields('customer-title')['Mobile']).toBe('Loading…');
    await answerTracking('address');

    expect(text(card('address-title')?.querySelector('address strong'))).toBe('pooja');
    expect(fields('customer-title')['Mobile']).toBe('9876543210');
  });

  it('keeps an item with its product ID when the product lookup fails', async () => {
    signIn();
    await open('ORD0005');
    http.expectOne(ORDERS_URL).flush(ordersResponse([orderRow(15, 'ORD0005', { PRODUCT_VARIANT_ID: null })]));
    http.expectOne('/api/products/get?PRODUCT_ID=1').flush('down', { status: 500, statusText: 'Server Error' });
    await settle();
    await answerTracking('none');
    http.expectOne(PAYMENT_METHODS_URL).flush({ success: true, data: [] });
    await settle();

    expect(text(tableRows()[0].querySelector('.od-product__name'))).toBe('Product ID: 1');
    expect(root.querySelector('a.od-product__name')).toBeNull();
    expect(fields('payment-title')['Payment Method']).toBe('Not available');
    expect(TestBed.inject(ToastService).current()?.message).toBe(
      'Some product details could not be loaded. Order totals are still available.',
    );
  });

  it('shows the loader while the order is requested', async () => {
    signIn();
    await open('ORD0005');
    fixture.detectChanges();

    expect(root.querySelector('app-loading-spinner')).not.toBeNull();
    http.expectOne(ORDERS_URL).flush(ordersResponse([]));
    await settle();
  });

  it('shows a not-found state when the customer has no such order', async () => {
    signIn();
    await open('ORD0099');
    http.expectOne(ORDERS_URL).flush(ordersResponse([orderRow(15, 'ORD0005')]));
    await settle();

    expect(root.textContent).toContain("We couldn't find order #ORD0099");
    expect(root.querySelector('.order-detail__empty a')?.getAttribute('href')).toBe('/orders');
    expect(root.querySelector('.order-detail__help')).toBeNull();
  });

  it('shows the API error with a retry that loads the order again', async () => {
    signIn();
    await open('ORD0005');
    http.expectOne(ORDERS_URL).flush({ success: false, message: 'Orders are unavailable.', total_records: 0, data: [] });
    await settle();

    expect(root.querySelector('app-alert')?.textContent).toContain('Orders are unavailable.');
    expect(TestBed.inject(ToastService).current()?.message).toBe('Orders are unavailable.');

    root.querySelector<HTMLButtonElement>('.order-detail__retry')?.click();
    await settle();
    http.expectOne(ORDERS_URL).flush(ordersResponse([]));
    await settle();
    expect(root.textContent).toContain("We couldn't find order #ORD0005");
  });

  it('does not request the order without a customer session', async () => {
    signIn(`header.${btoa(JSON.stringify({ USER_ID })).replace(/=/g, '')}.signature`);
    await open('ORD0005');
    fixture.detectChanges();

    expect(root.textContent).toContain('Sign in with a customer account to view this order.');
    expect(root.querySelector('.order-detail__retry')).toBeNull();
    http.expectNone((request) => request.url.includes('customer_orders/get'));
  });
});
