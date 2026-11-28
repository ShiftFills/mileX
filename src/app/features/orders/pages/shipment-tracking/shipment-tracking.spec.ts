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
// CHANGED (new): the dialog's Product (the order's products, by ORDER_NUMBER) and Refund Method lookups.
const RETURN_PRODUCTS_URL = '/api/return_dropdown?ORDER_NUMBER=ORD0016&LIMIT=10&OFFSET=0';
const REFUND_METHODS_URL = '/api/refund_method?REFUND_METHOD_ID=-1&LIMIT=10&OFFSET=0';
// CHANGED (new): the dialog's Return Type options (they were the RETURN/… shipping statuses).
const RETURN_STATUSES_URL = '/api/return_status?RETURN_STATUS_ID=-1&LIMIT=10&OFFSET=0';
const RETURN_STATUSES_RESPONSE = {
  STATUS: 'SUCCESS',
  MESSAGE: 'Return status retrieved successfully',
  DATA: [
    { RETURN_STATUS_ID: 1, RETURN_STATUS_NAME: 'RETURN/REPLACE', CREATED_AT: '2026-11-26T12:03:32.000Z' },
    { RETURN_STATUS_ID: 2, RETURN_STATUS_NAME: 'RETURN/REFUND', CREATED_AT: '2026-11-26T12:03:32.000Z' },
  ],
};

/** A return_dropdown row: by default the tracking sample's product (ORDER_ID 33, PRODUCT_ID 17), variant 3. */
function productRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ORDER_ID: 33, ORDER_NUMBER: 'ORD0016', PRODUCT_ID: 17, PRODUCT_VARIANT_ID: 3, PRODUCT_NAME: 'Wireless Mosue', ...overrides };
}

const productsResponse = (data: unknown[]) => ({
  STATUS: 'SUCCESS', MESSAGE: 'Return request dropdown retrieved successfully', DATA: data,
});

const REFUND_METHODS_RESPONSE = {
  STATUS: 'SUCCESS',
  MESSAGE: 'Refund methods fetched successfully',
  DATA: [
    { REFUND_METHOD_ID: 3, REFUND_METHOD_NAME: 'Wallet', IS_ACTIVE: 'ACTIVE' },
    { REFUND_METHOD_ID: 2, REFUND_METHOD_NAME: 'UPI', IS_ACTIVE: 'ACTIVE' },
    { REFUND_METHOD_ID: 1, REFUND_METHOD_NAME: 'Cheque', IS_ACTIVE: 'INACTIVE' },
  ],
};

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

