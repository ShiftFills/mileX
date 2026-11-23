import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@core/config/api.config';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { OrderList } from './order-list';

const CUSTOMER_ID = 1;
const USER_ID = 3;
const TOKEN = `header.${btoa(JSON.stringify({ USER_ID, CUSTOMER_ID })).replace(/=/g, '')}.signature`;

function orderRow(
  orderId = 15,
  orderNumber = 'ORD0005',
): Record<string, unknown> {
  return {
    ORDER_ID: orderId,
    ORDER_NUMBER: orderNumber,
    CUSTOMER_ID,
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
  };
}

function ordersResponse(
  totalRecords: number,
  data: Record<string, unknown>[] = [orderRow()],
): Record<string, unknown> {
  return { success: true, message: 'Customer orders fetched successfully', total_records: totalRecords, data };
}

describe('OrderList', () => {
  let fixture: ComponentFixture<OrderList>;
  let http: HttpTestingController;
  let root: HTMLElement;

  async function render(
    response: Record<string, unknown>,
    productResponse: Record<string, unknown> = {
      success: true,
      data: [{
        PRODUCT_ID: 1,
        PRODUCT_NAME: 'Head Settttt',
        PRODUCT_IMAGE: 'uploads/products/headset.png',
      }],
    },
  ): Promise<void> {
    localStorage.clear();
    const auth = TestBed.inject(AuthService);
    auth.setSession(
      { id: String(USER_ID), email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
      TOKEN,
    );
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrderList);

    const request = http.expectOne('/api/customer_orders/get?LIMIT=10&OFFSET=0');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    request.flush(response);

    if (Array.isArray(response['data']) && response['data'].length) {
      http.expectOne('/api/products/get?PRODUCT_ID=1').flush(productResponse);
    }

    await fixture.whenStable();
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderList],
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

  it('renders the existing order summary from API data without duplicate financial details', async () => {
    await render(ordersResponse(9));

    expect(root.querySelector('h1')?.textContent).toContain('My Orders');
    expect(root.querySelector('.my-order__id')?.textContent).toContain('#ORD0005');
    expect(root.querySelector('.my-order__items strong')?.textContent).toContain('Head Settttt');
    expect(root.querySelector('.my-order__items img')?.getAttribute('src')).toBe('/uploads/products/headset.png');
    expect(root.querySelector('.my-order__items')?.textContent).toContain('Qty: 1');
    expect(root.querySelector('.my-order__amounts')).toBeNull();
    expect(root.textContent).not.toContain('Payment Method');
    expect(root.textContent).not.toContain('Subtotal');
    expect(root.textContent).not.toContain('Discount');
    expect(root.textContent).not.toContain('Tax');
    expect(root.textContent).not.toContain('Shipping Charges');
    expect(root.querySelector('.my-order__status')?.textContent).toContain('ORDERED');
    expect(root.querySelector('app-pagination')).toBeNull();
  });

  it('requests the next page using LIMIT and OFFSET and shows the returned page', async () => {
    await render(ordersResponse(11));
    root.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')?.click();
    fixture.detectChanges();

    const request = http.expectOne('/api/customer_orders/get?LIMIT=10&OFFSET=10');
    request.flush(ordersResponse(11, [orderRow(16, 'ORD0006')]));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.my-order__id')?.textContent).toContain('#ORD0006');
    expect(root.querySelector('app-pagination')?.textContent).toContain('2');
  });

  it('shows an empty state for a successful response with no orders', async () => {
    await render(ordersResponse(0, []));

    expect(root.textContent).toContain("You haven't placed any orders yet.");
    expect(root.querySelector('app-order-card')).toBeNull();
  });

  it('shows the shared loader while the order request is pending', async () => {
    localStorage.clear();
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
      TOKEN,
    );
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrderList);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-loading-spinner')).not.toBeNull();
    http.expectOne('/api/customer_orders/get?LIMIT=10&OFFSET=0').flush(ordersResponse(0, []));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("You haven't placed any orders yet.");
  });

  // CHANGED (new)
  it('shows the signed S3 URL of an S3 PRODUCT_IMAGE instead of a relative "/products/..." URL', async () => {
    const key = 'products/866dea6fc30de9342300a6e901f8df6f.png';
    const signed = `https://milex.s3.amazonaws.com/${key}?X-Amz-Signature=abc`;
    await render(ordersResponse(1), {
      success: true,
      data: [{ PRODUCT_ID: 1, PRODUCT_NAME: 'Lenovo IdeaPad Slim 5', PRODUCT_IMAGE: key }],
    });

    const request = http.expectOne(`/api/s3/images/${key}`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(root.querySelector(`.my-order__items img[src="/${key}"]`)).toBeNull();
    expect(root.querySelector('.my-order__items [role="img"]')?.getAttribute('aria-label'))
      .toBe('Loading image of Lenovo IdeaPad Slim 5');

    request.flush({ success: true, imageKey: key, imageUrl: signed, expiresIn: 3600 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('.my-order__items img')?.getAttribute('src')).toBe(signed);
  });

  it('does not fabricate product names or images when the product lookup has no match', async () => {
    await render(ordersResponse(1), { success: true, data: [] });

    expect(root.querySelector('.my-order__items strong')?.textContent).toContain('Product ID: 1');
    expect(root.querySelector('.my-order__items img')).toBeNull();
  });

  it('shows an error state and toast when the orders API reports failure', async () => {
    await render({
      success: false,
      message: 'Orders are unavailable.',
      total_records: 0,
      data: [],
    });

    expect(root.textContent).toContain('Orders are unavailable.');
    expect(root.querySelector('button.order-list__retry')).not.toBeNull();
    expect(TestBed.inject(ToastService).current()?.message).toBe('Orders are unavailable.');

    root.querySelector<HTMLButtonElement>('button.order-list__retry')?.click();
    fixture.detectChanges();
    http.expectOne('/api/customer_orders/get?LIMIT=10&OFFSET=0').flush(ordersResponse(0, []));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain("You haven't placed any orders yet.");
  });

  it('does not request orders for a customer session missing CUSTOMER_ID', () => {
    localStorage.clear();
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
      `header.${btoa(JSON.stringify({ USER_ID })).replace(/=/g, '')}.signature`,
    );
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrderList);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sign in with a customer account');
    http.expectNone((request) => request.url.includes('customer_orders/get'));
  });
});
