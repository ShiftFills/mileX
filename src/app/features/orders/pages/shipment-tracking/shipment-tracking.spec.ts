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

function loadReturnReasons(http: HttpTestingController, response = RETURN_REASONS_RESPONSE): void {
  http.expectOne(RETURN_REASONS_URL).flush(response);
}

describe('ShipmentTrackingPage', () => {
  let http: HttpTestingController;

  async function render(orderId: string): Promise<ComponentFixture<ShipmentTrackingPage>> {
    await TestBed.configureTestingModule({
      imports: [ShipmentTrackingPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: orderId })) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ShipmentTrackingPage);
    await fixture.whenStable();
    return fixture;
  }

  afterEach(() => {
    http.verify();
    TestBed.inject(ToastService).dismiss();
  });

  it('shows order, carrier, timeline, package and payment details', async () => {
    const fixture = await render('ORD-569874');
    const root: HTMLElement = fixture.nativeElement;
    const text = root.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain('ORD-569874');
    expect(text).toContain('TRK1234567890');
    expect(text).toContain('Monday, Sep 28, 2026');
    expect(text).toContain('Package Content ( 2 items )');
    expect(text).toContain('₹3,698.99');
    expect(text).toContain('Visa ending in 4242');
    expect(root.querySelectorAll('.stepper__step').length).toBe(5);
    expect(root.querySelector('.stepper__step.is-current')?.textContent).toContain('In Transit');
  });

  it('resolves orders from the order history', async () => {
    const fixture = await render('ORD-2408');
    expect(fixture.nativeElement.textContent).toContain('ORD-2408');
  });

  it('shows a not-found state for an unknown order', async () => {
    const fixture = await render('NOPE-1');
    expect(fixture.nativeElement.textContent).toContain("We couldn't find that shipment");
  });

  it('opens the cancel / return dialog with the shipment item', async () => {
    const fixture = await render('ORD-569874');
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    fixture.detectChanges();
    expect(root.querySelector('.return-form__lookup-state')).not.toBeNull();
    const request = http.expectOne(RETURN_REASONS_URL);
    expect(request.request.method).toBe('GET');
    request.flush(RETURN_REASONS_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('[role="dialog"] h2')?.textContent).toBe('Cancel / Return Item');
    expect(root.querySelector('.return-product__details h3')?.textContent).toContain('Sony WH-1000XM5');
    const itemLines = root.querySelectorAll('.return-product__details > *');
    expect(itemLines[2]?.classList).toContain('return-product__quantity');
    expect(root.querySelector('.return-product__price')?.textContent).toContain('3,499');
    const reasonSelect = root.querySelector<HTMLSelectElement>('#return-reason')!;
    expect(reasonSelect.disabled).toBe(false);
    expect(Array.from(reasonSelect.options).map((option) => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'Choose a reason'],
      ['20', 'Other'],
      ['19', 'Product is unsuitable for my needs'],
    ]);
  });

  it('requires a return reason, then submits and closes the dialog', async () => {
    const fixture = await render('ORD-569874');
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    loadReturnReasons(http);
    await fixture.whenStable();
    fixture.detectChanges();

    root.querySelector<HTMLFormElement>('.return-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(root.querySelector('.return-form__error')).not.toBeNull();

    const reason = root.querySelector<HTMLSelectElement>('#return-reason')!;
    reason.value = '19';
    reason.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    root.querySelector<HTMLFormElement>('.return-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();

    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('.tracking__notice')?.textContent).toContain('submitted for review');
    http.expectNone((request) => request.method === 'POST');
  });

  it('shows an empty state when the API returns no return reasons', async () => {
    const fixture = await render('ORD-569874');
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    loadReturnReasons(http, { success: true, message: 'No reasons', data: [] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.return-form__lookup-empty')?.textContent).toContain('No return reasons');
    expect(root.querySelector<HTMLSelectElement>('#return-reason')?.disabled).toBe(true);
  });

  it('shows a toast on API failure and allows retrying the lookup', async () => {
    const fixture = await render('ORD-569874');
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    http.expectOne(RETURN_REASONS_URL).flush({
      success: false,
      message: 'Return reasons are unavailable.',
      data: [],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.return-form__lookup-error')?.textContent).toContain('Return reasons are unavailable.');
    expect(TestBed.inject(ToastService).current()?.message).toBe('Return reasons are unavailable.');

    root.querySelector<HTMLButtonElement>('.return-form__lookup-error button')!.click();
    fixture.detectChanges();
    loadReturnReasons(http);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.return-form__lookup-error')).toBeNull();
    expect(root.querySelector<HTMLSelectElement>('#return-reason')?.options.length).toBe(3);
  });

  it('toggles the expanded map and closes the map popup', async () => {
    const fixture = await render('ORD-569874');
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.tracking-map__expand')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.tracking-map')?.classList).toContain('is-expanded');
    root.querySelector<HTMLButtonElement>('.tracking-map__popup button')!.click();
    await fixture.whenStable();
    expect(root.querySelector('.tracking-map__popup')).toBeNull();
  });
});
