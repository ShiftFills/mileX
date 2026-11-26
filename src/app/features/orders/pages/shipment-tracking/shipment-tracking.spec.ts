// CHANGED: the page reads the tracking API (GET tracking?ORDER_NUMBER=…); it showed a demo shipment.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_BASE_URL } from '@core/config/api.config';
import { ToastService } from '@core/services/toast.service';
import { ShipmentTrackingPage } from './shipment-tracking';

const RETURN_REASONS_RESPONSE = {
  success: true,
  message: 'Return reasons fetched successfully',
  data: [
    { REASON_ID: 20, REASON: 'Other' },
    { REASON_ID: 19, REASON: 'Product is unsuitable for my needs' },
  ],
};

const RETURN_REASONS_URL = '/api/return_reason/get?REASON_ID=-1&REASON=-1';
const TRACKING_URL = '/api/tracking?ORDER_NUMBER=ORD0016&LIMIT=10&OFFSET=0';
const SHIPPING_STATUSES_URL = '/api/shipping_status/get?SHIPPING_STATUS_ID=-1';

/** The tracking API sample row. */
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

const trackingResponse = (data: unknown[]) => ({
  success: true, message: 'Shipment tracking details fetched successfully', count: data.length, data,
});

const SHIPPING_STATUSES_RESPONSE = {
  status: 'SUCCESS',
  data: [
    { SHIPPING_STATUS_ID: 4, SHIPPING_STATUS: 'DELIVERED' },
    { SHIPPING_STATUS_ID: 3, SHIPPING_STATUS: 'IN TRANSIT' },
    { SHIPPING_STATUS_ID: 2, SHIPPING_STATUS: 'NOT SHIPPED' },
    { SHIPPING_STATUS_ID: 1, SHIPPING_STATUS: 'SHIPPED' },
  ],
};

