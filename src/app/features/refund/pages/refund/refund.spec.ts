import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MockInstance } from 'vitest';
import { API_BASE_URL } from '@core/config/api.config';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { RefundService } from '../../services/refund.service';
import { Refund } from './refund';

// CHANGED: the page reads GET refund by the order number and the returned product's ORDER_ID (it showed demo data).

const CUSTOMER_ID = 1;
const USER_ID = 3;
const TOKEN = `header.${btoa(JSON.stringify({ USER_ID, CUSTOMER_ID })).replace(/=/g, '')}.signature`;
const REFUND_URL = '/api/refund?ORDER_NUMBER=ORD0020&ORDER_ID=37';

/** The sample row of the refund API documentation. */
const SAMPLE_ROW = {
  REFUND_ID: 12,
  ORDER_NUMBER: 'ORD0020',
  ORDER_ID: 37,
  RETURN_ID: 25,
  RETURN_NUMBER: 'RTN0025',
  PRODUCT_ID: 16,
  PRODUCT_NAME: 'Lenovo IdeaPad Slim 57',
  VARIANT_ID: 24,
  VARIANT_NAME: 'Blue Mouse',
  REFUND_AMOUNT: '3000.00',
  REFUND_METHOD: 2,
  REFUND_METHOD_NAME: 'UPI',
  REFUND_REFERENCE: 'REF0012',
  REFUND_DATE: '2026-11-27T11:30:34.000Z',
  REFUND_STATUS: 'REFUNDED',
  RETURN_STATUS: 24,
  RETURN_STATUS_NAME: 'REFUNDED',
  CUSTOMER_ID: 1,
  SELLER_ID: 49,
};

function refundResponse(data: unknown[] | null): Record<string, unknown> {
  return { STATUS: 'SUCCESS', MESSAGE: 'Refund requests fetched successfully', DATA: data };
}

