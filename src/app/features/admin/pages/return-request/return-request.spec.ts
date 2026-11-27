import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import {
  ReturnReasonOption,
  ReturnRequestRow,
  ReturnRequestsPage,
  ShipmentTracking,
  StatusOption,
} from '@shared/models';
import { OrderService } from '@features/orders/services/order.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import { Observable, of, throwError } from 'rxjs';
import { ReturnRequest } from './return-request';

const orderStatuses: StatusOption[] = [
  { id: 24, label: 'PENDING' },
  { id: 25, label: 'APPROVED' },
  // CHANGED (new)
  { id: 26, label: 'REJECTED' },
];
// CHANGED: the shipping statuses (shipping_status/get): the actions dialog's Return Status options (by
// SHIPPING_STATUS_ID), and the names of the return types (RETURN/REFUND, RETURN/REPLACE) of RETURN_OPTION.
const shippingStatuses: StatusOption[] = [
  { id: 28, label: 'RETURN/REFUND' },
  { id: 27, label: 'RETURN/REPLACE' },
  { id: 26, label: 'ON SCHEDULE' },
  { id: 9, label: 'IN TRANSIT' },
  { id: 4, label: 'DELIVERED' },
];
/** CHANGED (new): the order's tracking: the returned product (7, variant 3) and another product of the order. */
const shipment: ShipmentTracking = {
  orderId: 'ORDF0F7C67DDF4611F197100AFFFC1C7849',
  placedOn: '2026-11-10T06:00:00.000Z',
  orderStatus: 'DELIVERED',
  shippingStatus: 'DELIVERED',
  shipmentNumber: 'SHP0005',
  carrier: { name: 'BlueDart', code: 'BLU', color: '#e63946', trackingNo: 'TRK0005' },
  scheduleStatus: '',
  onSchedule: true,
  estimatedDelivery: null,
  steps: [],
  currentStep: 0,
  items: [
    {
      orderId: 30, productId: 16, variantId: 25, sellerId: 49, shippingId: 5, deliveryAddressId: 10,
      name: 'Lenovo IdeaPad Slim 57', sku: 'SKU0016', quantity: 1, price: 6000, icon: '', tone: 'accent',
    },
    {
      orderId: 7, productId: 7, variantId: 3, sellerId: 24, shippingId: 5, deliveryAddressId: 1,
      name: 'Lenovo ThinkPad E14', sku: 'SKU0007', quantity: 2, price: 45000, icon: '', tone: 'neutral',
    },
  ],
  address: { name: 'Pooja Sree', lines: ['13/5a, 2nd Street', 'Chennai, Tamil Nadu, India, 600040'], phone: '9876543210' },
};
const returnReasons: ReturnReasonOption[] = [
  { REASON_ID: 19, REASON: 'Product is unsuitable for my needs' },
  { REASON_ID: 20, REASON: 'Other' },
];

function makeReturnRequest(overrides: Partial<ReturnRequestRow> = {}): ReturnRequestRow {
  return {
    returnId: 2,
    orderId: 7,
    orderNumber: 'ORDF0F7C67DDF4611F197100AFFFC1C7849',
    productId: 7,
    productName: 'Lenovo ThinkPad E14',
    quantity: 2,
    reason: 'Product Damaged',
    description: 'Received damaged product',
    images: ['image-1.jpg', 'image-2.jpg', 'image-3.jpg', 'image-4.jpg'],
    pickupAddressId: 1,
    address: '13/5a, 2nd Street, Chennai',
    sellerId: null,
    customerId: 1,
    customerName: 'Pooja Sree',
    customerMobile: '43559488848',
    variantId: 3,
    status: 'PENDING',
    createdAt: '2026-11-16T02:45:11.000Z',
    // CHANGED (new)
    statusId: null,
    reasonId: null,
    returnOptionId: 28,
    returnOptionName: null,
    sellerName: null,
    ...overrides,
  };
}

