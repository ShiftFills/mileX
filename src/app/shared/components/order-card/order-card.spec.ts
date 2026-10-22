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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderCard],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(OrderCard);
    root = fixture.nativeElement as HTMLElement;
  });

  it('shows the order summary, items and status', async () => {
    await render(ORDER);
    expect(root.querySelector('.my-order__id')?.textContent).toContain('#ORD-2408');
    expect(root.querySelector('.my-order__meta')?.textContent).toContain('3 items');
    expect(root.querySelector('.my-order__total')?.textContent?.trim()).toBe('₹4,980');
    expect(root.querySelectorAll('.my-order__item').length).toBe(2);
    expect(root.textContent).toContain('Delivered on 21 Apr 2026');
    expect(root.textContent).toContain('Tracking No: 732418563210');
  });

  it('links to the order detail page', async () => {
    await render(ORDER);
    const hrefs = Array.from(root.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/orders/ORD-2408', '/orders/ORD-2408']);
  });

  it('omits tracking when the order has no tracking number', async () => {
    await render({ ...ORDER, status: 'Processing', trackingNo: '' });
    expect(root.querySelector('.my-order__tracking')).toBeNull();
  });
});
