import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { StatusOption } from '@shared/models/api.model';
import { SellerVerificationService } from '@features/admin/services/seller-verification.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import {
  OrderManagementCounts,
  OrderManagementOrder,
  OrderManagementPage,
  OrderService,
} from '@features/orders/services/order.service';
import { NEVER, Subject, of, throwError } from 'rxjs';
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
    productName: null,
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
    getSellerManagementOrders: ReturnType<typeof vi.fn>;
    getManagementCounts: ReturnType<typeof vi.fn>;
    // CHANGED (new): PUT place_order/update.
    updateOrderStatus: ReturnType<typeof vi.fn>;
    orderUpdateErrorMessage: ReturnType<typeof vi.fn>;
  };
  let dateFilterService: { getDateFilters: ReturnType<typeof vi.fn> };
  let toast: { showError: ReturnType<typeof vi.fn>; showSuccess: ReturnType<typeof vi.fn> };
  // CHANGED (new): the screen picks the Admin or Seller request from the logged-in role (Admin by default).
  let userType: string;
  let sellerOnboarding: { getCurrentSellerId: ReturnType<typeof vi.fn> };

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(OrderManagement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    userType = 'ADMIN';
    sellerOnboarding = { getCurrentSellerId: vi.fn(() => of(24)) };
    orderService = {
      getOrderStatuses: vi.fn(() => of(orderStatuses)),
      getPaymentStatuses: vi.fn(() => of(paymentStatuses)),
      getShippingStatuses: vi.fn(() => of(shippingStatuses)),
      getManagementOrders: vi.fn(() =>
        of([makeOrder(1, 3), ...Array.from({ length: 6 }, (_, index) => makeOrder(index + 2))]),
      ),
      getSellerManagementOrders: vi.fn(),
      getManagementCounts: vi.fn(() => of(orderCounts)),
      updateOrderStatus: vi.fn(() => of('Order updated successfully')),
      orderUpdateErrorMessage: vi.fn((error: unknown) =>
        error instanceof Error ? error.message : 'The order could not be updated.',
      ),
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
        { provide: AuthService, useValue: { user: () => ({ userType }) } },
        { provide: SellerOnboardingService, useValue: sellerOnboarding },
      ],
    }).compileComponents();
    await render();
  });

  // CHANGED: the Admin starts on every order status (-1); it was status 1.
  it('keeps the Admin requests, starts on every order status and never resolves a seller', () => {
    expect(orderService.getSellerManagementOrders).not.toHaveBeenCalled();
    expect(sellerOnboarding.getCurrentSellerId).not.toHaveBeenCalled();
    expect((root.querySelector('#admin-order-status') as HTMLSelectElement).value).toBe('-1');
    expect(root.querySelector('#admin-order-status option')?.textContent?.trim()).toBe('All Order Status');
    expect(root.querySelector('.pagination__summary')?.textContent).toContain('7 orders');
  });

  it('renders API orders, lookup options and the required default filters', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Order Management');
    expect(root.querySelectorAll('app-stat-card').length).toBe(5);
    expect(
      Array.from(root.querySelectorAll('.stat-card__value')).map((value) =>
        value.textContent?.replace(/\s/g, ''),
      ),
    ).toEqual(['4', '₹6,000', '0', '4', '0']);
    // CHANGED: no made-up trend figures on the cards (the APIs send none).
    expect(root.querySelector('.stat-card__trend')).toBeNull();
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
    // CHANGED: DAYS=7 and -1 for all three statuses.
    expect(orderService.getManagementOrders).toHaveBeenCalledWith({
      DAYS: 7,
      ORDER_STATUS: -1,
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
      ORDER_STATUS: -1,
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

  // CHANGED (new): sorting, readable dates and Clear filters.
  describe('table', () => {
    async function renderOrders(orders: OrderManagementOrder[]): Promise<void> {
      fixture.destroy();
      orderService.getManagementOrders.mockReturnValue(of(orders));
      await render();
    }

    const orderNumbers = (): string[] =>
      Array.from(root.querySelectorAll('tbody .order-no-link')).map((cell) => cell.textContent?.trim() ?? '');

    it('shows ORDER_DATE as a readable date', async () => {
      await renderOrders([{ ...makeOrder(1), orderDate: '2026-11-16T06:50:51.000Z' }]);
      const dateCell = root.querySelectorAll('tbody tr td')[2];
      expect(dateCell.textContent).toMatch(/^\s*\d{2} Nov 2026, \d{1,2}:\d{2} (AM|PM)\s*$/);
    });

    it('sorts every page by order amount and date, ascending then descending', async () => {
      await renderOrders([
        { ...makeOrder(1), amount: 300, orderDate: '2026-11-02T10:00:00.000Z' },
        { ...makeOrder(2), amount: 100, orderDate: '2026-11-03T10:00:00.000Z' },
        { ...makeOrder(3), amount: null, orderDate: '2026-11-01T10:00:00.000Z' },
        { ...makeOrder(4), amount: 200, orderDate: '2026-11-04T10:00:00.000Z' },
      ]);
      const sortButton = (label: string): HTMLButtonElement =>
        root.querySelector(`th button.order-sort[aria-label^="Sort by ${label}"]`) as HTMLButtonElement;

      sortButton('Order Amount').click();
      await settle();
      // An order without an amount stays last.
      expect(orderNumbers()).toEqual(['ORD-2', 'ORD-4', 'ORD-1', 'ORD-3']);
      expect(sortButton('Order Amount').getAttribute('aria-label')).toBe('Sort by Order Amount, sorted ascending');

      sortButton('Order Amount').click();
      await settle();
      expect(orderNumbers()).toEqual(['ORD-1', 'ORD-4', 'ORD-2', 'ORD-3']);

      sortButton('Order Date').click();
      await settle();
      expect(orderNumbers()).toEqual(['ORD-3', 'ORD-1', 'ORD-2', 'ORD-4']);
    });

    it('clears the search and the status filters back to every status', async () => {
      const paymentSelect = root.querySelector('#admin-order-payment') as HTMLSelectElement;
      paymentSelect.value = '3';
      paymentSelect.dispatchEvent(new Event('change'));
      await settle();
      expect(root.querySelector('.order-clear-filters')).not.toBeNull();

      (root.querySelector('.order-clear-filters') as HTMLButtonElement).click();
      await settle();

      expect(orderService.getManagementOrders).toHaveBeenLastCalledWith({
        DAYS: 7, ORDER_STATUS: -1, PAYMENT_STATUS: -1, SHIPPING_STATUS: -1,
      });
      expect((root.querySelector('#admin-order-payment') as HTMLSelectElement).value).toBe('-1');
      expect(root.querySelector('.order-clear-filters')).toBeNull();
    });
  });

  // CHANGED (new): the order details dialog and PUT place_order/update (Admin).
  describe('order details and status update', () => {
    const dialog = (): HTMLElement | null => root.querySelector('.order-dialog');
    const select = (id: string): HTMLSelectElement => root.querySelector(`#${id}`) as HTMLSelectElement;
    const updateButton = (): HTMLButtonElement =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('.order-dialog__actions button'))
        .find((button) => button.textContent?.includes('Update') || button.textContent?.includes('Updating'))!;
    const rowOf = (orderNo: string): HTMLElement =>
      Array.from(root.querySelectorAll<HTMLElement>('tbody tr'))
        .find((row) => row.querySelector('.order-no-link')?.textContent?.trim() === orderNo)!;

    async function openOrder(orderNo: string): Promise<void> {
      (rowOf(orderNo).querySelector('.order-action') as HTMLButtonElement).click();
      await settle();
    }

    async function choose(id: string, value: string): Promise<void> {
      select(id).value = value;
      select(id).dispatchEvent(new Event('change'));
      await settle();
    }

    it('opens from the row with the order\'s details and its current statuses selected', async () => {
      expect(rowOf('ORD-1').querySelector('.order-action')?.getAttribute('aria-label')).toBe('Manage order ORD-1');
      await openOrder('ORD-1');

      expect(dialog()?.getAttribute('role')).toBe('dialog');
      expect(dialog()?.querySelector('h2')?.textContent).toContain('Order ORD-1');
      expect(dialog()?.textContent).toContain('Ravi Kumar');
      expect(dialog()?.textContent).toContain('₹1,500.00');
      // ORD-1: order status 1 (CONFIRMED), payment status 3 (FAILED), shipping status 1 (SHIPPED).
      expect(select('update-order-status').value).toBe('1');
      expect(select('update-payment-status').value).toBe('3');
      expect(select('update-shipping-status').value).toBe('1');
      // The options and IDs come from the status lookups.
      expect(Array.from(select('update-payment-status').options).map((option) => [option.value, option.textContent?.trim()]))
        .toEqual([['', 'Select payment status'], ['1', 'PAID'], ['2', 'PENDING'], ['3', 'FAILED']]);
      // Nothing changed yet: nothing to save.
      expect(updateButton().disabled).toBe(true);
      expect(dialog()?.textContent).toContain('Change a status to update this order.');
    });

    it('sends ORDER_ID with the three selected status IDs, then shows a toast and the new statuses', async () => {
      await openOrder('ORD-1');
      await choose('update-order-status', '2');
      await choose('update-payment-status', '1');
      await choose('update-shipping-status', '2');
      expect(updateButton().disabled).toBe(false);
      // The list reload after the update stays pending here, so the row shows the update itself.
      orderService.getManagementOrders.mockReturnValue(NEVER);
      const listCalls = orderService.getManagementOrders.mock.calls.length;

      updateButton().click();
      await settle();

      expect(orderService.updateOrderStatus).toHaveBeenCalledOnce();
      expect(orderService.updateOrderStatus).toHaveBeenCalledWith({
        ORDER_ID: 1, ORDER_STATUS: 2, PAYMENT_STATUS: 1, SHIPPING_STATUS: 2,
      });
      expect(toast.showSuccess).toHaveBeenCalledWith('Order updated successfully');
      expect(dialog()).toBeNull();
      const badges = Array.from(rowOf('ORD-1').querySelectorAll('app-badge')).map((badge) => badge.textContent?.trim());
      expect(badges).toEqual(['PAID', 'PROCESSING', 'NOT SHIPPED']);
      // The list and the counts are read again, and the table stays on screen meanwhile.
      expect(orderService.getManagementOrders).toHaveBeenCalledTimes(listCalls + 1);
      expect(orderService.getManagementCounts).toHaveBeenCalledTimes(2);
      expect(root.querySelector('app-table')).not.toBeNull();
    });

    it('sends one request however often Update is clicked, and keeps the dialog open until it is answered', async () => {
      const response = new Subject<string>();
      orderService.updateOrderStatus.mockReturnValue(response);
      await openOrder('ORD-1');
      await choose('update-shipping-status', '2');

      updateButton().click();
      await settle();
      updateButton().click();
      await settle();
      expect(orderService.updateOrderStatus).toHaveBeenCalledOnce();
      expect(updateButton().getAttribute('aria-busy')).toBe('true');
      expect(updateButton().textContent).toContain('Updating…');
      expect(select('update-shipping-status').disabled).toBe(true);
      expect((root.querySelector('.order-dialog__close') as HTMLButtonElement).disabled).toBe(true);
      // Clicking outside does not close it while the update runs.
      (root.querySelector('app-dialog .dialog-backdrop') as HTMLElement).click();
      await settle();
      expect(dialog()).not.toBeNull();

      response.error(new Error('Invalid shipping status'));
      await settle();

      // Failed: the dialog stays open with the reason, and the form can be sent again.
      expect(dialog()).not.toBeNull();
      expect(dialog()?.querySelector('.order-dialog__error')?.textContent).toContain('Invalid shipping status');
      expect(toast.showError).toHaveBeenCalledWith('Invalid shipping status');
      expect(updateButton().disabled).toBe(false);
      expect(toast.showSuccess).not.toHaveBeenCalled();
      // The row keeps its statuses.
      expect(Array.from(rowOf('ORD-1').querySelectorAll('app-badge')).map((badge) => badge.textContent?.trim()))
        .toEqual(['FAILED', 'CONFIRMED', 'SHIPPED']);
    });

    it('requires every status: an order without one cannot be saved until it is chosen', async () => {
      fixture.destroy();
      orderService.getManagementOrders.mockReturnValue(of([{ ...makeOrder(1), shippingStatusId: null }]));
      await render();
      await openOrder('ORD-1');

      expect(select('update-shipping-status').value).toBe('');
      expect(updateButton().disabled).toBe(true);
      expect(dialog()?.textContent).toContain('Select an order, payment and shipping status.');

      await choose('update-shipping-status', '1');
      expect(updateButton().disabled).toBe(false);
    });

    it('closes with Cancel without sending anything', async () => {
      await openOrder('ORD-2');
      await choose('update-order-status', '2');
      Array.from(root.querySelectorAll<HTMLButtonElement>('.order-dialog__actions button'))
        .find((button) => button.textContent?.includes('Cancel'))!.click();
      await settle();

      expect(dialog()).toBeNull();
      expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
    });
  });

  // CHANGED (new): Seller login uses the SELLER_ID order dashboard API with API search, filters and paging.
  describe('for a Seller login', () => {
    const sellerCounts: OrderManagementCounts = {
      totalOrders: 25,
      totalRevenue: 48000,
      pendingOrders: 5,
      shippedOrders: 12,
      deliveredOrders: 8,
    };

    function sellerPage(firstId: number, totalRecords = 25): OrderManagementPage {
      return {
        orders: Array.from({ length: 10 }, (_, index) => ({
          ...makeOrder(firstId + index),
          productName: `Seller product ${firstId + index}`,
        })),
        totalRecords,
        counts: sellerCounts,
      };
    }

    const firstRequest = {
      SELLER_ID: 24,
      DAYS: 30,
      SEARCH: '',
      ORDER_STATUS: -1,
      PAYMENT_STATUS: -1,
      SHIPPING_STATUS: -1,
      LIMIT: 10,
      OFFSET: 0,
    };

    beforeEach(async () => {
      fixture.destroy();
      vi.clearAllMocks();
      userType = 'SELLER';
      orderService.getSellerManagementOrders.mockImplementation(
        (query: { OFFSET: number }) => of(sellerPage(query.OFFSET + 1)),
      );
      await render();
    });

    function clickNextPage(): void {
      (root.querySelector('nav[aria-label="Order pages"] button[aria-label="Next page"]') as HTMLButtonElement).click();
    }

    it('loads the seller\'s orders with SELLER_ID, 30 days, all statuses and the first page of 10', () => {
      expect(sellerOnboarding.getCurrentSellerId).toHaveBeenCalled();
      expect(orderService.getSellerManagementOrders).toHaveBeenCalledOnce();
      expect(orderService.getSellerManagementOrders).toHaveBeenCalledWith(firstRequest);
      expect(orderService.getManagementOrders).not.toHaveBeenCalled();
      expect(orderService.getManagementCounts).not.toHaveBeenCalled();
      expect((root.querySelector('#order-date-range') as HTMLSelectElement).value).toBe('11');
      expect((root.querySelector('#admin-order-status') as HTMLSelectElement).value).toBe('-1');
    });

    it('shows the summary cards from the dashboard and the rows from data', () => {
      expect(
        Array.from(root.querySelectorAll('.stat-card__value')).map((value) => value.textContent?.replace(/\s/g, '')),
      ).toEqual(['25', '₹48,000', '5', '12', '8']);
      expect(root.querySelectorAll('tbody tr').length).toBe(10);
      expect(root.querySelector('tbody')?.textContent).toContain('Seller product 1');
      expect(root.querySelector('.pagination__summary')?.textContent).toContain('25 orders');
    });

    it('requests the next page from the API with the matching OFFSET', async () => {
      clickNextPage();
      await settle();

      expect(orderService.getSellerManagementOrders).toHaveBeenLastCalledWith({ ...firstRequest, OFFSET: 10 });
      // All 10 API rows of page 2 are shown as returned (ORD-11 … ORD-20), not sliced again in the browser.
      expect(root.querySelectorAll('tbody tr').length).toBe(10);
      expect(root.querySelector('tbody')?.textContent).toContain('ORD-20');
      expect(root.querySelector('.pagination__summary')?.textContent).toContain('11–20');
    });

    it('sends changed date and status filters and restarts at the first page', async () => {
      clickNextPage();
      await settle();

      const dateSelect = root.querySelector('#order-date-range') as HTMLSelectElement;
      dateSelect.value = '12';
      dateSelect.dispatchEvent(new Event('change'));
      const paymentSelect = root.querySelector('#admin-order-payment') as HTMLSelectElement;
      paymentSelect.value = '3';
      paymentSelect.dispatchEvent(new Event('change'));
      await settle();

      expect(orderService.getSellerManagementOrders).toHaveBeenLastCalledWith({
        ...firstRequest,
        DAYS: 90,
        PAYMENT_STATUS: 3,
        OFFSET: 0,
      });
      expect(orderService.getManagementCounts).not.toHaveBeenCalled();
    });

    it('sends the search text to the API once typing pauses and shows the API rows unfiltered', async () => {
      clickNextPage();
      await settle();
      const callsBeforeSearch = orderService.getSellerManagementOrders.mock.calls.length;

      const input = root.querySelector('#admin-order-search') as HTMLInputElement;
      input.value = 'pooja';
      input.dispatchEvent(new Event('input'));
      await settle();
      expect(orderService.getSellerManagementOrders).toHaveBeenCalledTimes(callsBeforeSearch);

      await new Promise((resolve) => setTimeout(resolve, 450));
      await settle();

      expect(orderService.getSellerManagementOrders).toHaveBeenCalledTimes(callsBeforeSearch + 1);
      expect(orderService.getSellerManagementOrders).toHaveBeenLastCalledWith({
        ...firstRequest,
        SEARCH: 'pooja',
        OFFSET: 0,
      });
      // The API already searched, so its rows are not filtered again in the browser.
      expect(root.querySelectorAll('tbody tr').length).toBe(10);

      // Clearing the search sends SEARCH= again.
      input.value = '';
      input.dispatchEvent(new Event('input'));
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 450));
      await settle();
      expect(orderService.getSellerManagementOrders).toHaveBeenCalledTimes(callsBeforeSearch + 2);
      expect(orderService.getSellerManagementOrders).toHaveBeenLastCalledWith(firstRequest);
    });

    // CHANGED (new): Sellers see an order's details, but cannot change its statuses.
    it('shows an order\'s details read-only, without the status update form', async () => {
      const view = root.querySelector('tbody tr .order-action') as HTMLButtonElement;
      expect(view.getAttribute('aria-label')).toBe('View order ORD-1');
      view.click();
      await settle();

      const dialog = root.querySelector('.order-dialog');
      expect(dialog?.querySelector('h2')?.textContent).toContain('Order ORD-1');
      expect(dialog?.textContent).toContain('Seller product 1');
      expect(dialog?.querySelector('form')).toBeNull();
      expect(dialog?.querySelector('select')).toBeNull();
      // No sortable headers: the API pages the seller's orders.
      expect(root.querySelector('th button.order-sort')).toBeNull();
      expect(orderService.updateOrderStatus).not.toHaveBeenCalled();
    });

    it('shows the error with retry when the seller account cannot be resolved', async () => {
      fixture.destroy();
      vi.clearAllMocks();
      sellerOnboarding.getCurrentSellerId
        .mockReturnValueOnce(throwError(() => new Error('The authenticated user does not have a valid seller account.')))
        .mockReturnValue(of(24));
      await render();

      const alerts = Array.from(root.querySelectorAll('.alert')).map((alert) => alert.textContent);
      expect(alerts.length).toBe(2);
      expect(alerts.every((text) => text?.includes('The authenticated user does not have a valid seller account.'))).toBe(true);
      expect(orderService.getSellerManagementOrders).not.toHaveBeenCalled();
      expect(orderService.getManagementCounts).not.toHaveBeenCalled();

      (root.querySelector('.alert button') as HTMLButtonElement).click();
      await settle();

      expect(orderService.getSellerManagementOrders).toHaveBeenCalledWith(firstRequest);
      expect(root.querySelector('.alert')).toBeNull();
      expect(root.querySelectorAll('tbody tr').length).toBe(10);
    });
  });
});