describe('ReturnRequest', () => {
  let fixture: ComponentFixture<ReturnRequest>;
  let root: HTMLElement;
  let orderService: {
    getOrderStatuses: ReturnType<typeof vi.fn>;
    getReturnReasons: ReturnType<typeof vi.fn>;
    getReturnRequests: ReturnType<typeof vi.fn>;
    getSellerReturnRequests: ReturnType<typeof vi.fn>;
    // CHANGED (new)
    getShippingStatuses: ReturnType<typeof vi.fn>;
    getShipmentTracking: ReturnType<typeof vi.fn>;
    reviewReturnRequest: ReturnType<typeof vi.fn>;
    returnReviewErrorMessage: ReturnType<typeof vi.fn>;
  };
  let toast: { showError: ReturnType<typeof vi.fn>; showSuccess: ReturnType<typeof vi.fn> };
  // CHANGED (new): the screen picks the Admin or Seller API from the logged-in role (Admin by default).
  let userType: string;
  let sellerOnboarding: { getCurrentSellerId: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const defaultPage: ReturnRequestsPage = { requests: [makeReturnRequest()], totalRecords: 25 };
    orderService = {
      getOrderStatuses: vi.fn(() => of(orderStatuses)),
      getReturnReasons: vi.fn(() => of(returnReasons)),
      getReturnRequests: vi.fn(() => of(defaultPage)),
      getSellerReturnRequests: vi.fn(() => of(defaultPage)),
      getShippingStatuses: vi.fn(() => of(shippingStatuses)),
      getShipmentTracking: vi.fn(() => of(shipment)),
      reviewReturnRequest: vi.fn(() => of('Return request updated successfully.')),
      returnReviewErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : 'Failed.')),
    };
    toast = { showError: vi.fn(), showSuccess: vi.fn() };
    userType = 'ADMIN';
    sellerOnboarding = { getCurrentSellerId: vi.fn(() => of(24)) };
    await TestBed.configureTestingModule({
      imports: [ReturnRequest],
      providers: [
        { provide: OrderService, useValue: orderService },
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: { user: () => ({ userType }) } },
        { provide: SellerOnboardingService, useValue: sellerOnboarding },
      ],
    }).compileComponents();
  });

  async function renderScreen(): Promise<void> {
    fixture = TestBed.createComponent(ReturnRequest);
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

  // CHANGED (new): the details / status update dialog.
  const text = (element: Element | null | undefined): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const dialog = (): HTMLElement | null => root.querySelector('.return-dialog');
  /** The dialog's current return status and return type. */
  const statusBadges = (): string[] =>
    Array.from(dialog()?.querySelectorAll('.return-dialog__statuses app-badge') ?? [], (badge) => text(badge));
  const buttonIn = (container: Element | null, label: string): HTMLButtonElement =>
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) => text(button) === label)!;
  /** label → value of a details section ("Order & product", …). */
  const section = (title: string): Record<string, string> => {
    const heading = Array.from(dialog()?.querySelectorAll('h3') ?? []).find((h3) => text(h3) === title);
    const list = heading?.nextElementSibling;
    return Object.fromEntries(
      Array.from(list?.querySelectorAll('dl > div') ?? [], (item) => [text(item.querySelector('dt')), text(item.querySelector('dd'))]),
    );
  };

  /** CHANGED: the details open from the row's order number (View is removed). */
  async function openDetails(index = 0): Promise<void> {
    root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Open return #"]')[index].click();
    await settle();
  }

  // ---- CHANGED (new): the actions dialog (the row's three-dot action) ----

  /** The row's three-dot action. */
  async function openActions(index = 0): Promise<void> {
    root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Manage return"]')[index].click();
    await settle();
  }

  /** The Return Status dropdown's option labels. */
  async function actionStatusOptions(): Promise<string[]> {
    const trigger = root.querySelector<HTMLButtonElement>('#action-return-status')!;
    trigger.click();
    await settle();
    const labels = Array.from(dialog()?.querySelectorAll('[role="option"]') ?? [], (option) => text(option));
    trigger.click();
    await settle();
    return labels;
  }

  async function pickActionStatus(label: string): Promise<void> {
    root.querySelector<HTMLButtonElement>('#action-return-status')!.click();
    await settle();
    Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('[role="option"]')).find((option) => text(option) === label)!.click();
    await settle();
  }

  /** The dialog's Approve / Reject / Save Status / Cancel button. */
  const actionButton = (label: string): HTMLButtonElement => buttonIn(dialog()?.querySelector('.return-dialog__actions') ?? null, label);

  async function clickAction(label: string): Promise<void> {
    actionButton(label).click();
    await settle();
  }

  it('loads API records with all statuses and the required initial filters', async () => {
    await renderScreen();

    expect(orderService.getOrderStatuses).toHaveBeenCalledOnce();
    expect(orderService.getOrderStatuses).toHaveBeenCalledWith(10, 0);
    expect(orderService.getReturnReasons).toHaveBeenCalledOnce();
    expect(orderService.getReturnRequests).toHaveBeenCalledOnce();
    expect(orderService.getReturnRequests).toHaveBeenCalledWith({
      DAYS: 30,
      RETURN_STATUS: -1,
      RETURN_REASON: -1,
      LIMIT: 5,
      OFFSET: 0,
    });
    expect(orderService.getSellerReturnRequests).not.toHaveBeenCalled();
    expect(sellerOnboarding.getCurrentSellerId).not.toHaveBeenCalled();
    expect(root.querySelector('h1')?.textContent).toContain('Return Request');
    expect(root.querySelectorAll('app-stat-card').length).toBe(5);
    expect(root.querySelectorAll('tbody tr').length).toBe(1);
    expect(root.querySelector('tbody')?.textContent).toContain(
      'ORDF0F7C67DDF4611F197100AFFFC1C7849',
    );
    // CHANGED: the Return Type and Requested On columns; the photos are in the details dialog. No row selection column
    // (and no checkboxes), and no Return ID column.
    expect(Array.from(root.querySelectorAll('thead th'), (th) => th.textContent?.trim())).toEqual([
      'Order No', 'Product', 'Seller', 'Quantity', 'Return Type', 'Return Reason', 'Pickup Address',
      'Return Status', 'Requested On', 'Actions',
    ]);
    expect(root.querySelector('.admin-list-table app-checkbox, .admin-list-table input[type="checkbox"]')).toBeNull();
    expect(root.querySelector('tbody')?.textContent).not.toContain('#2');
    // The product's variant under its name; the seller (no SELLER_ID here).
    expect(root.querySelector('tbody')?.textContent).toContain('Variant #3');
    expect(root.querySelector('tbody td:nth-child(3)')?.textContent?.trim()).toBe('—');
    // CHANGED: one three-dot action per row (View and Review are removed).
    const actions = root.querySelectorAll('tbody td:last-child button');
    expect(actions.length).toBe(1);
    expect(actions[0].getAttribute('aria-label')).toBe('Manage return #2');
    expect(actions[0].getAttribute('aria-haspopup')).toBe('dialog');
    expect(root.querySelector('button[aria-label^="View return"], button[aria-label^="Review return"]')).toBeNull();
    expect(root.querySelector('tbody')?.textContent).toContain('Lenovo ThinkPad E14');
    expect(root.querySelector('tbody')?.textContent).toContain('Received damaged product');
    expect(root.querySelector('tbody')?.textContent).toContain('Pooja Sree');
    expect(root.querySelector('tbody')?.textContent).toContain('43559488848');
    expect(root.querySelector('tbody')?.textContent).toContain('13/5a, 2nd Street, Chennai');
    expect(root.querySelector('tbody')?.textContent).toContain('Pending');
    // RETURN_OPTION 28 named from the return types. CHANGED: the shipping statuses are also the actions dialog's
    // Return Status options (read once).
    expect(orderService.getShippingStatuses).toHaveBeenCalledOnce();
    expect(root.querySelector('tbody app-badge')?.textContent?.trim()).toBe('Return/Refund');
    expect(root.querySelector('.return-images__item')).toBeNull();
    // Created date uses the project's 'dd MMM y' format (day depends on the test machine's zone).
    expect(root.querySelector('.return-date')?.textContent).toMatch(/^\d{2} Nov 2026$/);
  });

  it('selects All Status, All reasons and 30 days by default', async () => {
    await renderScreen();

    expect(root.querySelector<HTMLSelectElement>('#admin-return-status')!.value).toBe('-1');
    expect(root.querySelector<HTMLSelectElement>('#admin-return-reason')!.value).toBe('-1');
    expect(root.querySelector<HTMLSelectElement>('#return-date-range')!.value).toBe('30');
  });

  // CHANGED: a numeric RETURN_STATUS is named through All Status, and that name (not a fixed ID) decides whether the
  // request is already Approved.
  it('resolves numeric status IDs through All Status, also for the actions dialog\'s Approve / Reject', async () => {
    orderService.getOrderStatuses.mockReturnValue(of([{ id: 6, label: 'PENDING' }, { id: 7, label: 'APPROVED' }]));
    orderService.getReturnRequests.mockReturnValue(
      of({ requests: [makeReturnRequest({ status: '6' }), makeReturnRequest({ returnId: 3, status: '7' })], totalRecords: 2 }),
    );
    await renderScreen();

    const rows = root.querySelectorAll<HTMLElement>('tbody tr');
    expect(rows[0].textContent).toContain('Pending');
    expect(rows[1].textContent).toContain('Approved');
    await openActions(1);
    expect(actionButton('Approve').disabled).toBe(true);
    expect(actionButton('Reject').disabled).toBe(false);
    await clickAction('Cancel');
    await openActions(0);
    expect(actionButton('Approve').disabled).toBe(false);
    expect(actionButton('Reject').disabled).toBe(false);
  });

  it('renders a row whose optional fields are all null without errors', async () => {
    orderService.getReturnRequests.mockReturnValue(
      of({
        requests: [
          makeReturnRequest({
            returnId: 9,
            orderId: null,
            orderNumber: null,
            productId: null,
            productName: null,
            quantity: null,
            reason: null,
            description: null,
            images: [],
            pickupAddressId: null,
            address: null,
            customerId: null,
            customerName: null,
            customerMobile: null,
            variantId: null,
            status: null,
            createdAt: null,
          }),
        ],
        totalRecords: 1,
      } satisfies ReturnRequestsPage),
    );
    await renderScreen();

    const row = root.querySelector('tbody tr') as HTMLElement;
    // CHANGED: the row's action names the return (there is no Return ID column).
    expect(row.querySelector('button[aria-label^="Manage return"]')?.getAttribute('aria-label')).toBe('Manage return #9');
    expect(row.querySelector('.return-date')?.textContent?.trim()).toBe('—');
    expect(row.textContent).toContain('—');
  });

  it('shows API-provided status and reason labels and sends their IDs when changed', async () => {
    await renderScreen();

    const status = root.querySelector<HTMLSelectElement>('#admin-return-status')!;
    const reason = root.querySelector<HTMLSelectElement>('#admin-return-reason')!;
    expect(Array.from(status.options).map((option) => option.textContent?.trim())).toEqual([
      'All Status',
      'PENDING',
      'APPROVED',
      'REJECTED',
    ]);
    expect(Array.from(reason.options).map((option) => option.textContent?.trim())).toEqual([
      'All Return Reasons',
      'Product is unsuitable for my needs',
      'Other',
    ]);
    expect(reason.options[1].value).toBe('19');

    status.value = '25';
    status.dispatchEvent(new Event('change'));
    await settle();
    reason.value = '19';
    reason.dispatchEvent(new Event('change'));
    await settle();

    expect(orderService.getReturnRequests).toHaveBeenLastCalledWith({
      DAYS: 30,
      RETURN_STATUS: 25,
      RETURN_REASON: 19,
      LIMIT: 5,
      OFFSET: 0,
    });
  });

  it('refreshes the existing table from each filtered and paginated API response', async () => {
    orderService.getReturnRequests
      .mockReturnValueOnce(
        of({
          requests: [makeReturnRequest({ orderNumber: 'ORD-FIRST-PAGE' })],
          totalRecords: 25,
        } satisfies ReturnRequestsPage),
      )
      .mockReturnValue(
        of({
          requests: [makeReturnRequest({ returnId: 12, orderNumber: 'ORD-UPDATED-PAGE' })],
          totalRecords: 15,
        } satisfies ReturnRequestsPage),
      );
    await renderScreen();

    expect(root.querySelector('tbody')?.textContent).toContain('ORD-FIRST-PAGE');
    const status = root.querySelector<HTMLSelectElement>('#admin-return-status')!;
    status.value = '25';
    status.dispatchEvent(new Event('change'));
    await settle();
    expect(root.querySelector('tbody')?.textContent).toContain('ORD-UPDATED-PAGE');
    expect(root.querySelector('tbody')?.textContent).not.toContain('ORD-FIRST-PAGE');

    const nextPage = root.querySelector<HTMLButtonElement>(
      'nav[aria-label="Return request pages"] button[aria-label="Next page"]',
    )!;
    nextPage.click();
    await settle();
    expect(orderService.getReturnRequests).toHaveBeenLastCalledWith({
      DAYS: 30,
      RETURN_STATUS: 25,
      RETURN_REASON: -1,
      LIMIT: 5,
      OFFSET: 5,
    });
    expect(root.querySelector('tbody')?.textContent).toContain('ORD-UPDATED-PAGE');
  });

  // CHANGED (new): 5 requests per page.
  it('shows 5 requests per page, with the pages from total_records', async () => {
    orderService.getReturnRequests.mockReturnValue(of({
      requests: [1, 2, 3, 4, 5].map((returnId) => makeReturnRequest({ returnId })),
      totalRecords: 12,
    } satisfies ReturnRequestsPage));
    await renderScreen();

    expect(root.querySelectorAll('tbody tr').length).toBe(5);
    const pagination = root.querySelector('app-pagination');
    expect(pagination?.querySelector('.pagination__summary')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('Showing 1–5 of 12 requests');
    expect(Array.from(pagination?.querySelectorAll('nav button:not([aria-label])') ?? [], (button) => button.textContent?.trim()))
      .toEqual(['1', '2', '3']);

    pagination!.querySelector<HTMLButtonElement>('button[aria-label="Next page"]')!.click();
    await settle();
    expect(orderService.getReturnRequests).toHaveBeenLastCalledWith({
      DAYS: 30, RETURN_STATUS: -1, RETURN_REASON: -1, LIMIT: 5, OFFSET: 5,
    });
    expect(pagination?.querySelector('.pagination__summary')?.textContent?.replace(/\s+/g, ' ').trim())
      .toBe('Showing 6–10 of 12 requests');
  });

  it('resets the offset when days or lookup filters change and paginates from total_records', async () => {
    await renderScreen();

    const nextPage = root.querySelector<HTMLButtonElement>(
      'nav[aria-label="Return request pages"] button[aria-label="Next page"]',
    )!;
    nextPage.click();
    await settle();
    expect(orderService.getReturnRequests).toHaveBeenLastCalledWith({
      DAYS: 30,
      RETURN_STATUS: -1,
      RETURN_REASON: -1,
      LIMIT: 5,
      OFFSET: 5,
    });

    const dateRange = root.querySelector<HTMLSelectElement>('#return-date-range')!;
    dateRange.value = '90';
    dateRange.dispatchEvent(new Event('change'));
    await settle();
    expect(orderService.getReturnRequests).toHaveBeenLastCalledWith({
      DAYS: 90,
      RETURN_STATUS: -1,
      RETURN_REASON: -1,
      LIMIT: 5,
      OFFSET: 0,
    });
  });

  it('shows an empty state for an empty API page', async () => {
    orderService.getReturnRequests.mockReturnValue(
      of({ requests: [], totalRecords: 0 } satisfies ReturnRequestsPage),
    );
    await renderScreen();

    expect(root.querySelector('tbody')?.textContent).toContain('No return requests match these filters.');
    expect(root.querySelector('.pagination__summary')?.textContent).toContain('0 requests');
  });

  it('shows an API error and retries the request', async () => {
    orderService.getReturnRequests
      .mockReturnValueOnce(throwError(() => new Error('Return service unavailable.')))
      .mockReturnValue(of({ requests: [], totalRecords: 0 } satisfies ReturnRequestsPage));
    await renderScreen();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Return service unavailable.',
    );
    expect(toast.showError).toHaveBeenCalledWith('Return service unavailable.');
    (root.querySelector('.alert button') as HTMLButtonElement).click();
    await settle();

    expect(orderService.getReturnRequests).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(root.querySelector('tbody')?.textContent).toContain('No return requests match these filters.');
  });

  it('shows an empty reason state and retries a failed reason lookup', async () => {
    orderService.getReturnReasons
      .mockReturnValueOnce(throwError(() => new Error('Reasons unavailable.')))
      .mockReturnValue(of(returnReasons));
    await renderScreen();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Reasons unavailable.');
    expect(toast.showError).toHaveBeenCalledWith('Reasons unavailable.');
    (root.querySelector('.admin-list-filter-error button') as HTMLButtonElement).click();
    await settle();

    expect(orderService.getReturnReasons).toHaveBeenCalledTimes(2);
    expect(Array.from(root.querySelectorAll('#admin-return-reason option')).map((option) => option.textContent?.trim()))
      .toContain('Other');
  });

  it('loads all requests when the All Status API has no PENDING record', async () => {
    orderService.getOrderStatuses.mockReturnValue(of([{ id: 25, label: 'APPROVED' }]));
    await renderScreen();

    expect(orderService.getReturnRequests).toHaveBeenCalledWith({
      DAYS: 30,
      RETURN_STATUS: -1,
      RETURN_REASON: -1,
      LIMIT: 5,
      OFFSET: 0,
    });
    expect(root.querySelector('tbody')?.textContent).toContain('ORDF0F7C67DDF4611F197100AFFFC1C7849');
  });

  it('keeps the Return Requests table available when the status lookup fails', async () => {
    orderService.getOrderStatuses.mockReturnValue(
      throwError(() => new Error('Return statuses unavailable.')),
    );
    await renderScreen();

    expect(orderService.getReturnRequests).toHaveBeenCalledWith({
      DAYS: 30,
      RETURN_STATUS: -1,
      RETURN_REASON: -1,
      LIMIT: 5,
      OFFSET: 0,
    });
    expect(root.querySelector('tbody')?.textContent).toContain('ORDF0F7C67DDF4611F197100AFFFC1C7849');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Return statuses unavailable.',
    );
  });

  // ---- CHANGED: details (read only), opened from the order number ----

  it('shows a request\'s details with the returned product\'s SKU, price, seller and shipment from its tracking', async () => {
    await renderScreen();
    await openDetails();

    expect(orderService.getShipmentTracking).toHaveBeenCalledWith('ORDF0F7C67DDF4611F197100AFFFC1C7849');
    expect(dialog()?.getAttribute('role')).toBe('dialog');
    expect(text(dialog()?.querySelector('h2'))).toBe('Return #2');
    expect(statusBadges()).toEqual(['Pending', 'Return/Refund']);
    expect(section('Return details')).toMatchObject({
      'Return ID': '#2', 'Return Type': 'Return/Refund', 'Return Reason': 'Product Damaged',
      'Additional Details': 'Received damaged product',
    });
    // The tracking row of the returned product (7, variant 3), not the order's other product.
    expect(section('Order & product')).toEqual({
      'Order Number': 'ORDF0F7C67DDF4611F197100AFFFC1C7849', Product: 'Lenovo ThinkPad E14', SKU: 'SKU0007',
      Variant: '#3', Quantity: '2', 'Unit Price': '₹45,000.00', Seller: 'Seller #24',
    });
    expect(section('Pickup')).toEqual({
      'Pickup Address': '13/5a, 2nd Street, Chennai', Customer: 'Pooja Sree', Mobile: '43559488848',
    });
    expect(section('Shipment')).toEqual({
      'Order Status': 'Delivered', 'Shipping Status': 'Delivered', Carrier: 'BlueDart', 'Tracking Number': 'TRK0005',
      'Shipment Number': 'SHP0005',
    });
    // Every photo of the request.
    expect(dialog()?.querySelectorAll('.return-gallery__item img').length).toBe(4);
    // CHANGED: read only (the status is updated from the actions dialog).
    expect(dialog()?.querySelector('app-searchable-select')).toBeNull();
    expect(Array.from(dialog()?.querySelectorAll('.return-dialog__actions button') ?? [], (button) => text(button))).toEqual(['Close']);

    buttonIn(dialog(), 'Close').click();
    await settle();
    expect(dialog()).toBeNull();
  });

  it('keeps the details without the shipment when the order\'s tracking cannot be read, with Try again', async () => {
    orderService.getShipmentTracking
      .mockReturnValueOnce(throwError(() => new Error('Tracking unavailable')))
      .mockReturnValue(of(shipment));
    await renderScreen();
    await openDetails();

    expect(text(dialog())).toContain('Shipment details are not available for this order.');
    expect(section('Order & product')).toMatchObject({ SKU: '—', 'Unit Price': '—', Product: 'Lenovo ThinkPad E14' });
    buttonIn(dialog(), 'Try again').click();
    await settle();
    expect(section('Order & product')).toMatchObject({ SKU: 'SKU0007' });
  });

  // ---- CHANGED (new): the actions dialog: Return Status (shipping statuses), Approve, Reject, Save Status ----

  it('approves with the Return Status picked: { RETURN_ID, RETURN_STATUS: SHIPPING_STATUS_ID, ACTION: APPROVED }', async () => {
    orderService.getReturnRequests
      .mockReturnValueOnce(of({ requests: [makeReturnRequest()], totalRecords: 25 }))
      .mockReturnValue(of({ requests: [makeReturnRequest({ status: 'APPROVED' })], totalRecords: 25 }));
    await renderScreen();
    await openActions();

    expect(dialog()?.getAttribute('role')).toBe('dialog');
    expect(text(dialog()?.querySelector('h2'))).toBe('Manage Return #2');
    expect(text(dialog()?.querySelector('#return-actions-subtitle'))).toBe('Order ORDF0F7C67DDF4611F197100AFFFC1C7849 · Lenovo ThinkPad E14');
    expect(statusBadges()).toEqual(['Pending', 'Return/Refund']);
    // Every shipping status (SHIPPING_STATUS as the label), nothing picked yet.
    expect(text(root.querySelector('#action-return-status'))).toBe('Select the return status');
    expect(await actionStatusOptions()).toEqual(['Return/Refund', 'Return/Replace', 'On Schedule', 'In Transit', 'Delivered']);
    expect(Array.from(dialog()?.querySelectorAll('.return-dialog__actions button') ?? [], (button) => text(button))).toEqual([
      'Cancel', 'Save Status', 'Reject', 'Approve',
    ]);
    expect(actionButton('Approve').disabled).toBe(false);
    expect(actionButton('Reject').disabled).toBe(false);

    await pickActionStatus('In Transit');
    await clickAction('Approve');

    expect(orderService.reviewReturnRequest).toHaveBeenCalledOnce();
    expect(orderService.reviewReturnRequest).toHaveBeenCalledWith({ RETURN_ID: 2, RETURN_STATUS: 9, ACTION: 'APPROVED' });
    expect(toast.showSuccess).toHaveBeenCalledWith('Return request updated successfully.');
    // The dialog closes and the table is read again (it stays on screen meanwhile).
    expect(dialog()).toBeNull();
    expect(orderService.getReturnRequests).toHaveBeenCalledTimes(2);
    expect(root.querySelector('tbody tr')?.textContent).toContain('Approved');

    // Approved now: not approved again.
    await openActions();
    expect(actionButton('Approve').disabled).toBe(true);
    expect(actionButton('Reject').disabled).toBe(false);
    expect(text(dialog()?.querySelector('.return-actions-dialog__hint'))).toBe('This request is already approved, so it cannot be approved again.');
  });

  it('rejects with ACTION REJECTED, and shows the rejection at once even when the listing cannot be read again', async () => {
    orderService.getReturnRequests
      .mockReturnValueOnce(of({ requests: [makeReturnRequest()], totalRecords: 25 }))
      .mockReturnValue(throwError(() => new Error('Listing unavailable')));
    await renderScreen();
    await openActions();
    await pickActionStatus('Return/Refund');
    await clickAction('Reject');

    expect(orderService.reviewReturnRequest).toHaveBeenCalledWith({ RETURN_ID: 2, RETURN_STATUS: 28, ACTION: 'REJECTED' });
    expect(dialog()).toBeNull();
    expect(toast.showError).toHaveBeenCalledWith('Listing unavailable');
    expect(root.querySelector('tbody tr')?.textContent).toContain('Rejected');

    // Rejected now: Reject is not offered again (no duplicate rejection), Approve still is.
    await openActions();
    expect(actionButton('Reject').disabled).toBe(true);
    expect(actionButton('Approve').disabled).toBe(false);
    actionButton('Reject').click();
    await settle();
    expect(orderService.reviewReturnRequest).toHaveBeenCalledOnce();
  });

  it('updates the status only with Save Status: ACTION null, never APPROVED or REJECTED', async () => {
    await renderScreen();
    await openActions();
    await pickActionStatus('Return/Replace');
    await clickAction('Save Status');

    expect(orderService.reviewReturnRequest).toHaveBeenCalledOnce();
    expect(orderService.reviewReturnRequest).toHaveBeenCalledWith({ RETURN_ID: 2, RETURN_STATUS: 27, ACTION: null });
    expect(toast.showSuccess).toHaveBeenCalledWith('Return request updated successfully.');
    expect(dialog()).toBeNull();
    // No decision was made, so the row keeps the status the listing reports.
    expect(orderService.getReturnRequests).toHaveBeenCalledTimes(2);
    expect(root.querySelector('tbody tr')?.textContent).toContain('Pending');
  });

  it('requires a Return Status before Approve, Reject or Save Status sends anything', async () => {
    await renderScreen();
    await openActions();

    for (const label of ['Approve', 'Reject', 'Save Status']) {
      await clickAction(label);
      expect(text(dialog()?.querySelector('#action-return-status-error')), label).toBe('Select a return status to continue.');
      expect(root.querySelector('#action-return-status')?.getAttribute('aria-invalid'), label).toBe('true');
    }
    expect(orderService.reviewReturnRequest).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();

    await pickActionStatus('Delivered');
    expect(dialog()?.querySelector('#action-return-status-error')).toBeNull();
  });

  it('disables Approve for an approved request and Reject for a rejected one, from the listing\'s status', async () => {
    orderService.getReturnRequests.mockReturnValue(of({
      requests: [
        makeReturnRequest({ returnId: 5, status: 'APPROVED' }),
        makeReturnRequest({ returnId: 6, status: 'Rejected' }),
        makeReturnRequest({ returnId: 7, status: 'IN TRANSIT' }),
      ],
      totalRecords: 3,
    }));
    await renderScreen();
    const states = async (index: number): Promise<[boolean, boolean]> => {
      await openActions(index);
      const result: [boolean, boolean] = [actionButton('Approve').disabled, actionButton('Reject').disabled];
      await clickAction('Cancel');
      return result;
    };

    expect(await states(0)).toEqual([true, false]);
    expect(await states(1)).toEqual([false, true]);
    expect(await states(2)).toEqual([false, false]);
  });

  it('shows the update in progress, sends it once and keeps the dialog open until it ends', async () => {
    let finishUpdate!: (message: string) => void;
    orderService.reviewReturnRequest.mockReturnValueOnce(
      new Observable<string>((subscriber) => {
        finishUpdate = (message) => {
          subscriber.next(message);
          subscriber.complete();
        };
      }),
    );
    await renderScreen();
    await openActions();
    await pickActionStatus('In Transit');
    await clickAction('Approve');

    const approving = actionButton('Approving…');
    expect(approving.getAttribute('aria-busy')).toBe('true');
    expect(approving.disabled).toBe(true);
    for (const label of ['Cancel', 'Save Status', 'Reject']) expect(actionButton(label).disabled, label).toBe(true);
    expect(dialog()?.querySelector<HTMLButtonElement>('.return-dialog__close')?.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('#action-return-status')?.disabled).toBe(true);
    approving.click();
    await settle();
    expect(orderService.reviewReturnRequest).toHaveBeenCalledOnce();

    finishUpdate('Return request approved');
    await settle();
    expect(dialog()).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalledWith('Return request approved');
    expect(orderService.getReturnRequests).toHaveBeenCalledTimes(2);
  });

  it('keeps the dialog open with the reason when the update fails, and lets the admin try again', async () => {
    orderService.reviewReturnRequest.mockReturnValueOnce(throwError(() => new Error('Return request is closed')));
    await renderScreen();
    await openActions();
    await pickActionStatus('Return/Replace');
    await clickAction('Save Status');

    expect(orderService.returnReviewErrorMessage).toHaveBeenCalledWith(expect.any(Error), null);
    expect(text(dialog()?.querySelector('.return-actions-dialog__alert'))).toBe('Return request is closed');
    expect(toast.showError).toHaveBeenCalledWith('Return request is closed');
    expect(orderService.getReturnRequests).toHaveBeenCalledOnce();
    // The choice is kept and can be sent again.
    expect(text(root.querySelector('#action-return-status'))).toBe('Return/Replace');
    await clickAction('Save Status');
    expect(orderService.reviewReturnRequest).toHaveBeenLastCalledWith({ RETURN_ID: 2, RETURN_STATUS: 27, ACTION: null });
    expect(dialog()).toBeNull();
  });

  it('cannot update while the shipping statuses are unavailable, and offers Retry', async () => {
    // The page's read and the dialog's own retry when it opens both fail.
    orderService.getShippingStatuses
      .mockReturnValueOnce(throwError(() => new Error('Shipping statuses unavailable.')))
      .mockReturnValueOnce(throwError(() => new Error('Shipping statuses unavailable.')))
      .mockReturnValue(of(shippingStatuses));
    await renderScreen();
    await openActions();

    expect(orderService.getShippingStatuses).toHaveBeenCalledTimes(2);
    expect(root.querySelector<HTMLButtonElement>('#action-return-status')?.disabled).toBe(true);
    expect(text(dialog())).toContain('Return statuses could not be loaded, so the return cannot be updated right now.');
    await clickAction('Approve');
    expect(orderService.reviewReturnRequest).not.toHaveBeenCalled();

    buttonIn(dialog(), 'Retry').click();
    await settle();
    expect(orderService.getShippingStatuses).toHaveBeenCalledTimes(3);
    expect(await actionStatusOptions()).toEqual(['Return/Refund', 'Return/Replace', 'On Schedule', 'In Transit', 'Delivered']);
    await pickActionStatus('Return/Refund');
    await clickAction('Approve');
    expect(orderService.reviewReturnRequest).toHaveBeenCalledWith({ RETURN_ID: 2, RETURN_STATUS: 28, ACTION: 'APPROVED' });
  });

  it('sorts the page\'s requests by a column, ascending then descending', async () => {
    orderService.getReturnRequests.mockReturnValue(of({
      requests: [
        makeReturnRequest({ returnId: 5, orderNumber: 'ORD0005', createdAt: '2026-11-18T02:00:00.000Z' }),
        makeReturnRequest({ returnId: 2, orderNumber: 'ORD0010', createdAt: null }),
        makeReturnRequest({ returnId: 9, orderNumber: 'ORD0001', createdAt: '2026-11-12T02:00:00.000Z' }),
      ],
      totalRecords: 3,
    }));
    await renderScreen();
    // CHANGED: the rows by their order numbers (the Return ID column, and its sort, are removed).
    const orders = (): string[] => Array.from(root.querySelectorAll('.return-order-link'), (cell) => text(cell));
    const sortBy = async (label: string): Promise<void> => {
      root.querySelector<HTMLButtonElement>(`button[aria-label^="Sort by ${label}"]`)!.click();
      await settle();
    };

    expect(root.querySelector('button[aria-label^="Sort by Return ID"]')).toBeNull();
    expect(orders()).toEqual(['ORD0005', 'ORD0010', 'ORD0001']);
    await sortBy('Order No');
    expect(orders()).toEqual(['ORD0001', 'ORD0005', 'ORD0010']);
    expect(root.querySelector('button[aria-label^="Sort by Order No"]')?.getAttribute('aria-label')).toBe('Sort by Order No, sorted ascending');
    await sortBy('Order No');
    expect(orders()).toEqual(['ORD0010', 'ORD0005', 'ORD0001']);
    // A request without a date goes last, in both directions.
    await sortBy('Requested On');
    expect(orders()).toEqual(['ORD0001', 'ORD0005', 'ORD0010']);
    await sortBy('Requested On');
    expect(orders()).toEqual(['ORD0005', 'ORD0001', 'ORD0010']);
  });

  // CHANGED (new): Seller login uses the SELLER_ID return request API with the same table and pagination.
  describe('for a Seller login', () => {
    beforeEach(() => {
      userType = 'SELLER';
    });

    it('loads the logged-in seller\'s requests by SELLER_ID and paging only', async () => {
      await renderScreen();

      expect(sellerOnboarding.getCurrentSellerId).toHaveBeenCalled();
      expect(orderService.getSellerReturnRequests).toHaveBeenCalledOnce();
      expect(orderService.getSellerReturnRequests).toHaveBeenCalledWith({
        SELLER_ID: 24,
        LIMIT: 5,
        OFFSET: 0,
      });
      expect(orderService.getReturnRequests).not.toHaveBeenCalled();
      expect(root.querySelector('tbody')?.textContent).toContain('ORDF0F7C67DDF4611F197100AFFFC1C7849');
      expect(root.querySelector('tbody')?.textContent).toContain('Pending');
    });

    it('uses whichever seller ID the logged-in seller resolves to', async () => {
      sellerOnboarding.getCurrentSellerId.mockReturnValue(of(57));
      await renderScreen();

      expect(orderService.getSellerReturnRequests).toHaveBeenCalledWith({
        SELLER_ID: 57,
        LIMIT: 5,
        OFFSET: 0,
      });
    });

    it('hides the Admin-only day, status and reason filters and skips the reason lookup', async () => {
      await renderScreen();

      expect(root.querySelector('#return-date-range')).toBeNull();
      expect(root.querySelector('#admin-return-status')).toBeNull();
      expect(root.querySelector('#admin-return-reason')).toBeNull();
      expect(orderService.getReturnReasons).not.toHaveBeenCalled();
      expect(root.textContent).not.toContain('Loading return reasons');
      expect(root.querySelector('#admin-return-search')).toBeTruthy();
      expect(root.querySelector('app-export-button')).toBeTruthy();
    });

    it('paginates from total_records with the same SELLER_ID', async () => {
      await renderScreen();

      const nextPage = root.querySelector<HTMLButtonElement>(
        'nav[aria-label="Return request pages"] button[aria-label="Next page"]',
      )!;
      nextPage.click();
      await settle();

      expect(orderService.getSellerReturnRequests).toHaveBeenLastCalledWith({
        SELLER_ID: 24,
        LIMIT: 5,
        OFFSET: 5,
      });
      expect(orderService.getReturnRequests).not.toHaveBeenCalled();
    });

    // CHANGED: from the actions dialog, with the Return Status picked and ACTION.
    it('lets a seller approve a Pending request from the actions dialog and refreshes the seller list', async () => {
      orderService.getOrderStatuses.mockReturnValue(of([{ id: 6, label: 'PENDING' }, { id: 7, label: 'APPROVED' }]));
      orderService.getSellerReturnRequests.mockReturnValue(
        of({ requests: [makeReturnRequest({ status: '6', sellerId: 24 })], totalRecords: 2 }),
      );
      await renderScreen();

      const row = root.querySelector('tbody tr') as HTMLElement;
      expect(row.textContent).toContain('Pending');
      expect(row.textContent).toContain('Seller #24');
      await openActions();
      await pickActionStatus('In Transit');
      await clickAction('Approve');

      expect(orderService.reviewReturnRequest).toHaveBeenCalledWith({ RETURN_ID: 2, RETURN_STATUS: 9, ACTION: 'APPROVED' });
      expect(orderService.getSellerReturnRequests).toHaveBeenCalledTimes(2);
      expect(orderService.getReturnRequests).not.toHaveBeenCalled();
    });

    it('shows an error with retry when the seller account cannot be resolved', async () => {
      sellerOnboarding.getCurrentSellerId
        .mockReturnValueOnce(throwError(() => new Error('The authenticated user does not have a valid seller account.')))
        .mockReturnValue(of(24));
      await renderScreen();

      expect(root.querySelector('.alert')?.textContent).toContain(
        'The authenticated user does not have a valid seller account.',
      );
      expect(orderService.getSellerReturnRequests).not.toHaveBeenCalled();
      (root.querySelector('.alert button') as HTMLButtonElement).click();
      await settle();

      expect(orderService.getSellerReturnRequests).toHaveBeenCalledWith({
        SELLER_ID: 24,
        LIMIT: 5,
        OFFSET: 0,
      });
      expect(root.querySelector('.alert')).toBeNull();
    });
  });

  // CHANGED: the widths without the selection column; together they take the whole table.
  it('keeps the table widths and centered status and quantity columns', async () => {
    await renderScreen();

    const headers = Array.from(root.querySelectorAll<HTMLTableCellElement>('thead th'));
    const pickupAddress = headers.find((header) => header.textContent?.trim() === 'Pickup Address');
    const returnStatus = headers.find((header) => header.textContent?.trim() === 'Return Status');
    const quantity = headers.find((header) => header.textContent?.trim() === 'Quantity');
    const statusCell = root.querySelector<HTMLTableCellElement>(
      `tbody tr td:nth-child(${headers.indexOf(returnStatus!) + 1})`,
    );
    const quantityCell = root.querySelector<HTMLTableCellElement>(
      `tbody tr td:nth-child(${headers.indexOf(quantity!) + 1})`,
    );

    expect(root.querySelector('.table-scroll')).toBeTruthy();
    // CHANGED: wider now that the Return ID column is removed.
    expect(pickupAddress?.style.getPropertyValue('--column-width')).toBe('14%');
    expect(returnStatus?.style.getPropertyValue('--column-width')).toBe('10%');
    const totalWidth = headers.reduce((sum, header) => sum + parseFloat(header.style.getPropertyValue('--column-width')), 0);
    expect(totalWidth).toBe(100);
    expect(returnStatus?.style.textAlign).toBe('center');
    expect(statusCell?.style.textAlign).toBe('center');
    expect(quantity?.style.textAlign).toBe('center');
    expect(quantityCell?.style.textAlign).toBe('center');
  });
});