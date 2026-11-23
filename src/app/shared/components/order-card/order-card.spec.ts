import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderSummary } from '@shared/models';
import { OrderCard } from './order-card';

const ORDER: OrderSummary = {
  id: 'ORD-2408',
  placedOn: '18 Apr 2026',
  total: 4980,
  status: 'Delivered',
  statusNote: 'Delivered on 21 Apr 2026',
  trackingNo: '732418563210',
  items: [
    { name: 'Ear Phones', variant: 'Black', quantity: 1, image: '/images/headphones.svg' },
    { name: 'Sneakers', variant: 'White / 42', quantity: 2, image: '/images/sneakers.svg' },
  ],
};

describe('OrderCard', () => {
  let fixture: ComponentFixture<OrderCard>;
  let root: HTMLElement;

  async function render(order: OrderSummary): Promise<void> {
    fixture.componentRef.setInput('order', order);
    await fixture.whenStable();
  }

  // CHANGED: HttpClient (testing) for the card's S3 image service.
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderCard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrderCard);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => http.verify());

  it('shows the order summary, items and status', async () => {
    await render(ORDER);
    expect(root.querySelector('.my-order__id')?.textContent).toContain('#ORD-2408');
    expect(root.querySelector('.my-order__meta')?.textContent).toContain('3 items');
    expect(root.querySelector('.my-order__total')?.textContent?.trim()).toBe('₹4,980');
    expect(root.querySelectorAll('.my-order__item').length).toBe(2);
    expect(root.textContent).toContain('Delivered on 21 Apr 2026');
    expect(root.querySelector('.my-order__tracking-label')?.textContent).toContain('Tracking No:');
    expect(root.querySelector('.my-order__tracking-link')?.textContent).toBe('732418563210');
  });

  it('displays the API order number instead of the numeric order ID', async () => {
    await render({ ...ORDER, id: 'ORD0005', orderId: 15 });

    expect(root.querySelector('.my-order__id')?.textContent).toBe('#ORD0005');
  });

  it('preserves long order numbers in the markup for CSS truncation', async () => {
    const orderNumber = `ORD${'ABC123'.repeat(12)}`;
    await render({ ...ORDER, id: orderNumber, orderId: 123456 });

    expect(root.querySelector('.my-order__id')?.textContent).toBe(`#${orderNumber}`);
    expect(root.querySelector('.my-order__id')?.getAttribute('title')).toBe(orderNumber);
  });

  it('links to the order detail page', async () => {
    await render(ORDER);
    const hrefs = Array.from(root.querySelectorAll('a:not(.my-order__tracking-link)')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/orders/ORD-2408', '/orders/ORD-2408']);
  });

  it('keeps one keyboard/screen-reader link per order; the arrow is an extra pointer target', async () => {
    await render(ORDER);
    const details = root.querySelector('.my-order__link');
    const arrow = root.querySelector('.my-order__chevron');
    expect(details?.getAttribute('aria-label')).toBe('View details for order ORD-2408');
    expect(arrow?.getAttribute('href')).toBe(details?.getAttribute('href'));
    expect(arrow?.getAttribute('tabindex')).toBe('-1');
    expect(arrow?.getAttribute('aria-hidden')).toBe('true');
  });

  it('links the tracking number to the shipment tracking page', async () => {
    await render(ORDER);
    expect(root.querySelector('.my-order__tracking-link')?.getAttribute('href')).toBe('/orders/ORD-2408/tracking');
  });

  it('omits tracking when the order has no tracking number', async () => {
    await render({ ...ORDER, status: 'Processing', trackingNo: '' });
    expect(root.querySelector('.my-order__tracking')).toBeNull();
  });

  // CHANGED (new)
  describe('S3 item images', () => {
    const KEY = 'products/866dea6fc30de9342300a6e901f8df6f.png';
    const SIGNED = `https://milex.s3.amazonaws.com/${KEY}?X-Amz-Signature=first`;
    const S3_ORDER: OrderSummary = {
      ...ORDER,
      items: [
        { productId: 16, name: 'Lenovo IdeaPad Slim 5', quantity: 1, imageKey: KEY },
        { productId: 17, name: 'Ear Buds', quantity: 1 },
      ],
    };
    const itemImage = (index: number): Element | null =>
      root.querySelectorAll('.my-order__item')[index]?.querySelector('img, [role="img"]') ?? null;

    it('shows the signed URL of an S3 key, with an empty image box while it loads', async () => {
      await render(S3_ORDER);
      const request = http.expectOne(`/api/s3/images/${KEY}`);
      expect(request.request.method).toBe('GET');
      expect(itemImage(0)?.getAttribute('aria-label')).toBe('Loading image of Lenovo IdeaPad Slim 5');
      expect(root.querySelector(`img[src="/${KEY}"]`)).toBeNull();

      request.flush({ success: true, imageKey: KEY, imageUrl: SIGNED, expiresIn: 3600 });
      await fixture.whenStable();
      expect(itemImage(0)?.getAttribute('src')).toBe(SIGNED);
      // An item without any image still shows none.
      expect(itemImage(1)).toBeNull();
    });

    it('gets one fresh URL when the image fails to display, then shows the empty image box', async () => {
      await render(S3_ORDER);
      http.expectOne(`/api/s3/images/${KEY}`).flush({ success: true, imageKey: KEY, imageUrl: SIGNED, expiresIn: 3600 });
      await fixture.whenStable();

      itemImage(0)!.dispatchEvent(new Event('error'));
      await fixture.whenStable();
      const renewed = SIGNED.replace('first', 'second');
      http.expectOne(`/api/s3/images/${KEY}`).flush({ success: true, imageKey: KEY, imageUrl: renewed, expiresIn: 3600 });
      await fixture.whenStable();
      expect(itemImage(0)?.getAttribute('src')).toBe(renewed);

      itemImage(0)!.dispatchEvent(new Event('error'));
      await fixture.whenStable();
      http.expectNone(`/api/s3/images/${KEY}`);
      expect(itemImage(0)?.tagName).toBe('SPAN');
      expect(itemImage(0)?.getAttribute('aria-label')).toBe('No image for Lenovo IdeaPad Slim 5');
    });

    it('shows the empty image box when the signed URL cannot be loaded', async () => {
      await render(S3_ORDER);
      http.expectOne(`/api/s3/images/${KEY}`).flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      await fixture.whenStable();
      expect(itemImage(0)?.getAttribute('aria-label')).toBe('No image for Lenovo IdeaPad Slim 5');
    });
  });
});
