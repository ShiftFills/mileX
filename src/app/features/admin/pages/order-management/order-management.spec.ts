import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastService } from '@core/services/toast.service';
import { StatusOption } from '@shared/models/api.model';
import { SellerVerificationService } from '@features/admin/services/seller-verification.service';
import { OrderManagementCounts, OrderManagementOrder, OrderService } from '@features/orders/services/order.service';
import { of } from 'rxjs';
import { OrderManagement } from './order-management';

const orderStatuses: StatusOption[] = [
  { id: 1, label: 'CONFIRMED' },
  { id: 2, label: 'PROCESSING' },
];
const paymentStatuses: StatusOption[] = [
  { id: 1, label: 'PAID' },
  { id: 2, label: 'PENDING' },
  { id: 3, label: 'FAILED' },
];
const shippingStatuses: StatusOption[] = [
  { id: 1, label: 'SHIPPED' },
  { id: 2, label: 'NOT SHIPPED' },
];
const orderCounts: OrderManagementCounts = {
  totalOrders: 4,
  totalRevenue: 6000,
  pendingOrders: 0,
  shippedOrders: 4,
  deliveredOrders: 0,
};

function makeOrder(id: number, paymentStatusId = 1): OrderManagementOrder {
  return {
    id,
    orderNo: `ORD-${id}`,
    orderDate: '2026-10-28',
    customer: id === 1 ? 'Ravi Kumar' : `Customer ${id}`,
    mobile: `98765432${String(id).padStart(2, '0')}`,
    productId: id,
    quantity: 2,
    amount: 1500,
    paymentStatusId,
    orderStatusId: 1,
    shippingStatusId: 1,
  };
}

describe('OrderManagement', () => {
  let fixture: ComponentFixture<OrderManagement>;
  let root: HTMLElement;
  let orderService: {
    getOrderStatuses: ReturnType<typeof vi.fn>;
    getPaymentStatuses: ReturnType<typeof vi.fn>;
    getShippingStatuses: ReturnType<typeof vi.fn>;
    getManagementOrders: ReturnType<typeof vi.fn>;
    getManagementCounts: ReturnType<typeof vi.fn>;
  };
  let dateFilterService: { getDateFilters: ReturnType<typeof vi.fn> };
  let toast: { showError: ReturnType<typeof vi.fn>; showSuccess: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    orderService = {
      getOrderStatuses: vi.fn(() => of(orderStatuses)),
      getPaymentStatuses: vi.fn(() => of(paymentStatuses)),
      getShippingStatuses: vi.fn(() => of(shippingStatuses)),
      getManagementOrders: vi.fn(() =>
        of([makeOrder(1, 3), ...Array.from({ length: 6 }, (_, index) => makeOrder(index + 2))]),
      ),
      getManagementCounts: vi.fn(() => of(orderCounts)),
    };
    dateFilterService = {
      getDateFilters: vi.fn(() =>
        of([
          { id: 10, label: 'Last 7 days', days: 7 },
          { id: 11, label: 'Last 30 days', days: 30 },
          { id: 12, label: 'Last 90 days', days: 90 },
          { id: 13, label: 'Last 12 months', days: 365 },
        ]),
      ),
    };
    toast = { showError: vi.fn(), showSuccess: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [OrderManagement],
      providers: [
        { provide: OrderService, useValue: orderService },
        { provide: SellerVerificationService, useValue: dateFilterService },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OrderManagement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders API orders, lookup options and the required default filters', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Order Management');
    expect(root.querySelectorAll('app-stat-card').length).toBe(5);
    expect(
      Array.from(root.querySelectorAll('.stat-card__value')).map((value) =>
        value.textContent?.replace(/\s/g, ''),
      ),
    ).toEqual(['4', '₹6,000', '0', '4', '0']);
    expect(root.querySelectorAll('tbody tr').length).toBe(6);
    const displayedStatuses = Array.from(root.querySelectorAll('tbody app-badge')).map((badge) =>
      badge.textContent?.trim(),
    );
    expect(displayedStatuses).toContain('CONFIRMED');
    expect(displayedStatuses).toContain('PAID');
    expect(displayedStatuses).toContain('SHIPPED');
    expect(root.querySelector('#admin-order-payment option')?.textContent?.trim()).toBe(
      'All Payment Status',
    );
    expect(
      (root.querySelector('#admin-order-payment option') as HTMLOptionElement).value,
    ).toBe('-1');
    expect(Array.from(root.querySelectorAll('#admin-order-payment option')).map((option) => option.textContent?.trim()))
      .toContain('FAILED');
    const dateOptions = Array.from(root.querySelectorAll('#order-date-range option'));
    expect(dateOptions.map((option) => option.textContent?.trim())).toEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'Last 12 months',
    ]);
    expect((root.querySelector('#order-date-range') as HTMLSelectElement).value).toBe('10');
    expect(dateFilterService.getDateFilters).toHaveBeenCalledOnce();
    expect(orderService.getManagementOrders).toHaveBeenCalledOnce();
    expect(orderService.getManagementOrders).toHaveBeenCalledWith({
      DAYS: 7,
      ORDER_STATUS: 1,
      PAYMENT_STATUS: -1,
      SHIPPING_STATUS: -1,
    });
    expect(orderService.getManagementCounts).toHaveBeenCalledOnce();
    expect(orderService.getManagementCounts).toHaveBeenCalledWith(7);
  });

  it('filters API rows by search text', async () => {
    const input = root.querySelector('#admin-order-search') as HTMLInputElement;
    input.value = 'Ravi';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelectorAll('tbody tr').length).toBe(1);
    expect(root.querySelector('tbody')?.textContent).toContain('Ravi Kumar');
  });

  it('sends selected lookup IDs while retaining the other filter values', async () => {
    const paymentSelect = root.querySelector('#admin-order-payment') as HTMLSelectElement;
    paymentSelect.value = '3';
    paymentSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(orderService.getManagementOrders).toHaveBeenLastCalledWith({
      DAYS: 7,
      ORDER_STATUS: 1,
      PAYMENT_STATUS: 3,
      SHIPPING_STATUS: -1,
    });
    expect(orderService.getManagementCounts).toHaveBeenCalledOnce();
    const badges = Array.from(root.querySelectorAll('tbody app-badge')).map((badge) =>
      badge.textContent?.trim(),
    );
    expect(badges).toContain('FAILED');
  });

  it('updates the date and other status filters together', async () => {
    const dateSelect = root.querySelector('#order-date-range') as HTMLSelectElement;
    dateSelect.value = '11';
    dateSelect.dispatchEvent(new Event('change'));
    const orderSelect = root.querySelector('#admin-order-status') as HTMLSelectElement;
    orderSelect.value = '2';
    orderSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(orderService.getManagementOrders).toHaveBeenLastCalledWith({
      DAYS: 30,
      ORDER_STATUS: 2,
      PAYMENT_STATUS: -1,
      SHIPPING_STATUS: -1,
    });
    expect(orderService.getManagementCounts).toHaveBeenCalledTimes(2);
    expect(orderService.getManagementCounts).toHaveBeenLastCalledWith(30);
  });
});
