import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ShipmentTrackingPage } from './shipment-tracking';

async function render(orderId: string): Promise<ComponentFixture<ShipmentTrackingPage>> {
  await TestBed.configureTestingModule({
    imports: [ShipmentTrackingPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: orderId })) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ShipmentTrackingPage);
  await fixture.whenStable();
  return fixture;
}

describe('ShipmentTrackingPage', () => {
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
    await fixture.whenStable();

    expect(root.querySelector('[role="dialog"] h2')?.textContent).toBe('Cancel / Return Item');
    expect(root.querySelector('.return-product__details h3')?.textContent).toContain('Sony WH-1000XM5');
    const itemLines = root.querySelectorAll('.return-product__details > *');
    expect(itemLines[2]?.classList).toContain('return-product__quantity');
    expect(root.querySelector('.return-product__price')?.textContent).toContain('3,499');
    expect(root.querySelector('#return-reason')).not.toBeNull();
  });

  it('requires a return reason, then submits and closes the dialog', async () => {
    const fixture = await render('ORD-569874');
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.btn--outline-danger')!.click();
    await fixture.whenStable();

    root.querySelector<HTMLFormElement>('.return-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();
    expect(root.querySelector('.return-form__error')).not.toBeNull();

    const reason = root.querySelector<HTMLSelectElement>('#return-reason')!;
    reason.value = 'Ordered by mistake';
    reason.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
    root.querySelector<HTMLFormElement>('.return-form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();

    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(root.querySelector('.tracking__notice')?.textContent).toContain('submitted for review');
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