describe('ShipmentTrackingPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ShipmentTrackingPage>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null = root()): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function render(orderNumber = 'ORD0016'): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ShipmentTrackingPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: orderNumber })) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ShipmentTrackingPage);
    await settle();
  }

  /** Opens the page and answers the tracking request (and the shipping statuses for the steps). */
  async function open(rows: unknown[] = [trackingRow()]): Promise<void> {
    await render();
    http.expectOne(TRACKING_URL).flush(trackingResponse(rows));
    if (rows.length) http.expectOne(SHIPPING_STATUSES_URL).flush(SHIPPING_STATUSES_RESPONSE);
    await settle();
  }

  afterEach(() => {
    http.verify();
    TestBed.inject(ToastService).dismiss();
  });

  it('shows a loading state, then the order, carrier, shipment, steps, package and totals from the API', async () => {
    await render();
    expect(text(root().querySelector('[role="status"]'))).toContain('Loading shipment details');
    http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow()]));
    http.expectOne(SHIPPING_STATUSES_URL).flush(SHIPPING_STATUSES_RESPONSE);
    await settle();

    const page = text();
    expect(page).toContain('ORD0016');
    // CHANGED: no "Shipment No · Shipped on" line (not in the design).
    expect(page).not.toContain('Shipment No');
    expect(page).toContain('Carrier: BlueDart');
    expect(text(root().querySelector('.tracking-carrier__logo'))).toBe('BLU');
    expect(text(root().querySelector('.tracking-carrier__no'))).toBe('TRK001');
    expect(root().querySelector('.tracking-carrier__visit')?.getAttribute('href')).toBe('https://www.bluedart.com/tracking');
    expect(text(root().querySelector('.tracking-status__schedule'))).toBe('On schedule');
    // CHANGED (new): the live status is announced.
    expect(root().querySelector('.tracking-status__main')?.getAttribute('role')).toBe('status');
    // EXPECTED_DELIVERY_DATE "2026-11-31" is not a real date.
    expect(text(root().querySelector('.tracking-status__date'))).toBe('Not available');

    // CHANGED: the design's five steps; the order is IN TRANSIT.
    expect(root().querySelectorAll('.stepper__step')).toHaveLength(5);
    expect(text(root().querySelector('.stepper__step.is-current'))).toContain('In Transit');

    expect(page).toContain('Package Content ( 1 item )');
    expect(page).toContain('Wireless Mosue');
    expect(page).toContain('SKU: SKU0017 • Qty: 4');
    const totals = Array.from(root().querySelectorAll('.tracking-subtotal'), (line) => [
      text(line.querySelector('span')), text(line.querySelector('strong')),
    ]);
    // CHANGED: the API's SUBTOTAL only, as in the design.
    expect(totals).toEqual([['Sub total Amount', '₹226,664.00']]);
    // DELIVERY_ADDRESS: name, the address lines, then the phone.
    expect(Array.from(root().querySelectorAll('.tracking-address > *'), (part) => text(part))).toEqual([
      'pooja', '13/5a, 2nd Street, Near Bus Stand', 'Chennai, Tamil Nadu, India, 600040', '9876543210',
    ]);
  });

  // CHANGED: the live tracking section is always shown, as in the design; it was hidden without live location data.
  it('shows the live tracking section without making up a location, and hides payment, Reschedule and Invoice PDF', async () => {
    await open();

    // Row 3: the map card on the left, the package / address / actions beside it.
    const map = root().querySelector('app-shipment-map');
    expect(map?.parentElement?.classList).toContain('tracking-grid__map');
    expect(root().querySelector('.tracking-stack')?.parentElement?.classList).toContain('tracking-grid__side');
    expect(root().querySelector('.tracking-stack--wide')).toBeNull();
    // CHANGED: the API's shipping status, delivery city and carrier instead of a live location (none is sent).
    expect(text(map?.querySelector('.tracking-map__status p') ?? null)).toBe(
      'En route to Chennai Carrier: BlueDart | Tracking No: TRK001',
    );
    expect(text(map?.querySelector('.tracking-map__empty') ?? null)).toBe('Live location not available yet');
    expect(map?.querySelector('.tracking-map__pin')).toBeNull();

    // Status card: Live Map View, and where the package is in the delivery (no location the API did not send).
    expect(text(root().querySelector('.tracking-map-button'))).toBe('Live Map View');
    expect(text(root().querySelector('.tracking-status__where'))).toBe('Package currently In Transit with BlueDart');

    expect(text()).not.toContain('Payment & Billing');
    expect(text()).not.toContain('Reschedule');
    expect(text()).not.toContain('Invoice PDF');
    // Cancel / Return takes its whole line.
    const cancel = root().querySelector('.tracking-return-button')?.parentElement;
    expect(cancel?.classList).toContain('col-12');
    expect(cancel?.classList).not.toContain('col-sm-6');
    expect(text(root().querySelector('.tracking-return-button'))).toBe('Cancel / Return');
  });

  // CHANGED (new): Refresh requests GET tracking again (only it: the shipping statuses are already loaded) and keeps the
  // page meanwhile.
  it('loads the tracking details again on Refresh', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.tracking-refresh button')!.click();
    await settle();
    expect(root().querySelector('.tracking-refresh button')?.getAttribute('aria-busy')).toBe('true');
    // The page stays as it is while loading.
    expect(root().querySelector('.tracking__state')).toBeNull();

    http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow({ STATUS: 'Delayed' })]));
    http.expectNone(SHIPPING_STATUSES_URL);
    await settle();
    expect(root().querySelector('.tracking-refresh button')?.getAttribute('aria-busy')).toBeNull();
    expect(text(root().querySelector('.tracking-status__schedule'))).toBe('Delayed');
    expect(root().querySelector('.tracking-status__schedule')?.classList).toContain('is-late');
  });

  it('keeps the details and shows the error in the map card and a toast when Refresh fails', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.tracking-refresh button')!.click();
    await settle();
    http.expectOne(TRACKING_URL).flush({ message: 'Tracking service unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle();

    expect(TestBed.inject(ToastService).current()?.type).toBe('error');
    expect(text(root().querySelector('.tracking-map__error'))).toContain('Tracking service unavailable');
    expect(text()).toContain('TRK001');

    // A successful Refresh clears it.
    root().querySelector<HTMLButtonElement>('.tracking-refresh button')!.click();
    await settle();
    expect(root().querySelector('.tracking-map__error')).toBeNull();
    http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow()]));
    await settle();
    expect(root().querySelector('.tracking-map__error')).toBeNull();
  });

  // CHANGED (new): finished steps are done (check mark), the current one has the truck, later ones the home icon.
  it('colours the timeline from the current step and captions only the dates the API sends', async () => {
    await open();
    const steps = Array.from(root().querySelectorAll<HTMLElement>('.stepper__step'));

    // CHANGED: the design's five steps.
    expect(steps.map((step) => text(step.querySelector('.stepper__label')))).toEqual([
      'Order Placed', 'Packed', 'Shipped', 'In Transit', 'Delivered',
    ]);
    expect(steps.map((step) => (step.classList.contains('is-done') ? 'done' : step.classList.contains('is-current') ? 'current' : 'upcoming')))
      .toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    // CHANGED (new): the state also as text (not colour and icon alone).
    expect(steps.map((step) => text(step.querySelector('.visually-hidden')))).toEqual([
      ', completed', ', completed', ', completed', ', current', ', upcoming',
    ]);
    expect(steps[0].querySelector('.stepper__marker path')?.getAttribute('d')).toBe('m3.5 8.5 3 3 6-7');
    expect(steps[3].querySelector('.stepper__marker path')?.getAttribute('d')).toMatch(/^M2 6h11v10H2z/);
    expect(steps[4].querySelector('.stepper__marker path')?.getAttribute('d')).toMatch(/^M4 11l8-7 8 7/);
    // CHANGED: ORDER_DATE and SHIPPING_DATE as "25 Nov, 12:26 PM"; nothing made up for Packed and In Transit (the API
    // has no date for them); "Pending Arrival" until delivered.
    expect(text(steps[0].querySelector('.stepper__caption'))).toMatch(/^\d{1,2} Nov, \d{2}:\d{2} (AM|PM)$/);
    expect(steps[1].querySelector('.stepper__caption')).toBeNull();
    // SHIPPING_DATE 18:30 UTC is midnight in India, which shows the day only.
    expect(text(steps[2].querySelector('.stepper__caption'))).toMatch(/^\d{1,2} Nov(, \d{2}:\d{2} (AM|PM))?$/);
    expect(steps[3].querySelector('.stepper__caption')).toBeNull();
    expect(text(steps[4].querySelector('.stepper__caption'))).toBe('Pending Arrival');
  });

  it('shows "Verified Packed" once the shipping status is Packed or later', async () => {
    await open();
    expect(root().querySelector('.tracking-card__head .tracking-pill')?.textContent).toContain('Verified Packed');
  });

  it('does not show "Verified Packed" before the package is packed', async () => {
    await open([trackingRow({ ORDER_SHIPPING_STATUS_ID: 2, ORDER_SHIPPING_STATUS_NAME: 'NOT SHIPPED' })]);
    expect(text()).not.toContain('Verified Packed');
    // CHANGED (new): not with the carrier yet.
    expect(text(root().querySelector('.tracking-status__where'))).toBe('Package currently Not Shipped');
    expect(text(root().querySelector('.tracking-map__status strong'))).toBe('Not Shipped');
  });

  // CHANGED (new): no STATUS from the API: worked out from a valid EXPECTED_DELIVERY_DATE.
  it('shows "On Schedule" or "Delayed" from the expected delivery date when the API sends no STATUS', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 25, 12));
    try {
      await open([trackingRow({ STATUS: null, EXPECTED_DELIVERY_DATE: '2026-11-30' })]);
      expect(text(root().querySelector('.tracking-status__schedule'))).toBe('On Schedule');
      expect(text(root().querySelector('.tracking-status__date'))).toBe('Monday, Nov 30, 2026');
    } finally {
      vi.useRealTimers();
    }
  });

  // CHANGED: the design has no back link above the heading.
  it('shows no back link above the heading', async () => {
    await open();
    expect(root().querySelector('.tracking__back')).toBeNull();
    expect(text()).not.toContain('Back to Order Details');
  });

  // CHANGED (new): the design's 40% / 60% first row.
  it('puts the order and the live status in the first row', async () => {
    await open();
    expect(root().querySelector('.tracking-grid__order .tracking-order')).not.toBeNull();
    expect(root().querySelector('.tracking-grid__status .tracking-status')).not.toBeNull();
  });

  it('hides Visit Site for a carrier without a known website', async () => {
    await open([trackingRow({ SHIPPING_PROVIDER_NAME: 'Local Courier' })]);
    expect(text(root().querySelector('.tracking-carrier__name'))).toBe('Carrier: Local Courier');
    expect(root().querySelector('.tracking-carrier__visit')).toBeNull();
  });

  it('shows a note instead of the steps for a cancelled order', async () => {
    await open([trackingRow({ ORDER_STATUS_NAME: 'CANCELLED' })]);
    expect(root().querySelector('app-stepper')).toBeNull();
    expect(text(root().querySelector('.tracking-timeline app-alert'))).toContain('This order was cancelled');
    // CHANGED (new): no live tracking for an order that will not be delivered.
    expect(root().querySelector('app-shipment-map')).toBeNull();
    expect(root().querySelector('.tracking-map-button')).toBeNull();
    expect(root().querySelector('.tracking-stack--wide')).not.toBeNull();
  });

  // CHANGED: no tracking rows means the order has not shipped yet (not "not found").
  it('explains that the order has not shipped yet when the API has no tracking rows', async () => {
    await open([]);
    const empty = root().querySelector('.tracking-empty');
    expect(text(empty)).toContain("This order hasn't shipped yet. Tracking details will appear here once it is dispatched.");
    expect(Array.from(empty?.querySelectorAll('a') ?? [], (link) => [text(link), link.getAttribute('href')])).toEqual([
      ['View Order Details', '/orders/ORD0016'],
      ['Back to My Orders', '/orders'],
    ]);
    // Not the error state.
    expect(root().querySelector('.tracking__retry')).toBeNull();
    expect(root().querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the API error with Try again, then loads again', async () => {
    await render();
    http.expectOne(TRACKING_URL).flush({ message: 'Tracking service unavailable' }, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(text(root().querySelector('[role="alert"]'))).toContain('Tracking service unavailable');
    expect(TestBed.inject(ToastService).current()?.type).toBe('error');

    (root().querySelector('.tracking__retry') as HTMLButtonElement).click();
    await settle();
    http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow()]));
    http.expectOne(SHIPPING_STATUSES_URL).flush(SHIPPING_STATUSES_RESPONSE);
    await settle();
    expect(root().querySelector('[role="alert"]')).toBeNull();
    expect(text()).toContain('TRK001');
  });

  it('copies the tracking number', async () => {
    await open();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    (root().querySelector('.tracking-carrier__copy') as HTMLButtonElement).click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('TRK001');
    expect(root().querySelector('.tracking-carrier__copy')?.getAttribute('aria-label')).toBe('Tracking number copied');
  });

  it('opens the cancel / return dialog with the shipment item', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    fixture.detectChanges();
    expect(root().querySelector('.return-form__lookup-state')).not.toBeNull();
    const request = http.expectOne(RETURN_REASONS_URL);
    expect(request.request.method).toBe('GET');
    request.flush(RETURN_REASONS_RESPONSE);
    await settle();

    expect(root().querySelector('[role="dialog"] h2')?.textContent).toBe('Cancel / Return Item');
    expect(root().querySelector('.return-product__details h3')?.textContent).toContain('Wireless Mosue');
    expect(text(root().querySelector('.return-product__quantity'))).toBe('Qty: 4');
    expect(root().querySelector('.return-product__price')?.textContent).toContain('56,666');
    const reasonSelect = root().querySelector<HTMLSelectElement>('#return-reason')!;
    expect(reasonSelect.disabled).toBe(false);
    expect(Array.from(reasonSelect.options).map((option) => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'Choose a reason'],
      ['20', 'Other'],
      ['19', 'Product is unsuitable for my needs'],
    ]);
  });

  it('requires a return reason, then submits and closes the dialog', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    http.expectOne(RETURN_REASONS_URL).flush(RETURN_REASONS_RESPONSE);
    await settle();

    root().querySelector<HTMLFormElement>('.return-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(root().querySelector('.return-form__error')).not.toBeNull();

    const reason = root().querySelector<HTMLSelectElement>('#return-reason')!;
    reason.value = '19';
    reason.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    root().querySelector<HTMLFormElement>('.return-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    expect(root().querySelector('[role="dialog"]')).toBeNull();
    expect(root().querySelector('.tracking__notice')?.textContent).toContain('submitted for review');
    http.expectNone((request) => request.method === 'POST');
  });

  it('shows an empty state when the API returns no return reasons', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    http.expectOne(RETURN_REASONS_URL).flush({ success: true, message: 'No reasons', data: [] });
    await settle();

    expect(root().querySelector('.return-form__lookup-empty')?.textContent).toContain('No return reasons');
    expect(root().querySelector<HTMLSelectElement>('#return-reason')?.disabled).toBe(true);
  });

  it('shows a toast on a return-reason failure and allows retrying the lookup', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    http.expectOne(RETURN_REASONS_URL).flush({ success: false, message: 'Return reasons are unavailable.', data: [] });
    await settle();

    expect(root().querySelector('.return-form__lookup-error')?.textContent).toContain('Return reasons are unavailable.');
    expect(TestBed.inject(ToastService).current()?.message).toBe('Return reasons are unavailable.');

    root().querySelector<HTMLButtonElement>('.return-form__lookup-error button')!.click();
    fixture.detectChanges();
    http.expectOne(RETURN_REASONS_URL).flush(RETURN_REASONS_RESPONSE);
    await settle();

    expect(root().querySelector('.return-form__lookup-error')).toBeNull();
    expect(root().querySelector<HTMLSelectElement>('#return-reason')?.options.length).toBe(3);
  });
});
