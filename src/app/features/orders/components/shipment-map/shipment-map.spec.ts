// CHANGED (new): the map card on its own. The tracking page always shows it; it shows each live detail only when the
// tracking API sends it (it does not yet). These checks moved here from the page spec.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipmentTracking } from '@shared/models';
import { ShipmentMap } from './shipment-map';

/** A shipment as the tracking API sends it today: no live GPS details. */
const SHIPMENT: ShipmentTracking = {
  orderId: 'ORD0016',
  placedOn: '2026-11-25',
  carrier: { name: 'BlueDart', code: 'BLU', color: '#e63946', trackingNo: 'TRK001' },
  scheduleStatus: 'On schedule',
  onSchedule: true,
  estimatedDelivery: null,
  steps: [],
  currentStep: 0,
  items: [],
  address: { name: '', phone: '', lines: [] },
};

const LIVE_SHIPMENT: ShipmentTracking = {
  ...SHIPMENT,
  currentLocation: 'Chennai Hub',
  distanceKm: 14.2,
  route: { title: 'En route to Chennai', driver: 'Ramesh K.', vehicle: 'TN-07-BX-4921' },
};

describe('ShipmentMap', () => {
  let fixture: ComponentFixture<ShipmentMap>;
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null = root()): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

  async function render(shipment: ShipmentTracking): Promise<void> {
    await TestBed.configureTestingModule({ imports: [ShipmentMap] }).compileComponents();
    fixture = TestBed.createComponent(ShipmentMap);
    fixture.componentRef.setInput('shipment', shipment);
    await fixture.whenStable();
  }

  it('shows the live location, distance and route', async () => {
    await render(LIVE_SHIPMENT);
    expect(text()).toContain('14.2 km to Destination');
    expect(text()).toContain('Location: Chennai Hub');
    expect(text(root().querySelector('.tracking-map__status p'))).toBe('En route to Chennai Driver: Ramesh K. | Vehicle: TN-07-BX-4921');
    expect(root().querySelector('.tracking-map__route')).not.toBeNull();
    expect(root().querySelector('.tracking-map__stage')?.getAttribute('aria-label')).toBe(
      'Map: package at Chennai Hub, 14.2 km from destination',
    );
  });

  it('toggles the expanded map and closes the map popup', async () => {
    await render(LIVE_SHIPMENT);
    root().querySelector<HTMLButtonElement>('.tracking-map__expand')!.click();
    await fixture.whenStable();
    expect(root().querySelector('.tracking-map')?.classList).toContain('is-expanded');
    root().querySelector<HTMLButtonElement>('.tracking-map__popup button')!.click();
    await fixture.whenStable();
    expect(root().querySelector('.tracking-map__popup')).toBeNull();

    // CHANGED (new): the pin is a labelled button that opens the details again.
    const pin = root().querySelector<HTMLButtonElement>('button.tracking-map__pin')!;
    expect(pin.getAttribute('aria-label')).toBe('Show location of BlueDart');
    expect(pin.getAttribute('aria-expanded')).toBe('false');
    pin.click();
    await fixture.whenStable();
    expect(root().querySelector('.tracking-map__popup')).not.toBeNull();
  });

  // CHANGED (new): the card without live GPS data (what the tracking API sends today).
  it('says the live location is not available, with the carrier and tracking number, and makes nothing up', async () => {
    await render(SHIPMENT);
    expect(text(root().querySelector('.tracking-map__title'))).toBe('Live Route GPS Tracking');
    expect(text(root().querySelector('.tracking-map__status p'))).toBe('Live location not available yet Carrier: BlueDart | Tracking No: TRK001');
    // No distance, route line, vehicle marker or location popup.
    expect(text()).not.toContain('km to Destination');
    expect(root().querySelector('.tracking-map__route')).toBeNull();
    expect(root().querySelector('.tracking-map__pin')).toBeNull();
    expect(root().querySelector('.tracking-map__popup')).toBeNull();
    expect(root().querySelector('.tracking-map__stage')?.getAttribute('aria-label')).toBe('Map: live location not available yet');
  });

  // CHANGED (new): without live data, the title from the shipping status and the delivery address's city.
  it('titles the status bar from the shipping status and the destination city without live data', async () => {
    const address = { name: 'pooja', phone: '9876543210', lines: ['Chennai, Tamil Nadu, India, 600040'], city: 'Chennai' };
    await render({ ...SHIPMENT, shippingStatus: 'IN TRANSIT', address });
    expect(text(root().querySelector('.tracking-map__status strong'))).toBe('En route to Chennai');
    expect(text(root().querySelector('.tracking-map__empty'))).toBe('Live location not available yet');

    fixture.componentRef.setInput('shipment', { ...SHIPMENT, shippingStatus: 'DELIVERED', address });
    await fixture.whenStable();
    expect(text(root().querySelector('.tracking-map__status strong'))).toBe('Delivered in Chennai');

    fixture.componentRef.setInput('shipment', { ...SHIPMENT, shippingStatus: 'PACKED' });
    await fixture.whenStable();
    expect(text(root().querySelector('.tracking-map__status strong'))).toBe('Packed');
  });

  it('shows the live details the API sends, each on its own', async () => {
    await render({ ...SHIPMENT, currentLocation: 'Chennai Hub', route: { vehicle: 'TN-07-BX-4921' } });
    expect(text(root().querySelector('.tracking-map__status p'))).toBe('Currently at Chennai Hub Vehicle: TN-07-BX-4921');
    expect(root().querySelector('.tracking-map__pin')).not.toBeNull();
    expect(text()).not.toContain('km to Destination');
  });

  // CHANGED (new): Refresh asks the page to load the tracking details again.
  it('emits refresh and shows the busy state while the page refreshes', async () => {
    await render(SHIPMENT);
    const refresh = vi.fn();
    fixture.componentInstance.refresh.subscribe(refresh);
    root().querySelector<HTMLButtonElement>('.tracking-refresh button')!.click();
    expect(refresh).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('refreshing', true);
    await fixture.whenStable();
    expect(root().querySelector('.tracking-refresh button')?.getAttribute('aria-busy')).toBe('true');
  });

  // CHANGED (new): a failed Refresh, below the details that stay shown.
  it('shows the Refresh error it is given', async () => {
    await render(SHIPMENT);
    expect(root().querySelector('.tracking-map__error')).toBeNull();
    fixture.componentRef.setInput('error', 'Tracking service unavailable');
    await fixture.whenStable();
    const error = root().querySelector('.tracking-map__error');
    expect(text(error)).toBe('Tracking service unavailable');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(text(root().querySelector('.tracking-map__status p'))).toContain('Live location not available yet');
  });
});