// CHANGED: with the return types (the "RETURN/…" statuses the Cancel / Return dialog offers).
const SHIPPING_STATUSES_RESPONSE = {
  status: 'SUCCESS',
  data: [
    { SHIPPING_STATUS_ID: 28, SHIPPING_STATUS: 'RETURN/REFUND' },
    { SHIPPING_STATUS_ID: 27, SHIPPING_STATUS: 'RETURN/REPLACE' },
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
  // CHANGED (new): the return dialog's dropdowns are SearchableSelects; their trigger button carries the id.
  const trigger = (id: string): HTMLButtonElement => root().querySelector<HTMLButtonElement>(`#${id}`)!;
  /** Opens a dialog dropdown, reads its option labels and closes it again. */
  async function dropdownOptions(id: string): Promise<string[]> {
    trigger(id).click();
    await settle();
    const labels = Array.from(
      trigger(id).closest('.searchable-select')?.querySelectorAll('[role="option"]') ?? [],
      (option) => text(option),
    );
    trigger(id).click();
    await settle();
    return labels;
  }
  /** Opens a dialog dropdown and picks the option with this label. */
  async function pick(id: string, label: string): Promise<void> {
    trigger(id).click();
    await settle();
    const options = trigger(id).closest('.searchable-select')?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [];
    Array.from(options).find((option) => text(option) === label)!.click();
    await settle();
  }

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

  // CHANGED (new): the timeline follows ORDER_SHIPPING_STATUS_NAME.
  describe('timeline from ORDER_SHIPPING_STATUS_NAME', () => {
    const stepStates = (): string[] =>
      Array.from(root().querySelectorAll<HTMLElement>('.stepper__step'), (step) =>
        step.classList.contains('is-done') ? 'done' : step.classList.contains('is-current') ? 'current' : 'upcoming',
      );

    for (const [status, states] of [
      ['NOT SHIPPED', ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']],
      ['SHIPPED', ['done', 'done', 'current', 'upcoming', 'upcoming']],
      ['IN TRANSIT', ['done', 'done', 'done', 'current', 'upcoming']],
      ['OUT FOR DELIVERY', ['done', 'done', 'done', 'current', 'upcoming']],
    ] as const) {
      it(`marks the completed, current and pending steps for ${status}`, async () => {
        await open([trackingRow({ ORDER_SHIPPING_STATUS_NAME: status })]);
        expect(stepStates()).toEqual(states);
      });
    }

    it('completes every step once delivered, with nothing pending', async () => {
      await open([trackingRow({ ORDER_SHIPPING_STATUS_ID: 4, ORDER_SHIPPING_STATUS_NAME: 'DELIVERED' })]);

      expect(stepStates()).toEqual(['done', 'done', 'done', 'done', 'done']);
      expect(Array.from(root().querySelectorAll('.stepper__step .visually-hidden'), (state) => text(state))).toEqual(
        Array(5).fill(', completed'),
      );
      expect(root().querySelector('[aria-current="step"]')).toBeNull();
      expect(text(root().querySelector('.tracking-timeline'))).not.toContain('Pending Arrival');
    });

    it('follows the status name the API sends, not the list name of its ID', async () => {
      // ID 4 is DELIVERED in shipping_status/get, but ORDER_SHIPPING_STATUS_NAME says SHIPPED.
      await open([trackingRow({ ORDER_SHIPPING_STATUS_ID: 4, ORDER_SHIPPING_STATUS_NAME: 'SHIPPED' })]);
      expect(stepStates()).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    });

    it('shows the timeline of a delivered shipment whose order was returned', async () => {
      await open([trackingRow({ ORDER_STATUS_NAME: 'RETURNED', ORDER_SHIPPING_STATUS_ID: 4, ORDER_SHIPPING_STATUS_NAME: 'DELIVERED' })]);

      expect(root().querySelector('.tracking-timeline app-alert')).toBeNull();
      expect(text()).not.toContain('This shipment was returned');
      expect(stepStates()).toEqual(['done', 'done', 'done', 'done', 'done']);
    });

    it('shows a note, with the status name, instead of the steps for a shipment being returned', async () => {
      await open([trackingRow({ ORDER_SHIPPING_STATUS_ID: 28, ORDER_SHIPPING_STATUS_NAME: 'RETURN/REFUND' })]);

      expect(root().querySelector('app-stepper')).toBeNull();
      expect(text(root().querySelector('.tracking-timeline app-alert'))).toBe(
        'This shipment was returned. Shipping status: Return/Refund.',
      );
      expect(root().querySelector('app-shipment-map')).toBeNull();
    });

    it('shows the plain note, without repeating the status name, for a CANCELLED shipping status', async () => {
      await open([trackingRow({ ORDER_SHIPPING_STATUS_NAME: 'CANCELLED' })]);
      expect(text(root().querySelector('.tracking-timeline app-alert'))).toBe(
        'This order was cancelled, so it will not be delivered.',
      );
    });
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

  // CHANGED: the product comes from return_dropdown (chosen, as it is the order's only one).
  it('opens the cancel / return dialog with the shipment item', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    fixture.detectChanges();
    expect(root().querySelector('.return-form__lookup-state')).not.toBeNull();
    expect(text(root().querySelector('.return-form__field:first-child [role="status"]'))).toBe("Loading the order's products…");
    expect(trigger('return-product').disabled).toBe(true);
    const request = http.expectOne(RETURN_REASONS_URL);
    expect(request.request.method).toBe('GET');
    request.flush(RETURN_REASONS_RESPONSE);
    const products = http.expectOne(RETURN_PRODUCTS_URL);
    expect(products.request.method).toBe('GET');
    products.flush(productsResponse([productRow()]));
    // CHANGED (new): the Return Type options (return_status).
    const returnStatuses = http.expectOne(RETURN_STATUSES_URL);
    expect(returnStatuses.request.method).toBe('GET');
    returnStatuses.flush(RETURN_STATUSES_RESPONSE);
    await settle();

    expect(root().querySelector('[role="dialog"] h2')?.textContent).toBe('Cancel / Return Item');
    expect(text(trigger('return-product'))).toBe('Wireless Mosue');
    // The Refund Method is asked for a refund only.
    expect(root().querySelector('#refund-method')).toBeNull();
    http.expectNone(REFUND_METHODS_URL);
    expect(root().querySelector('.return-product__details h3')?.textContent).toContain('Wireless Mosue');
    expect(text(root().querySelector('.return-product__quantity'))).toBe('Qty: 4');
    expect(root().querySelector('.return-product__price')?.textContent).toContain('56,666');
    // CHANGED: the app's own dropdowns (the browser's list could not be styled and opened over the dialog).
    expect(trigger('return-reason').disabled).toBe(false);
    expect(text(trigger('return-reason'))).toBe('Choose a reason');
    expect(await dropdownOptions('return-reason')).toEqual(['Other', 'Product is unsuitable for my needs']);
    // CHANGED: Return Type, the RETURN/… return statuses (RETURN_STATUS_NAME, in the API's order), not the shipping
    // statuses. Two options: no search box.
    expect(trigger('return-type').disabled).toBe(false);
    expect(text(trigger('return-type'))).toBe('Choose refund or replacement');
    expect(await dropdownOptions('return-type')).toEqual(['Return/Replace', 'Return/Refund']);
    trigger('return-type').click();
    await settle();
    expect(root().querySelector('.searchable-select__panel--plain')).not.toBeNull();
    expect(root().querySelector('.searchable-select__search')).toBeNull();
    trigger('return-type').click();
    await settle();
    http.expectNone(SHIPPING_STATUSES_URL);
  });

  // CHANGED (new): the reason list opens below its field with a search box, and the choice shows in the field.
  it('lets the customer search the reasons and shows the chosen one', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.tracking-return-button button')!.click();
    http.expectOne(RETURN_REASONS_URL).flush(RETURN_REASONS_RESPONSE);
    http.expectOne(RETURN_PRODUCTS_URL).flush(productsResponse([productRow()]));
    http.expectOne(RETURN_STATUSES_URL).flush(RETURN_STATUSES_RESPONSE);
    await settle();

    trigger('return-reason').click();
    await settle();
    expect(trigger('return-reason').getAttribute('aria-expanded')).toBe('true');
    const search = root().querySelector<HTMLInputElement>('.searchable-select__search')!;
    expect(search.placeholder).toBe('Search reasons…');
    search.value = 'unsuitable';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    const options = Array.from(root().querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(options.map((option) => text(option))).toEqual(['Product is unsuitable for my needs']);

    options[0].click();
    await settle();
    expect(root().querySelector('[role="listbox"]')).toBeNull();
    expect(text(trigger('return-reason'))).toBe('Product is unsuitable for my needs');
  });

  // CHANGED (new): POST return_request (it only showed a notice).
  describe('submitting a return request', () => {
    const RETURN_REQUEST_URL = '/api/return_request';
    const form = (): HTMLFormElement => root().querySelector<HTMLFormElement>('.return-form')!;
    const submit = async (): Promise<void> => {
      form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();
    };
    // CHANGED: by default the documented tracking row, which has the product's PRODUCT_VARIANT_ID and SELLER_ID, and
    // the order's products (return_dropdown).
    async function openDialog(
      rows: unknown[] = [trackingRow({ PRODUCT_VARIANT_ID: 3, SELLER_ID: 24 })],
      products: unknown[] = [productRow()],
    ): Promise<void> {
      await open(rows);
      root().querySelector<HTMLButtonElement>('.tracking-return-button button')!.click();
      http.expectOne(RETURN_REASONS_URL).flush(RETURN_REASONS_RESPONSE);
      http.expectOne(RETURN_PRODUCTS_URL).flush(productsResponse(products));
      http.expectOne(RETURN_STATUSES_URL).flush(RETURN_STATUSES_RESPONSE);
      await settle();
    }

    /** Chooses Return/Refund and a refund method (read the first time a refund is chosen). */
    async function pickRefund(method = 'Wallet'): Promise<void> {
      await pick('return-type', 'Return/Refund');
      const request = http.match(REFUND_METHODS_URL);
      request.forEach((pending) => pending.flush(REFUND_METHODS_RESPONSE));
      await settle();
      await pick('refund-method', method);
    }

    it('requires a return type and a reason before sending anything', async () => {
      await openDialog();
      await submit();
      expect(Array.from(root().querySelectorAll('.return-form__error'), (error) => text(error))).toEqual([
        'Select refund or replacement to continue.',
        'Select a reason to continue.',
      ]);
      expect(root().querySelector('#return-type')?.getAttribute('aria-invalid')).toBe('true');

      await pick('return-type', 'Return/Replace');
      expect(Array.from(root().querySelectorAll('.return-form__error'), (error) => text(error))).toEqual([
        'Select a reason to continue.',
      ]);
      await submit();
      http.expectNone(RETURN_REQUEST_URL);
      expect(root().querySelector('[role="dialog"]')).not.toBeNull();
    });

    it('sends ORDER_NUMBER, REASON_ID and RETURN_DESCRIPTION once, then shows the request status and reads the tracking again', async () => {
      await openDialog();
      await pickRefund();
      await pick('return-reason', 'Product is unsuitable for my needs');
      const details = root().querySelector<HTMLTextAreaElement>('#return-details')!;
      details.value = '  Box was damaged  ';
      details.dispatchEvent(new Event('input'));
      await settle();

      await submit();
      // A second Submit while the first is sent makes no second request.
      await submit();
      const request = http.expectOne(RETURN_REQUEST_URL);
      expect(request.request.method).toBe('POST');
      // CHANGED: ORDER_ID, PRODUCT_ID and VARIANT_ID of the chosen product (return_dropdown), its tracking row's
      // SELLER_ID and delivery address (the pickup), and the chosen refund method.
      expect(request.request.body).toEqual({
        ORDER_NUMBER: 'ORD0016', ORDER_ID: 33, REASON_ID: 19, RETURN_DESCRIPTION: 'Box was damaged',
        // CHANGED: RETURN_OPTION is the RETURN_STATUS_ID of RETURN/REFUND (it was its SHIPPING_STATUS_ID, 28).
        RETURN_OPTION: 2, PRODUCT_ID: 17, VARIANT_ID: 3, SELLER_ID: 24, PICKUP_ADDRESS_ID: 1, REFUND_METHOD: 3,
      });
      const submitButton = root().querySelector('.return-dialog__actions app-button:last-child button');
      expect(submitButton?.getAttribute('aria-busy')).toBe('true');
      expect(text(submitButton)).toBe('Submitting…');
      expect(trigger('return-reason').disabled).toBe(true);
      expect(root().querySelector<HTMLButtonElement>('.return-dialog__close')?.disabled).toBe(true);

      request.flush({
        STATUS: 'SUCCESS', ORDER_NUMBER: 'ORD0016', RETURN_REASON_ID: 19, RETURN_REASON: 'Product is unsuitable for my needs',
        RETURN_REQUEST_COUNT: 1, RETURN_STATUS_ID: 6, RETURN_STATUS_NAME: 'PENDING',
      });
      await settle();

      expect(root().querySelector('[role="dialog"]')).toBeNull();
      expect(TestBed.inject(ToastService).current()).toEqual({ type: 'success', message: 'Your return request has been submitted.' });
      const status = root().querySelector('.tracking__return-status');
      expect(text(status?.querySelector('strong') ?? null)).toBe('Your return request has been submitted.');
      expect(Array.from(status?.querySelectorAll('.tracking__return-meta > span') ?? [], (part) => text(part))).toEqual([
        'Wireless Mosue', 'Return/Refund', 'Refund to: Wallet', 'Reason: Product is unsuitable for my needs', 'Status: Pending',
      ]);
      // Done for this order: no second request from the page.
      const button = root().querySelector<HTMLButtonElement>('.tracking-return-button button')!;
      expect(text(button)).toBe('Return Requested');
      expect(button.disabled).toBe(true);

      // The order's details are read again (only the tracking: the shipping statuses are already loaded).
      http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow()]));
      http.expectNone(SHIPPING_STATUSES_URL);
      await settle();
      expect(root().querySelector('.tracking__return-status')).not.toBeNull();
    });

    it('keeps the dialog open with the API message when the request fails, and lets the customer try again', async () => {
      await openDialog();
      await pick('return-type', 'Return/Replace');
      await pick('return-reason', 'Other');
      await submit();
      http.expectOne(RETURN_REQUEST_URL).flush(
        { STATUS: 'FAILED', message: 'Return request already exists for this order' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(root().querySelector('[role="dialog"]')).not.toBeNull();
      expect(text(root().querySelector('.return-form__submit-error'))).toBe('Return request already exists for this order');
      expect(TestBed.inject(ToastService).current()).toEqual({
        type: 'error', message: 'Return request already exists for this order',
      });
      expect(root().querySelector('.tracking__return-status')).toBeNull();
      http.expectNone(TRACKING_URL);

      // The choices are kept; Submit sends again.
      expect(text(trigger('return-type'))).toBe('Return/Replace');
      await submit();
      http.expectOne(RETURN_REQUEST_URL).flush({ STATUS: 'SUCCESS', RETURN_STATUS_NAME: 'PENDING' });
      await settle();
      expect(root().querySelector('[role="dialog"]')).toBeNull();
      http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow()]));
      await settle();
    });

    it('treats a body that reports a failure as one, even with HTTP 200', async () => {
      await openDialog();
      await pickRefund();
      await pick('return-reason', 'Product is unsuitable for my needs');
      await submit();
      http.expectOne(RETURN_REQUEST_URL).flush({ STATUS: 'FAILED', message: 'Order is not eligible for return' });
      await settle();
      expect(text(root().querySelector('.return-form__submit-error'))).toBe('Order is not eligible for return');
      expect(root().querySelector('[role="dialog"]')).not.toBeNull();
    });

    // CHANGED: the seller and pickup address come from the chosen product's tracking row; without one nothing is sent.
    it('sends nothing and explains why when the chosen product has no tracking row', async () => {
      await openDialog([trackingRow({ PRODUCT_ID: null })]);
      await pick('return-type', 'Return/Replace');
      await pick('return-reason', 'Other');
      await submit();

      http.expectNone(RETURN_REQUEST_URL);
      expect(text(root().querySelector('.return-form__submit-error'))).toBe(
        'This product could not be identified, so it cannot be returned here. Please refresh the page and try again.',
      );
      expect(root().querySelector('[role="dialog"]')).not.toBeNull();
    });

    // CHANGED (new): PICKUP_ADDRESS_ID is the order's DELIVERY_ADDRESS_ID.
    it('sends nothing and explains why when the order has no delivery address ID', async () => {
      await openDialog([trackingRow({ PRODUCT_VARIANT_ID: 3, SELLER_ID: 24, DELIVERY_ADDRESS_ID: null })]);
      await pick('return-type', 'Return/Replace');
      await pick('return-reason', 'Other');
      await submit();

      http.expectNone(RETURN_REQUEST_URL);
      expect(text(root().querySelector('.return-form__submit-error'))).toBe(
        'The pickup address of this order could not be found, so it cannot be returned here.',
      );
    });

    // CHANGED: the product's IDs come from return_dropdown; the seller still comes from its tracking row (no guessed
    // IDs), so a row without SELLER_ID is not sent.
    it('sends nothing when the chosen product\'s tracking row has no SELLER_ID', async () => {
      await openDialog([trackingRow({ PRODUCT_VARIANT_ID: 3 })]);
      await pick('return-type', 'Return/Replace');
      await pick('return-reason', 'Other');
      await submit();

      expect(text(root().querySelector('.return-form__submit-error'))).toBe(
        'This product could not be identified, so it cannot be returned here. Please refresh the page and try again.',
      );
      http.expectNone(RETURN_REQUEST_URL);
    });

    // CHANGED: VARIANT_ID is the chosen product's PRODUCT_VARIANT_ID; a replacement sends REFUND_METHOD null.
    it('sends VARIANT_ID null for a product ordered without a variant, and no refund method for a replacement', async () => {
      await openDialog([trackingRow({ PRODUCT_VARIANT_ID: null, SELLER_ID: 24 })], [productRow({ PRODUCT_VARIANT_ID: null })]);
      await pick('return-type', 'Return/Replace');
      await pick('return-reason', 'Other');
      await submit();

      const request = http.expectOne(RETURN_REQUEST_URL);
      expect(request.request.body).toMatchObject({
        ORDER_ID: 33, PRODUCT_ID: 17, VARIANT_ID: null, SELLER_ID: 24, RETURN_OPTION: 1, REFUND_METHOD: null,
      });
      http.expectNone(REFUND_METHODS_URL);
      request.flush({ STATUS: 'SUCCESS' });
      await settle();
      http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow()]));
      await settle();
    });

    // CHANGED: an order with several products (return_dropdown): only the product chosen is requested, with its own
    // ORDER_ID, PRODUCT_ID and VARIANT_ID, never mixed with another's; nothing is chosen for the customer.
    it('requests only the product chosen from a several-product order, with that product\'s own IDs', async () => {
      const mouse = trackingRow({ PRODUCT_VARIANT_ID: 3, SELLER_ID: 24 });
      const laptop = trackingRow({
        ORDER_ID: 30, PRODUCT_ID: 16, PRODUCT_VARIANT_ID: 25, SELLER_ID: 49, PRODUCT_NAME: 'Lenovo IdeaPad Slim 57',
        SKU: 'SKU0016', QUANTITY: 1, PRICE: '6000.00', SHIPPING_ID: 5, DELIVERY_ADDRESS_ID: 10,
      });
      await openDialog(
        [mouse, laptop],
        [productRow(), productRow({ ORDER_ID: 30, PRODUCT_ID: 16, PRODUCT_VARIANT_ID: 25, PRODUCT_NAME: 'Lenovo IdeaPad Slim 57' })],
      );

      // Nothing chosen: no product card, and Submit asks for the product.
      expect(text(trigger('return-product'))).toBe('Choose the product to return');
      expect(root().querySelector('.return-product')).toBeNull();
      await pick('return-type', 'Return/Replace');
      await pick('return-reason', 'Other');
      await submit();
      expect(Array.from(root().querySelectorAll('.return-form__error'), (error) => text(error))).toEqual([
        'Select the product you want to return.',
      ]);
      expect(trigger('return-product').getAttribute('aria-invalid')).toBe('true');
      http.expectNone(RETURN_REQUEST_URL);

      expect(await dropdownOptions('return-product')).toEqual(['Wireless Mosue', 'Lenovo IdeaPad Slim 57']);
      await pick('return-product', 'Lenovo IdeaPad Slim 57');
      expect(root().querySelector('.return-form__error')).toBeNull();
      // The card: the chosen product, with its tracking row's SKU, quantity and price.
      expect(text(root().querySelector('.return-product__details h3'))).toBe('Lenovo IdeaPad Slim 57');
      expect(text(root().querySelector('.return-product__variant'))).toBe('SKU0016');
      expect(text(root().querySelector('.return-product__quantity'))).toBe('Qty: 1');

      await submit();
      const request = http.expectOne(RETURN_REQUEST_URL);
      expect(request.request.body).toEqual({
        ORDER_NUMBER: 'ORD0016', ORDER_ID: 30, REASON_ID: 20, RETURN_DESCRIPTION: '', RETURN_OPTION: 1,
        PRODUCT_ID: 16, VARIANT_ID: 25, SELLER_ID: 49, PICKUP_ADDRESS_ID: 10, REFUND_METHOD: null,
      });
      request.flush({ STATUS: 'SUCCESS', RETURN_STATUS_NAME: 'PENDING' });
      await settle();
      http.expectOne(TRACKING_URL).flush(trackingResponse([mouse, laptop]));
      await settle();
      expect(text(root().querySelector('.tracking__return-meta'))).toContain('Lenovo IdeaPad Slim 57');

      // The other product can still be returned; the laptop is not offered again. The products and reasons are not
      // read again.
      const button = root().querySelector<HTMLButtonElement>('.tracking-return-button button')!;
      expect(text(button)).toBe('Cancel / Return');
      button.click();
      await settle();
      http.expectNone(RETURN_REASONS_URL);
      http.expectNone(RETURN_PRODUCTS_URL);
      http.expectNone(RETURN_STATUSES_URL);
      expect(await dropdownOptions('return-product')).toEqual(['Wireless Mosue']);
      expect(text(trigger('return-product'))).toBe('Wireless Mosue');
      expect(text(root().querySelector('.return-product__details h3'))).toBe('Wireless Mosue');
      await pickRefund('UPI');
      await pick('return-reason', 'Other');
      await submit();
      const second = http.expectOne(RETURN_REQUEST_URL);
      expect(second.request.body).toMatchObject({
        ORDER_ID: 33, PRODUCT_ID: 17, VARIANT_ID: 3, SELLER_ID: 24, PICKUP_ADDRESS_ID: 1, RETURN_OPTION: 2, REFUND_METHOD: 2,
      });
      second.flush({ STATUS: 'SUCCESS' });
      await settle();
      http.expectOne(TRACKING_URL).flush(trackingResponse([mouse, laptop]));
      await settle();

      // Every product requested: done.
      expect(text(button)).toBe('Return Requested');
      expect(button.disabled).toBe(true);
    });

    // CHANGED (new): Refund Method: shown and required for a refund only, the active methods, read once.
    it('asks for a refund method for a refund only, and requires it', async () => {
      await openDialog();
      await pick('return-type', 'Return/Refund');
      expect(text(root().querySelector('#refund-method')?.closest('.return-form__field')?.querySelector('[role="status"]') ?? null))
        .toBe('Loading refund methods…');
      http.expectOne(REFUND_METHODS_URL).flush(REFUND_METHODS_RESPONSE);
      await settle();
      // Only the active methods.
      expect(await dropdownOptions('refund-method')).toEqual(['Wallet', 'UPI']);

      await pick('return-reason', 'Other');
      await submit();
      expect(Array.from(root().querySelectorAll('.return-form__error'), (error) => text(error))).toEqual([
        'Select a refund method to continue.',
      ]);
      expect(trigger('refund-method').getAttribute('aria-invalid')).toBe('true');
      http.expectNone(RETURN_REQUEST_URL);

      // A replacement needs none (the choice is cleared); back to a refund, the methods are not read again.
      await pick('return-type', 'Return/Replace');
      expect(root().querySelector('#refund-method')).toBeNull();
      expect(root().querySelector('.return-form__error')).toBeNull();
      await pick('return-type', 'Return/Refund');
      http.expectNone(REFUND_METHODS_URL);
      expect(text(trigger('refund-method'))).toBe('Choose how you want to be refunded');
      await pick('refund-method', 'Wallet');
      await submit();
      const request = http.expectOne(RETURN_REQUEST_URL);
      expect(request.request.body).toMatchObject({ RETURN_OPTION: 2, REFUND_METHOD: 3 });
      request.flush({ STATUS: 'SUCCESS' });
      await settle();
      http.expectOne(TRACKING_URL).flush(trackingResponse([trackingRow()]));
      await settle();
    });

    it('offers Try again when the refund methods cannot be loaded', async () => {
      await openDialog();
      await pick('return-type', 'Return/Refund');
      http.expectOne(REFUND_METHODS_URL).flush({ STATUS: 'FAILED', MESSAGE: 'Refund methods are unavailable.' });
      await settle();
      const field = root().querySelector('#refund-method')!.closest('.return-form__field')!;
      expect(text(field.querySelector('.return-form__lookup-error span'))).toBe('Refund methods are unavailable.');
      expect(trigger('refund-method').disabled).toBe(true);
      expect(TestBed.inject(ToastService).current()?.message).toBe('Refund methods are unavailable.');

      field.querySelector<HTMLButtonElement>('.return-form__lookup-error button')!.click();
      fixture.detectChanges();
      http.expectOne(REFUND_METHODS_URL).flush(REFUND_METHODS_RESPONSE);
      await settle();
      expect(field.querySelector('.return-form__lookup-error')).toBeNull();
      expect(await dropdownOptions('refund-method')).toEqual(['Wallet', 'UPI']);
    });

    // CHANGED (new): the Product lookup's failure and empty states.
    it('offers Try again when the order\'s products cannot be loaded, and says when none can be returned', async () => {
      await open([trackingRow({ PRODUCT_VARIANT_ID: 3, SELLER_ID: 24 })]);
      root().querySelector<HTMLButtonElement>('.tracking-return-button button')!.click();
      http.expectOne(RETURN_REASONS_URL).flush(RETURN_REASONS_RESPONSE);
      http.expectOne(RETURN_PRODUCTS_URL).flush('down', { status: 500, statusText: 'Server Error' });
      http.expectOne(RETURN_STATUSES_URL).flush(RETURN_STATUSES_RESPONSE);
      await settle();
      const field = root().querySelector('#return-product')!.closest('.return-form__field')!;
      expect(text(field.querySelector('.return-form__lookup-error span'))).toBe(
        'The products of this order could not be loaded. Please try again.',
      );
      expect(trigger('return-product').disabled).toBe(true);
      expect(root().querySelector('.return-product')).toBeNull();

      field.querySelector<HTMLButtonElement>('.return-form__lookup-error button')!.click();
      fixture.detectChanges();
      http.expectOne(RETURN_PRODUCTS_URL).flush(productsResponse([]));
      await settle();
      expect(text(field.querySelector('.return-form__lookup-empty'))).toBe('No products of this order can be returned.');
      expect(trigger('return-product').disabled).toBe(true);
    });

    // CHANGED: an order with one product has it chosen (repeated tracking rows of its line are fine).
    it('chooses the only product of a one-product order', async () => {
      const row = trackingRow({ PRODUCT_VARIANT_ID: 3, SELLER_ID: 24 });
      await openDialog([row, row, row, row]);
      expect(text(trigger('return-product'))).toBe('Wireless Mosue');
      expect(text(root().querySelector('.return-product__details h3'))).toBe('Wireless Mosue');

      await pick('return-type', 'Return/Replace');
      await pick('return-reason', 'Other');
      await submit();
      http.expectOne(RETURN_REQUEST_URL).flush({ STATUS: 'SUCCESS' });
      await settle();
      http.expectOne(TRACKING_URL).flush(trackingResponse([row, row, row, row]));
      await settle();
      expect(root().querySelector<HTMLButtonElement>('.tracking-return-button button')?.disabled).toBe(true);
    });
  });

  // CHANGED: the return types come from return_status (not the shipping statuses); read again with Try again.
  it('loads the return types again when the return statuses could not be loaded, with Try again', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.tracking-return-button button')!.click();
    http.expectOne(RETURN_REASONS_URL).flush(RETURN_REASONS_RESPONSE);
    http.expectOne(RETURN_PRODUCTS_URL).flush(productsResponse([productRow()]));
    http.expectOne(RETURN_STATUSES_URL).flush({ message: 'Down' }, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(text(root().querySelector('.return-form__lookup-error'))).toContain('Return types could not be loaded. Please try again.');
    expect(trigger('return-type').disabled).toBe(true);

    root().querySelector<HTMLButtonElement>('.return-form__lookup-error button')!.click();
    fixture.detectChanges();
    http.expectOne(RETURN_STATUSES_URL).flush(RETURN_STATUSES_RESPONSE);
    await settle();
    expect(root().querySelector('.return-form__lookup-error')).toBeNull();
    expect(await dropdownOptions('return-type')).toEqual(['Return/Replace', 'Return/Refund']);
    http.expectNone(SHIPPING_STATUSES_URL);
  });

  it('shows an empty state when the API returns no return reasons', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    http.expectOne(RETURN_REASONS_URL).flush({ success: true, message: 'No reasons', data: [] });
    http.expectOne(RETURN_PRODUCTS_URL).flush(productsResponse([productRow()]));
    http.expectOne(RETURN_STATUSES_URL).flush(RETURN_STATUSES_RESPONSE);
    await settle();

    expect(root().querySelector('.return-form__lookup-empty')?.textContent).toContain('No return reasons');
    expect(trigger('return-reason').disabled).toBe(true);
  });

  it('shows a toast on a return-reason failure and allows retrying the lookup', async () => {
    await open();
    root().querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    http.expectOne(RETURN_REASONS_URL).flush({ success: false, message: 'Return reasons are unavailable.', data: [] });
    http.expectOne(RETURN_PRODUCTS_URL).flush(productsResponse([productRow()]));
    http.expectOne(RETURN_STATUSES_URL).flush(RETURN_STATUSES_RESPONSE);
    await settle();

    expect(root().querySelector('.return-form__lookup-error')?.textContent).toContain('Return reasons are unavailable.');
    expect(TestBed.inject(ToastService).current()?.message).toBe('Return reasons are unavailable.');

    root().querySelector<HTMLButtonElement>('.return-form__lookup-error button')!.click();
    fixture.detectChanges();
    http.expectOne(RETURN_REASONS_URL).flush(RETURN_REASONS_RESPONSE);
    await settle();

    expect(root().querySelector('.return-form__lookup-error')).toBeNull();
    expect(await dropdownOptions('return-reason')).toEqual(['Other', 'Product is unsuitable for my needs']);
  });
});
