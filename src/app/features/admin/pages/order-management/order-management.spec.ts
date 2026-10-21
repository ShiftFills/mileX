import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrderManagement } from './order-management';

describe('OrderManagement', () => {
  let fixture: ComponentFixture<OrderManagement>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [OrderManagement] }).compileComponents();
    fixture = TestBed.createComponent(OrderManagement);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders the heading, five summary cards and the first page of orders', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Order Management');
    expect(root.querySelectorAll('app-stat-card').length).toBe(5);
    expect(root.querySelectorAll('tbody tr').length).toBe(6);
  });

  it('filters rows by search text', async () => {
    const input = root.querySelector('#admin-order-search') as HTMLInputElement;
    input.value = '#ORD-2403';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('filters rows by payment status', async () => {
    const select = root.querySelector('#admin-order-payment') as HTMLSelectElement;
    select.value = 'Failed';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const badges = Array.from(root.querySelectorAll('tbody app-badge')).map((badge) => badge.textContent?.trim());
    expect(badges).toContain('Failed');
    expect(badges).not.toContain('Paid');
  });
});
