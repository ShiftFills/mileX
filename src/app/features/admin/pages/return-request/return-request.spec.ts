import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import {
  ReturnReasonOption,
  ReturnRequestRow,
  ReturnRequestsPage,
  StatusOption,
} from '@shared/models';
import { OrderService } from '@features/orders/services/order.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import { Observable, of, throwError } from 'rxjs';
import { ReturnRequest } from './return-request';

const orderStatuses: StatusOption[] = [
  { id: 24, label: 'PENDING' },
  { id: 25, label: 'APPROVED' },
];
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
    updateReturnRequestStatus: ReturnType<typeof vi.fn>;
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
      updateReturnRequestStatus: vi.fn(() => of('Return request updated successfully.')),
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
      LIMIT: 10,
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
    expect(root.querySelector('tbody')?.textContent).toContain('Return #2');
    expect(root.querySelector('tbody')?.textContent).toContain('Lenovo ThinkPad E14');
    expect(root.querySelector('tbody')?.textContent).toContain('Received damaged product');
    expect(root.querySelector('tbody')?.textContent).toContain('Pooja Sree');
    expect(root.querySelector('tbody')?.textContent).toContain('43559488848');
    expect(root.querySelector('tbody')?.textContent).toContain('13/5a, 2nd Street, Chennai');
    expect(root.querySelector('tbody')?.textContent).toContain('Pending');
    expect(root.querySelectorAll('.return-images__item').length).toBe(2);
    expect(root.querySelector('.return-images__more')?.textContent).toContain('+2');
    // Created date uses the project's 'dd MMM y' format (day depends on the test machine's zone).
    expect(root.querySelector('.return-request-detail')?.textContent).toMatch(/Return #2 · \d{2} Nov 2026/);
  });

  it('selects All Status, All reasons and 30 days by default', async () => {
    await renderScreen();

    expect(root.querySelector<HTMLSelectElement>('#admin-return-status')!.value).toBe('-1');
    expect(root.querySelector<HTMLSelectElement>('#admin-return-reason')!.value).toBe('-1');
    expect(root.querySelector<HTMLSelectElement>('#return-date-range')!.value).toBe('30');
  });

  it('resolves numeric status IDs through All Status so Pending rows can be reviewed', async () => {
    orderService.getOrderStatuses.mockReturnValue(of([{ id: 6, label: 'PENDING' }]));
    orderService.getReturnRequests.mockReturnValue(
      of({ requests: [makeReturnRequest({ status: '6' })], totalRecords: 1 }),
    );
    await renderScreen();

    const row = root.querySelector('tbody tr') as HTMLElement;
    expect(row.textContent).toContain('Pending');
    (row.querySelector('.more-actions') as HTMLButtonElement).click();
    await settle();
    const approveButton = root.querySelector<HTMLButtonElement>('.return-action-menu button')!;
    expect(approveButton.disabled).toBe(false);
    approveButton.click();
    await settle();

    expect(orderService.updateReturnRequestStatus).toHaveBeenCalledWith({
      RETURN_ID: 2,
      RETURN_STATUS: 'APPROVED',
    });
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
    expect(row.textContent).toContain('Return #9 · —');
    expect(row.textContent).toContain('—');
    expect(row.querySelectorAll('.return-images__item').length).toBe(0);
  });

  it('shows API-provided status and reason labels and sends their IDs when changed', async () => {
    await renderScreen();

    const status = root.querySelector<HTMLSelectElement>('#admin-return-status')!;
    const reason = root.querySelector<HTMLSelectElement>('#admin-return-reason')!;
    expect(Array.from(status.options).map((option) => option.textContent?.trim())).toEqual([
      'All Status',
      'PENDING',
      'APPROVED',
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
      LIMIT: 10,
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
      LIMIT: 10,
      OFFSET: 10,
    });
    expect(root.querySelector('tbody')?.textContent).toContain('ORD-UPDATED-PAGE');
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
      LIMIT: 10,
      OFFSET: 10,
    });

    const dateRange = root.querySelector<HTMLSelectElement>('#return-date-range')!;
    dateRange.value = '90';
    dateRange.dispatchEvent(new Event('change'));
    await settle();
    expect(orderService.getReturnRequests).toHaveBeenLastCalledWith({
      DAYS: 90,
      RETURN_STATUS: -1,
      RETURN_REASON: -1,
      LIMIT: 10,
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
      LIMIT: 10,
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
      LIMIT: 10,
      OFFSET: 0,
    });
    expect(root.querySelector('tbody')?.textContent).toContain('ORDF0F7C67DDF4611F197100AFFFC1C7849');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Return statuses unavailable.',
    );
  });

  it('approves a pending request through the API and refreshes the table after success', async () => {
    orderService.getReturnRequests
      .mockReturnValueOnce(of({ requests: [makeReturnRequest()], totalRecords: 25 }))
      .mockReturnValue(of({
        requests: [makeReturnRequest({ status: 'APPROVED' })],
        totalRecords: 25,
      }));
    await renderScreen();
    const firstRow = root.querySelector('tbody tr') as HTMLElement;
    expect(firstRow.textContent).toContain('Pending');
    (firstRow.querySelector('.more-actions') as HTMLButtonElement).click();
    await settle();
    (root.querySelector('.return-action-menu button') as HTMLButtonElement).click();
    await settle();
    expect(orderService.updateReturnRequestStatus).toHaveBeenCalledOnce();
    expect(orderService.updateReturnRequestStatus).toHaveBeenCalledWith({
      RETURN_ID: 2,
      RETURN_STATUS: 'APPROVED',
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('Return request updated successfully.');
    expect((root.querySelector('tbody tr') as HTMLElement).textContent).toContain('Approved');
    expect(root.querySelector('.return-action-menu')).toBeNull();
  });

  it('rejects a pending request through the API and does not update optimistically on failure', async () => {
    orderService.updateReturnRequestStatus.mockReturnValueOnce(
      throwError(() => new Error('Return request rejection failed.')),
    );
    await renderScreen();
    const firstRow = root.querySelector('tbody tr') as HTMLElement;
    (firstRow.querySelector('.more-actions') as HTMLButtonElement).click();
    await settle();
    (root.querySelectorAll('.return-action-menu button')[1] as HTMLButtonElement).click();
    await settle();

    expect(orderService.updateReturnRequestStatus).toHaveBeenCalledWith({
      RETURN_ID: 2,
      RETURN_STATUS: 'REJECTED',
    });
    expect(toast.showError).toHaveBeenCalledWith('Return request rejection failed.');
    expect((root.querySelector('tbody tr') as HTMLElement).textContent).toContain('Pending');
    expect(orderService.getReturnRequests).toHaveBeenCalledOnce();
  });

  it('shows an action loader and prevents another update while the request is pending', async () => {
    let finishUpdate!: (message: string) => void;
    orderService.updateReturnRequestStatus.mockReturnValueOnce(
      new Observable<string>((subscriber) => {
        finishUpdate = (message) => {
          subscriber.next(message);
          subscriber.complete();
        };
      }),
    );
    await renderScreen();
    const firstRow = root.querySelector('tbody tr') as HTMLElement;
    (firstRow.querySelector('.more-actions') as HTMLButtonElement).click();
    await settle();
    const approveButton = root.querySelector<HTMLButtonElement>('.return-action-menu button')!;
    approveButton.click();
    await settle();

    expect(root.querySelector('.return-action-menu [role="status"]')?.textContent).toContain('Updating return request');
    expect(root.querySelectorAll('.return-action-menu button').item(0)).toHaveProperty('disabled', true);
    expect(orderService.updateReturnRequestStatus).toHaveBeenCalledOnce();

    finishUpdate('Approved.');
    await settle();
    expect(orderService.getReturnRequests).toHaveBeenCalledTimes(2);
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
        LIMIT: 10,
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
        LIMIT: 10,
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
        LIMIT: 10,
        OFFSET: 10,
      });
      expect(orderService.getReturnRequests).not.toHaveBeenCalled();
    });

    it('resolves the numeric RETURN_STATUS so a seller can review Pending rows and refreshes the seller list', async () => {
      orderService.getOrderStatuses.mockReturnValue(of([{ id: 6, label: 'PENDING' }]));
      orderService.getSellerReturnRequests.mockReturnValue(
        of({ requests: [makeReturnRequest({ status: '6', sellerId: 24 })], totalRecords: 2 }),
      );
      await renderScreen();

      const row = root.querySelector('tbody tr') as HTMLElement;
      expect(row.textContent).toContain('Pending');
      (row.querySelector('.more-actions') as HTMLButtonElement).click();
      await settle();
      (root.querySelector('.return-action-menu button') as HTMLButtonElement).click();
      await settle();

      expect(orderService.updateReturnRequestStatus).toHaveBeenCalledWith({
        RETURN_ID: 2,
        RETURN_STATUS: 'APPROVED',
      });
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
        LIMIT: 10,
        OFFSET: 0,
      });
      expect(root.querySelector('.alert')).toBeNull();
    });
  });

  it('keeps the existing table widths and centered status and quantity columns', async () => {
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
    expect(pickupAddress?.style.getPropertyValue('--column-width')).toBe('19%');
    expect(returnStatus?.style.getPropertyValue('--column-width')).toBe('9%');
    expect(returnStatus?.style.textAlign).toBe('center');
    expect(statusCell?.style.textAlign).toBe('center');
    expect(quantity?.style.textAlign).toBe('center');
    expect(quantityCell?.style.textAlign).toBe('center');
  });
});