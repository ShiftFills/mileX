import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyOrders } from './my-orders';

describe('MyOrders', () => {
  let fixture: ComponentFixture<MyOrders>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyOrders],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(MyOrders);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders four order cards with their items and status', () => {
    expect(root.querySelector('h1')?.textContent).toContain('My Orders');
    const cards = root.querySelectorAll('.my-order');
    expect(cards.length).toBe(4);
    const first = cards[0] as HTMLElement;
    expect(first.textContent).toContain('Ear Phones');
    expect(first.textContent).toContain('Sneakers');
    expect(first.textContent).toContain('Delivered');
    expect(first.textContent).toContain('Tracking No: 732418563210');
  });

  it('links each order to its detail page', () => {
    const link = root.querySelector('.my-order__link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/orders/ORD-2408');
  });

  it('moves to the next page of orders', async () => {
    const next = root.querySelector('button[aria-label="Next page"]') as HTMLButtonElement;
    next.click();
    await fixture.whenStable();
    expect(root.querySelector('.my-order__id')?.textContent).toContain('ORD-2412');
  });
});
