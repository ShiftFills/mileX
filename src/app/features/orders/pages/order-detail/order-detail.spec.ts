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

describe('OrderDetail', () => {
  let fixture: ComponentFixture<OrderDetail>;
  let http: HttpTestingController;
  let root: HTMLElement;

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

  /**
   * Opens ORD0005 with the given rows and answers the product, variant and payment lookups.
   * CHANGED: `images` sets PRODUCT_IMAGE per product ID and VARIANT_IMAGE of variant 13.
   */
  async function renderOrder(
    rows: Record<string, unknown>[],
    images: { products?: Record<number, string | null>; variant?: string | null } = {},
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

      const requests = http.match((request) => request.url.startsWith('/s3-api/s3/images/'));
      expect(requests.map((request) => request.request.url).sort())
        .toEqual([`/s3-api/s3/images/${PRODUCT_KEY}`, `/s3-api/s3/images/${VARIANT_KEY}`]);
      const items = root.querySelectorAll('.od-item');
      expect(items[0].querySelector('img')).toBeNull();
      expect(items[0].querySelector('.od-item__thumb')?.getAttribute('aria-busy')).toBe('true');
      expect(root.querySelector('img[src^="/products/"], img[src^="/images/"]')).toBeNull();

      for (const request of requests) {
        const key = request.request.url.replace('/s3-api/s3/images/', '');
        request.flush({ success: true, imageKey: key, imageUrl: signed(key), expiresIn: 3600 });
      }
      await settle();
      expect(items[0].querySelector('img')?.getAttribute('src')).toBe(signed(VARIANT_KEY));
      expect(items[1].querySelector('img')?.getAttribute('src')).toBe(signed(PRODUCT_KEY));
    });

    it('shows the bag icon when the signed URL cannot be loaded', async () => {
      await renderOrder(rows(), { products: { 1: null, 2: PRODUCT_KEY } });
      http.expectOne(`/s3-api/s3/images/${PRODUCT_KEY}`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      await settle();

      const thumb = root.querySelectorAll('.od-item')[1].querySelector('.od-item__thumb');
      expect(thumb?.querySelector('img')).toBeNull();
      expect(thumb?.querySelector('svg')).not.toBeNull();
      expect(thumb?.hasAttribute('aria-busy')).toBe(false);
    });
  });

  it('shows the order summary, items, price breakdown and payment method from the APIs', async () => {
    await renderOrder([
      orderRow(15, 'ORD0005'),
      orderRow(14, 'ORD0005', {
        PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null, QUANTITY: 2, SUBTOTAL: '1000.00',
        DISCOUNT: '100.00', TAX: '180.00', TOTAL_AMOUNT: '1080.00',
      }),
      orderRow(13, 'ORD0004'),
    ]);

    expect(root.querySelector('h1')?.textContent).toContain('Order Details');
    expect(root.querySelector('.order-detail__back')?.getAttribute('href')).toBe('/orders');
    expect(root.querySelector('.od-summary__number')?.textContent).toBe('#ORD0005');
    expect(root.querySelector('.od-summary__status')?.textContent?.trim()).toBe('Ordered');
    const facts = root.querySelector('.od-summary__facts')?.textContent ?? '';
    expect(facts).toContain('3 items');
    expect(facts).toContain('Cash on Delivery');
    expect(facts).toContain('₹3,440.00');

    const items = root.querySelectorAll('.od-item');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.od-item__name')?.textContent).toContain('Head Set');
    expect(items[0].querySelector('.od-item__name')?.getAttribute('href')).toBe('/products/1');
    expect(items[0].querySelector('img')?.getAttribute('src')).toBe('/uploads/products/headset.png');
    expect(items[0].querySelector('.od-item__meta')?.textContent).toContain('Black / M');
    expect(items[0].querySelector('.od-item__price')?.textContent).toContain('₹2,000.00');
    expect(items[1].querySelector('.od-item__name')?.textContent).toContain('Wireless Mouse');
    expect(items[1].querySelector('.od-item__meta')?.textContent?.trim()).toBe('Qty: 2');
    expect(items[1].querySelector('img')).toBeNull();
    // Every item has the same status, so it is shown once (summary), not per item.
    expect(root.querySelector('.od-item__status')).toBeNull();

    const price = root.querySelector('.od-price')?.textContent ?? '';
    expect(price).toContain('Items Subtotal₹3,000.00');
    expect(price).toContain('Discount−₹100.00');
    expect(price).toContain('Tax₹540.00');
    expect(price).toContain('ShippingFree');
    expect(price).toContain('Order Total₹3,440.00');

    const current = root.querySelector('.od-progress [aria-current="step"]');
    expect(current?.textContent).toContain('Ordered');
    expect(current?.textContent).toContain(formatDate('2026-11-16T01:59:01.000Z', 'd MMM y', 'en-US'));
    expect(root.querySelector('.od-help a')?.getAttribute('href')).toBe('/help');
  });

  it('does not show charges or actions the API does not provide', async () => {
    await renderOrder([orderRow(15, 'ORD0005', { SUBTOTAL: null, TAX: null, SHIPPING_CHARGES: null })]);

    const price = root.querySelector('.od-price')?.textContent ?? '';
    expect(price).not.toContain('Items Subtotal');
    expect(price).not.toContain('Tax');
    expect(price).not.toContain('Shipping');
    expect(price).not.toContain('Discount');
    expect(price).toContain('Order Total₹2,360.00');
    expect(root.querySelector('.od-item__price')).toBeNull();
    expect(root.textContent).not.toContain('Invoice');
    expect(root.textContent).not.toContain('Cancel Order');
    expect(root.textContent).not.toContain('Tracking');
  });

  it('marks every stage done for a delivered order', async () => {
    await renderOrder([orderRow(15, 'ORD0005', { STATUS: 'DELIVERED' })]);

    expect(root.querySelector('.od-summary__status')?.textContent?.trim()).toBe('Delivered');
    expect(root.querySelectorAll('.od-progress .stepper__step.is-done').length).toBe(4);
    expect(root.querySelector('.od-progress [aria-current]')).toBeNull();
  });

  it('shows a note instead of the progress tracker for a cancelled order', async () => {
    await renderOrder([orderRow(15, 'ORD0005', { STATUS: 'CANCELLED' })]);

    expect(root.querySelector('app-stepper')).toBeNull();
    expect(root.textContent).toContain('This order was cancelled.');
  });

  it('shows each item status when the items of one order differ', async () => {
    await renderOrder([
      orderRow(15, 'ORD0005', { STATUS: 'SHIPPED' }),
      orderRow(14, 'ORD0005', { PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null, STATUS: 'IN_TRANSIT' }),
    ]);

    expect(root.querySelector('.od-summary__status')?.textContent?.trim()).toBe('Multiple statuses');
    expect(Array.from(root.querySelectorAll('.od-item__status')).map((badge) => badge.textContent?.trim())).toEqual([
      'Shipped',
      'In Transit',
    ]);
    expect(root.querySelector('app-stepper')).toBeNull();
  });

  it('keeps an item with its product ID when the product lookup fails', async () => {
    signIn();
    await open('ORD0005');
    http.expectOne(ORDERS_URL).flush(ordersResponse([orderRow(15, 'ORD0005', { PRODUCT_VARIANT_ID: null })]));
    http.expectOne('/api/products/get?PRODUCT_ID=1').flush('down', { status: 500, statusText: 'Server Error' });
    await settle();
    http.expectOne(PAYMENT_METHODS_URL).flush({ success: true, data: [] });
    await settle();

    expect(root.querySelector('.od-item__name')?.textContent).toContain('Product ID: 1');
    expect(root.querySelector('a.od-item__name')).toBeNull();
    expect(root.querySelector('.od-summary__facts')?.textContent).toContain('Not available');
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