describe('Refund', () => {
  let fixture: ComponentFixture<Refund>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const text = (element: Element | null | undefined): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const groups = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('.refund-group'));
  /** label → value of a refund's Quick Tabular Summary. */
  const summary = (group: Element): Record<string, string> =>
    Object.fromEntries(
      Array.from(group.querySelectorAll('.refund-summary > div'), (row) => [text(row.querySelector('dt')), text(row.querySelector('dd'))]),
    );

  function signIn(token = TOKEN): void {
    localStorage.clear();
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
      token,
    );
  }

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function open(orderNumber?: string, orderId?: string): Promise<void> {
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Refund);
    if (orderNumber !== undefined) fixture.componentRef.setInput('orderNumber', orderNumber);
    if (orderId !== undefined) fixture.componentRef.setInput('orderId', orderId);
    root = fixture.nativeElement as HTMLElement;
    await settle();
  }

  /** Opens the refunds of ORD0020's order line 37 and answers GET refund with these rows. */
  async function renderRefunds(rows: unknown[] | null): Promise<void> {
    signIn();
    await open('ORD0020', '37');
    http.expectOne(REFUND_URL).flush(refundResponse(rows));
    await settle();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Refund],
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

  it('asks for the refunds of the order line in the route and shows a loading state meanwhile', async () => {
    signIn();
    await open('ORD0020', '37');

    const request = http.expectOne(REFUND_URL);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(text(root.querySelector('.refund-state'))).toBe('Loading refund details…');
    expect(text(root.querySelector('app-page-heading p'))).toBe('Order #ORD0020');

    request.flush(refundResponse([SAMPLE_ROW]));
    await settle();
    expect(root.querySelector('.refund-state')).toBeNull();
  });

  it("shows every field of the product's refund from the API", async () => {
    await renderRefunds([SAMPLE_ROW]);

    expect(root.querySelector('h1')?.textContent).toContain('Refund');
    expect(text(root.querySelector('app-page-heading p'))).toBe('Order #ORD0020 · Lenovo IdeaPad Slim 57');
    const [group] = groups();
    expect(groups()).toHaveLength(1);
    // One refund: no "Refund 1 of 1" heading.
    expect(group.querySelector('.refund-group__title')).toBeNull();

    const total = group.querySelector('[aria-label="Total refund"]');
    expect(text(total?.querySelector('.refund-amount strong'))).toBe('₹3,000.00');
    expect(text(total?.querySelector('app-badge'))).toBe('Refunded');
    expect(text(total?.querySelector('.refund-note'))).toBe('Credited via UPI');
    expect(text(total?.querySelector('.refund-reference__code'))).toBe('REF0012');
    expect(text(total?.querySelector('.refund-reference__date'))).toBe('27 Nov 2026');

    const item = group.querySelector('[aria-label="Returned items"]');
    expect(text(item?.querySelector('.refund-card__header .refund-label'))).toBe('Return No. RTN0025');
    expect(text(item?.querySelector('.refund-item h3'))).toBe('Lenovo IdeaPad Slim 57');
    expect(text(item?.querySelector('.refund-item__details p'))).toBe('Blue Mouse');
    expect(text(item?.querySelector('.refund-item__return span'))).toBe('Return status');
    expect(text(item?.querySelector('.refund-item__return b'))).toBe('Refunded');

    expect(summary(group)).toEqual({
      'Order No.': 'ORD0020',
      'Return No.': 'RTN0025',
      Product: 'Lenovo IdeaPad Slim 57',
      Variant: 'Blue Mouse',
      Amount: '₹3,000.00',
      Method: 'UPI',
      Reference: 'REF0012',
      Date: '27 Nov 2026',
      Status: 'Refunded',
    });
    expect(group.querySelector('.refund-summary__status')?.getAttribute('data-tone')).toBe('success');
  });

  it('shows the lifecycle step the refund status is at', async () => {
    await renderRefunds([SAMPLE_ROW]);
    const steps = root.querySelectorAll('app-stepper li');
    expect(steps).toHaveLength(5);
    expect(steps[4].classList.contains('is-current')).toBe(true);
    expect(root.querySelectorAll('app-stepper li.is-done')).toHaveLength(4);
  });

  it('shows a refund still in progress as such', async () => {
    await renderRefunds([
      { ...SAMPLE_ROW, REFUND_STATUS: 'PENDING', RETURN_STATUS_NAME: 'APPROVED', REFUND_REFERENCE: null, REFUND_DATE: null },
    ]);

    const [group] = groups();
    expect(text(group.querySelector('.refund-amount app-badge'))).toBe('Pending');
    expect(text(group.querySelector('.refund-note'))).toBe('Refund to UPI');
    expect(text(group.querySelector('.refund-reference__code'))).toBe('Not available yet');
    expect(group.querySelector('.refund-copy')).toBeNull();
    expect(group.querySelector('.refund-reference__date')).toBeNull();
    expect(root.querySelectorAll('app-stepper li.is-done')).toHaveLength(2);
    expect(root.querySelectorAll('app-stepper li')[2].classList.contains('is-current')).toBe(true);
    expect(summary(group)).toMatchObject({ Reference: '—', Date: '—', Status: 'Pending' });
    expect(group.querySelector('.refund-summary__status')?.getAttribute('data-tone')).toBe('warning');
  });

  it('shows a note instead of the lifecycle for a rejected refund', async () => {
    await renderRefunds([{ ...SAMPLE_ROW, REFUND_STATUS: 'REJECTED' }]);

    expect(root.querySelector('app-stepper')).toBeNull();
    expect(text(root.querySelector('[aria-label="Refund lifecycle"] app-alert'))).toBe(
      'This refund was not completed (status: Rejected).',
    );
    expect(root.querySelector('.refund-summary__status')?.getAttribute('data-tone')).toBe('danger');
  });

  it('shows each return request of the product as its own refund, and no refund of another order line', async () => {
    await renderRefunds([
      SAMPLE_ROW,
      {
        ...SAMPLE_ROW, REFUND_ID: 13, RETURN_ID: 26, RETURN_NUMBER: 'RTN0026', REFUND_AMOUNT: '500.00',
        REFUND_REFERENCE: 'REF0013', REFUND_STATUS: 'PROCESSING',
      },
      { ...SAMPLE_ROW, REFUND_ID: 14, ORDER_ID: 38, RETURN_NUMBER: 'RTN0027', PRODUCT_NAME: 'Another product' },
      { ...SAMPLE_ROW, REFUND_ID: 15, ORDER_NUMBER: 'ORD0021', RETURN_NUMBER: 'RTN0028' },
    ]);

    expect(groups().map((group) => text(group.querySelector('.refund-group__title')))).toEqual([
      'Refund 1 of 2 · Return RTN0025',
      'Refund 2 of 2 · Return RTN0026',
    ]);
    expect(groups().map((group) => summary(group)['Reference'])).toEqual(['REF0012', 'REF0013']);
    expect(groups().map((group) => summary(group)['Amount'])).toEqual(['₹3,000.00', '₹500.00']);
    expect(groups().map((group) => summary(group)['Status'])).toEqual(['Refunded', 'Processing']);
    expect(root.textContent).not.toContain('Another product');
    expect(root.textContent).not.toContain('RTN0027');
    expect(root.textContent).not.toContain('RTN0028');
  });

  it('says when the product has no refund yet, with a link back to its order', async () => {
    await renderRefunds(null);

    expect(groups()).toHaveLength(0);
    const empty = root.querySelector('.refund-empty');
    expect(text(empty?.querySelector('p'))).toBe('No refund has been issued for this product yet.');
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/orders/ORD0020');
  });

  it('shows the error with Try again, which asks again', async () => {
    signIn();
    await open('ORD0020', '37');
    http.expectOne(REFUND_URL).flush({ STATUS: 'FAILURE', MESSAGE: 'Refund lookup failed' });
    await settle();

    expect(text(root.querySelector('app-alert'))).toBe('Refund lookup failed Try again');
    (root.querySelector('.refund-retry') as HTMLButtonElement).click();
    await settle();
    http.expectOne(REFUND_URL).flush(refundResponse([SAMPLE_ROW]));
    await settle();

    expect(root.querySelector('app-alert[role="alert"]')).toBeNull();
    expect(groups()).toHaveLength(1);
  });

  it('shows an HTTP failure as a readable message', async () => {
    signIn();
    await open('ORD0020', '37');
    http.expectOne(REFUND_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text(root.querySelector('app-alert'))).toContain('Refund details could not be loaded (HTTP 500).');
  });

  for (const [label, orderNumber, orderId] of [
    ['no order', undefined, undefined],
    ['no order line', 'ORD0020', undefined],
    ['an invalid order line', 'ORD0020', 'abc'],
    ['order line 0', 'ORD0020', '0'],
  ] as const) {
    it(`asks for nothing and says the refund cannot be found for ${label}`, async () => {
      signIn();
      await open(orderNumber, orderId);

      http.expectNone((request) => request.url.endsWith('/refund'));
      expect(text(root.querySelector('.refund-empty p'))).toContain("We couldn't find that refund.");
      expect(root.querySelector('.refund-empty a')?.getAttribute('href')).toBe('/orders');
    });
  }

  // CHANGED (new): Download Refund Statement saves a PDF of every refund shown (it was a .txt file of one refund).
  describe('Download Refund Statement', () => {
    const SECOND_ROW = { ...SAMPLE_ROW, REFUND_ID: 13, RETURN_ID: 26, RETURN_NUMBER: 'RTN0026', REFUND_STATUS: 'PENDING' };
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    let click: MockInstance<HTMLAnchorElement['click']>;

    const downloadButtons = (): HTMLButtonElement[] =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('.refund-actions app-button button')).filter(
        (button) => text(button) === 'Download Refund Statement',
      );

    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:refund-statement');
      URL.revokeObjectURL = vi.fn();
      click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    });

    afterEach(() => {
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      click.mockRestore();
    });

    it('saves one PDF with every refund shown', async () => {
      await renderRefunds([SAMPLE_ROW, SECOND_ROW]);
      const statementPdf = vi.spyOn(TestBed.inject(RefundService), 'statementPdf');

      downloadButtons()[1].click();
      await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1));

      expect(statementPdf.mock.calls[0][0].map((refund) => refund.returnNumber)).toEqual(['RTN0025', 'RTN0026']);
      const pdf = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
      expect(pdf.type).toBe('application/pdf');
      const link = click.mock.contexts[0] as HTMLAnchorElement;
      expect(link.download).toBe('refund-statement-ORD0020.pdf');
      expect(link.getAttribute('href')).toBe('blob:refund-statement');
      expect(link.isConnected).toBe(false);
    });

    it('names the PDF after the return number of a single refund, and shows a spinner while it is made', async () => {
      await renderRefunds([SAMPLE_ROW]);
      let finish!: (pdf: Blob) => void;
      vi.spyOn(TestBed.inject(RefundService), 'statementPdf').mockReturnValue(
        new Promise<Blob>((resolve) => (finish = resolve)),
      );

      downloadButtons()[0].click();
      await settle();
      expect(downloadButtons()[0].disabled).toBe(true);
      expect(downloadButtons()[0].getAttribute('aria-busy')).toBe('true');

      finish(new Blob(['%PDF-1.3'], { type: 'application/pdf' }));
      await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      await settle();
      expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('refund-statement-RTN0025.pdf');
      expect(downloadButtons()[0].disabled).toBe(false);
    });

    it('says so when the statement cannot be made', async () => {
      await renderRefunds([SAMPLE_ROW]);
      vi.spyOn(TestBed.inject(RefundService), 'statementPdf').mockRejectedValue(new Error('chunk failed'));

      downloadButtons()[0].click();
      await vi.waitFor(() =>
        expect(TestBed.inject(ToastService).current()?.message).toBe(
          'The refund statement could not be created. Please try again.',
        ),
      );
      expect(click).not.toHaveBeenCalled();
      await settle();
      expect(downloadButtons()[0].disabled).toBe(false);
    });
  });

  it('asks for nothing without a customer session', async () => {
    localStorage.clear();
    await open('ORD0020', '37');

    http.expectNone((request) => request.url.endsWith('/refund'));
    expect(text(root.querySelector('app-alert'))).toBe('Sign in with a customer account to view this refund.');
    expect(root.querySelector('.refund-retry')).toBeNull();
  });
});
