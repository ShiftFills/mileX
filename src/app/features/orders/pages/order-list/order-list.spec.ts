import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderList } from './order-list';

describe('OrderList', () => {
  let fixture: ComponentFixture<OrderList>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderList],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(OrderList);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders the heading and one card per order in a two-column grid', () => {
    expect(root.querySelector('h1')?.textContent).toContain('My Orders');
    expect(root.querySelectorAll('app-order-card').length).toBe(8);
    expect(root.querySelectorAll('.col-xl-6').length).toBe(8);
  });

  it('hides pagination when every order fits on one page', () => {
    expect(root.querySelector('app-pagination')).toBeNull();
  });
});
