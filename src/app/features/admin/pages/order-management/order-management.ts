import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, debounceTime, defer, distinctUntilChanged, filter, map, switchMap, tap } from 'rxjs';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { DateRangeFilter, DateRangeOption } from '@shared/components/date-range-filter/date-range-filter';
import { ExportButton } from '@shared/components/export-button/export-button';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { StatCard, StatCardIcon, StatCardTone } from '@shared/components/stat-card/stat-card';
import { Table, TableCellContext, TableColumn, TableHeaderContext } from '@shared/components/table/table';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { StatusOption } from '@shared/models/api.model';
import { DateFilterOption, SellerVerificationService } from '@features/admin/services/seller-verification.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import { eventValue } from '@shared/utils/form-events';
import { OrderManagementCounts, OrderManagementOrder, OrderService } from '@features/orders/services/order.service';

interface OrderRow {
  id: number;
  orderNo: string;
  orderDate: string;
  customer: string;
  mobile: string;
  products: string;
  quantity: number | string;
  amount: string;
  paymentStatus: string;
  orderStatus: string;
  shippingStatus: string;
}

interface OrderStat {
  label: string;
  value: string;
  prefix?: string;
  trend: string;
  trendDirection: 'up' | 'down';
  trendTone: 'positive' | 'negative';
  icon: StatCardIcon;
  tone: StatCardTone;
}

interface OrderStatDefinition extends Omit<OrderStat, 'value'> {
  key: keyof OrderManagementCounts;
}

/** One listing response: Admin gets the whole filtered list; Seller gets one API page with its counts. */
// CHANGED (new): common shape for the Admin and Seller listing requests.
interface OrderListing {
  orders: readonly OrderManagementOrder[];
  totalRecords: number | null;
  counts: OrderManagementCounts | null;
}

interface OrderListingRequest {
  days: number;
  orderStatusId: number;
  paymentStatusId: number;
  shippingStatusId: number;
  search: string;
  page: number;
}

const PAGE_SIZE = 6;
const FILTER_ALL = -1;
const ADMIN_DEFAULT_DAYS = 7;
// CHANGED (new): Seller defaults follow the Seller API request (DAYS=30, ORDER_STATUS=-1, LIMIT=10).
const SELLER_DEFAULT_DAYS = 30;
const SELLER_PAGE_SIZE = 10;
/** Seller search is done by the API, so typing is debounced before a request is sent. */
const SEARCH_DEBOUNCE_MS = 400;
const PAYMENT_TONES: Record<string, BadgeTone> = {
  PAID: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
};
const ORDER_TONES: Record<string, BadgeTone> = {
  CONFIRMED: 'info',
  PROCESSING: 'warning',
  CANCELLED: 'danger',
};
const SHIPPING_TONES: Record<string, BadgeTone> = {
  SHIPPED: 'purple',
  'IN TRANSIT': 'info',
  DELIVERED: 'success',
  'NOT SHIPPED': 'neutral',
};

const STAT_DEFINITIONS: readonly OrderStatDefinition[] = [
  { key: 'totalOrders', label: 'Total Orders', trend: '%+8.2', trendDirection: 'up', trendTone: 'positive', icon: 'cart', tone: 'indigo' },
  { key: 'totalRevenue', label: 'Total Revenue', prefix: '₹', trend: '%+12.5', trendDirection: 'up', trendTone: 'positive', icon: 'revenue', tone: 'green' },
  { key: 'pendingOrders', label: 'Pending Orders', trend: '%+12.5', trendDirection: 'up', trendTone: 'negative', icon: 'pending', tone: 'red' },
  { key: 'shippedOrders', label: 'Shipped Orders', trend: '%+18.7', trendDirection: 'up', trendTone: 'positive', icon: 'shipped', tone: 'amber' },
  { key: 'deliveredOrders', label: 'Delivered Orders', trend: '%-3.1', trendDirection: 'down', trendTone: 'negative', icon: 'delivered', tone: 'cyan' },
];

type LookupStatus = 'loading' | 'success' | 'error';

function statusNameMap(options: readonly StatusOption[]): ReadonlyMap<number, string> {
  return new Map(options.map(({ id, label }) => [id, label]));
}

function optionLabel(options: ReadonlyMap<number, string>, rawId: unknown): string {
  if (typeof rawId !== 'number' && (typeof rawId !== 'string' || !rawId.trim())) return '—';
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return '—';
  return options.get(id) ?? '—';
}

function toOrderRow(
  order: OrderManagementOrder,
  orderStatuses: ReadonlyMap<number, string>,
  paymentStatuses: ReadonlyMap<number, string>,
  shippingStatuses: ReadonlyMap<number, string>,
): OrderRow {
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderDate: order.orderDate,
    customer: order.customer,
    mobile: order.mobile,
    // CHANGED: shows PRODUCT_NAME when the API sends it (Seller response); otherwise the product ID as before.
    products: order.productName ?? (order.productId === null ? '—' : String(order.productId)),
    quantity: order.quantity ?? '—',
    amount:
      order.amount === null
        ? '—'
        : `₹${order.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    paymentStatus: optionLabel(paymentStatuses, order.paymentStatusId),
    orderStatus: optionLabel(orderStatuses, order.orderStatusId),
    shippingStatus: optionLabel(shippingStatuses, order.shippingStatusId),
  };
}

@Component({
  selector: 'app-admin-order-management',
  imports: [Badge, Card, Checkbox, DateRangeFilter, ExportButton, Input, LoadingSpinner, PageHeading, Pagination, Select, StatCard, Table],
  templateUrl: './order-management.html',
  styleUrl: './order-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderManagement {
  private readonly orderService = inject(OrderService);
  private readonly sellerVerificationService = inject(SellerVerificationService);
  private readonly sellerOnboarding = inject(SellerOnboardingService);
  private readonly toast = inject(ToastService);
  // CHANGED (new): Sellers see only their own orders, searched and paged by the API (SELLER_ID, SEARCH,
  // LIMIT, OFFSET) with the summary cards from the same response. Admins keep the existing requests.
  protected readonly isSeller = inject(AuthService).user()?.userType?.trim().toUpperCase() === 'SELLER';
  protected readonly pageSize = this.isSeller ? SELLER_PAGE_SIZE : PAGE_SIZE;
  /** Seller only: total_records of the current API query (Admin pages its full list in the browser). */
  private readonly totalRecords = signal(0);
  /** Seller only: the debounced search text sent as SEARCH. */
  private readonly sellerSearch = signal('');
  protected readonly orderCounts = signal<OrderManagementCounts | null>(null);
  protected readonly countLoadStatus = signal<LookupStatus>('loading');
  protected readonly countError = signal('');
  private readonly orderCountRetry = signal(0);
  private readonly statsValue = computed<readonly OrderStat[]>(() => {
    const counts = this.orderCounts();
    return STAT_DEFINITIONS.map(({ key, ...definition }) => ({
      ...definition,
      value: counts?.[key].toLocaleString('en-IN') ?? '—',
    }));
  });
  protected get stats(): readonly OrderStat[] {
    return this.statsValue();
  }
  protected readonly orders = signal<readonly OrderManagementOrder[]>([]);
  protected readonly loadStatus = signal<LookupStatus>('loading');
  protected readonly loadError = signal('');
  private readonly listingRetry = signal(0);
  protected readonly orderStatusOptions = signal<readonly StatusOption[]>([]);
  protected readonly orderStatusLoadStatus = signal<LookupStatus>('loading');
  private readonly orderStatusRetry = signal(0);
  protected readonly paymentStatusOptions = signal<readonly StatusOption[]>([]);
  protected readonly paymentStatusLoadStatus = signal<LookupStatus>('loading');
  private readonly paymentStatusRetry = signal(0);
  protected readonly shippingStatusOptions = signal<readonly StatusOption[]>([]);
  protected readonly shippingStatusLoadStatus = signal<LookupStatus>('loading');
  private readonly shippingStatusRetry = signal(0);
  protected readonly dateFilterOptions = signal<readonly DateFilterOption[]>([]);
  protected readonly dateFilterStatus = signal<LookupStatus>('loading');
  protected readonly dateFilterError = signal('');
  private readonly dateFilterRetry = signal(0);
  protected readonly dateRangeOptions = computed<readonly DateRangeOption[]>(() =>
    this.dateFilterOptions().map((option) => ({
      label: option.label,
      value: String(option.id),
    })),
  );
  private readonly days = computed(
    () => this.dateFilterOptions().find((option) => String(option.id) === this.range())?.days,
  );
  protected readonly statusLookupsLoading = computed(
    () =>
      this.orderStatusLoadStatus() === 'loading' ||
      this.paymentStatusLoadStatus() === 'loading' ||
      this.shippingStatusLoadStatus() === 'loading' ||
      this.dateFilterStatus() === 'loading',
  );
  protected readonly orderStatusDropdownOptions = computed(() => [
    { id: FILTER_ALL, label: 'All Status' },
    ...this.orderStatusOptions(),
  ]);
  protected readonly paymentStatusDropdownOptions = computed(() => [
    { id: FILTER_ALL, label: 'All Payment Status' },
    ...this.paymentStatusOptions(),
  ]);
  protected readonly shippingStatusDropdownOptions = computed(() => [
    { id: FILTER_ALL, label: 'All Shipping Status' },
    ...this.shippingStatusOptions(),
  ]);

  protected get orderStatuses(): readonly string[] {
    return this.orderStatusOptions().map((option) => option.label);
  }
  protected get paymentStatuses(): readonly string[] {
    return this.paymentStatusOptions().map((option) => option.label);
  }
  protected get shippingStatuses(): readonly string[] {
    return this.shippingStatusOptions().map((option) => option.label);
  }

  protected readonly query = signal('');
  // CHANGED: Sellers start on All Status (ORDER_STATUS=-1); Admins keep ORDER_STATUS=1.
  protected readonly orderStatus = signal(this.isSeller ? String(FILTER_ALL) : '1');
  protected readonly paymentStatus = signal(String(FILTER_ALL));
  protected readonly shippingStatus = signal(String(FILTER_ALL));
  /** Selected DATE_FILTER_ID; listing requests use its mapped DAYS value. */
  protected readonly range = signal('');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  private readonly pageRequest = computed(() => ({
    days: this.days(),
    dateFilterReady: this.dateFilterStatus() === 'success',
    orderStatusId: Number(this.orderStatus()),
    paymentStatusId: Number(this.paymentStatus()),
    shippingStatusId: Number(this.shippingStatus()),
    // CHANGED: Seller requests also depend on the search text and page; Admin's never change here,
    // because Admin searches and pages the loaded list in the browser.
    search: this.sellerSearch(),
    page: this.isSeller ? this.page() : 1,
    retry: this.listingRetry(),
  }));
  private readonly countRequest = computed(() => ({
    days: this.days(),
    dateFilterReady: this.dateFilterStatus() === 'success',
    retry: this.orderCountRetry(),
  }));

  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<OrderRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('selectRowCell');
  private readonly orderNoCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('orderNoCell');
  private readonly paymentCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('paymentCell');
  private readonly orderStatusCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('orderStatusCell');
  private readonly shippingCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('shippingCell');

  constructor() {
    toObservable(this.dateFilterRetry)
      .pipe(
        switchMap(() => {
          this.dateFilterStatus.set('loading');
          this.dateFilterError.set('');
          this.orderCounts.set(null);
          this.countLoadStatus.set('loading');
          this.countError.set('');
          return this.sellerVerificationService.getDateFilters().pipe(
            tap((options) => {
              this.dateFilterOptions.set(options);
              // CHANGED: Sellers start on the 30-day range; Admins keep the 7-day range.
              const defaultDays = this.isSeller ? SELLER_DEFAULT_DAYS : ADMIN_DEFAULT_DAYS;
              const selected = options.find((option) => option.days === defaultDays) ?? options[0];
              if (!selected) {
                const message = 'The date filter API returned no usable options.';
                this.dateFilterStatus.set('error');
                this.dateFilterError.set(message);
                this.countLoadStatus.set('error');
                this.countError.set(message);
                this.loadStatus.set('error');
                this.loadError.set(message);
                this.toast.showError(message);
                return;
              }
              this.range.set(String(selected.id));
              this.dateFilterStatus.set('success');
            }),
            catchError((error: unknown) => {
              const message = this.sellerVerificationService.getDateFilterErrorMessage(error);
              this.dateFilterOptions.set([]);
              this.range.set('');
              this.dateFilterStatus.set('error');
              this.dateFilterError.set(message);
              this.countLoadStatus.set('error');
              this.countError.set(message);
              this.loadStatus.set('error');
              this.loadError.set(message);
              this.toast.showError(message);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.countRequest)
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous.days === current.days &&
            previous.dateFilterReady === current.dateFilterReady &&
            previous.retry === current.retry,
        ),
        switchMap(({ days, dateFilterReady }) => {
          // CHANGED: Sellers get their counts from the listing response (`dashboard`), not order_count/get.
          if (this.isSeller || !dateFilterReady || days === undefined) return EMPTY;
          this.countLoadStatus.set('loading');
          this.countError.set('');
          this.orderCounts.set(null);
          return defer(() => this.orderService.getManagementCounts(days)).pipe(
            tap((counts) => {
              this.orderCounts.set(counts);
              this.countLoadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.orderCounts.set(null);
              this.countError.set(this.errorMessage(error, 'Order counts could not be loaded.'));
              this.countLoadStatus.set('error');
              this.toast.showError(this.countError());
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.orderStatusRetry)
      .pipe(
        switchMap(() => {
          this.orderStatusLoadStatus.set('loading');
          return this.orderService.getOrderStatuses().pipe(
            tap((options) => {
              this.orderStatusOptions.set(options);
              this.orderStatusLoadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.orderStatusOptions.set([]);
              this.orderStatusLoadStatus.set('error');
              this.toast.showError(this.errorMessage(error, 'Order statuses could not be loaded.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.paymentStatusRetry)
      .pipe(
        switchMap(() => {
          this.paymentStatusLoadStatus.set('loading');
          return this.orderService.getPaymentStatuses().pipe(
            tap((options) => {
              this.paymentStatusOptions.set(options);
              this.paymentStatusLoadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.paymentStatusOptions.set([]);
              this.paymentStatusLoadStatus.set('error');
              this.toast.showError(this.errorMessage(error, 'Payment statuses could not be loaded.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.shippingStatusRetry)
      .pipe(
        switchMap(() => {
          this.shippingStatusLoadStatus.set('loading');
          return this.orderService.getShippingStatuses().pipe(
            tap((options) => {
              this.shippingStatusOptions.set(options);
              this.shippingStatusLoadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.shippingStatusOptions.set([]);
              this.shippingStatusLoadStatus.set('error');
              this.toast.showError(this.errorMessage(error, 'Shipping statuses could not be loaded.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.pageRequest)
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous.days === current.days &&
            previous.dateFilterReady === current.dateFilterReady &&
            previous.orderStatusId === current.orderStatusId &&
            previous.paymentStatusId === current.paymentStatusId &&
            previous.shippingStatusId === current.shippingStatusId &&
            previous.search === current.search &&
            previous.page === current.page &&
            previous.retry === current.retry,
        ),
        switchMap(({ days, dateFilterReady, orderStatusId, paymentStatusId, shippingStatusId, search, page }) => {
          if (!dateFilterReady || days === undefined) return EMPTY;
          this.loadStatus.set('loading');
          this.loadError.set('');
          // CHANGED: the request now depends on the role; the response handling below is shared.
          return defer(() =>
            this.loadOrders({ days, orderStatusId, paymentStatusId, shippingStatusId, search, page }),
          ).pipe(
            tap(({ orders, totalRecords, counts }) => {
              this.orders.set(orders);
              this.totalRecords.set(totalRecords ?? 0);
              if (counts) {
                this.orderCounts.set(counts);
                this.countError.set('');
                this.countLoadStatus.set('success');
              }
              this.loadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.loadError.set(this.errorMessage(error, 'Orders could not be loaded.'));
              this.loadStatus.set('error');
              if (this.isSeller) {
                // The Seller summary cards come from this same request.
                this.orderCounts.set(null);
                this.countError.set(this.loadError());
                this.countLoadStatus.set('error');
              }
              this.toast.showError(this.loadError());
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // CHANGED (new): Seller search is sent to the API, debounced, and restarts at page 1.
    if (this.isSeller) {
      toObservable(this.query)
        .pipe(
          map((query) => query.trim()),
          debounceTime(SEARCH_DEBOUNCE_MS),
          // Only a search that differs from the one last sent (initially '') starts a new request.
          filter((search) => search !== this.sellerSearch()),
          takeUntilDestroyed(),
        )
        .subscribe((search) => {
          this.sellerSearch.set(search);
          this.page.set(1);
        });
    }
  }

  /**
   * Admin: the existing order_dashboard/get request (DAYS + statuses).
   * Seller: the same endpoint with SELLER_ID, SEARCH, LIMIT and OFFSET; SELLER_ID is resolved from the
   * logged-in seller's record.
   */
  // CHANGED (new): picks the Admin or Seller order management request.
  private loadOrders(request: OrderListingRequest): Observable<OrderListing> {
    const filters = {
      DAYS: request.days,
      ORDER_STATUS: request.orderStatusId,
      PAYMENT_STATUS: request.paymentStatusId,
      SHIPPING_STATUS: request.shippingStatusId,
    };
    if (!this.isSeller) {
      return this.orderService
        .getManagementOrders(filters)
        .pipe(map((orders) => ({ orders, totalRecords: null, counts: null })));
    }
    return this.sellerOnboarding.getCurrentSellerId().pipe(
      switchMap((sellerId) =>
        this.orderService.getSellerManagementOrders({
          SELLER_ID: sellerId,
          ...filters,
          SEARCH: request.search,
          LIMIT: this.pageSize,
          OFFSET: (request.page - 1) * this.pageSize,
        }),
      ),
    );
  }

  protected readonly tableColumns = computed<readonly TableColumn<OrderRow>[]>(() => [
    {
      key: 'selection', label: '', width: '4%', selection: true,
      headerTemplate: this.selectAllHeader(), cellTemplate: this.selectRowCell(),
    },
    { key: 'orderNo', label: 'Order No', width: '8%', cellTemplate: this.orderNoCell() },
    { key: 'orderDate', label: 'Order Date', width: '9%' },
    { key: 'customer', label: 'Customer Name', width: '10%', emphasized: true },
    { key: 'mobile', label: 'Mobile No', width: '11%' },
    { key: 'products', label: 'Products', width: '9%' },
    { key: 'quantity', label: 'Quantity', width: '7%' },
    { key: 'amount', label: 'Order Amount', width: '9%', bold: true },
    { key: 'paymentStatus', label: 'Payment Status', width: '9%', cellTemplate: this.paymentCell() },
    { key: 'orderStatus', label: 'Order Status', width: '9%', cellTemplate: this.orderStatusCell() },
    { key: 'shippingStatus', label: 'Shipping Status', width: '9%', cellTemplate: this.shippingCell() },
  ]);

  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    const orderStatuses = statusNameMap(this.orderStatusOptions());
    const paymentStatuses = statusNameMap(this.paymentStatusOptions());
    const shippingStatuses = statusNameMap(this.shippingStatusOptions());
    const rows = this.orders().map((order) =>
      toOrderRow(order, orderStatuses, paymentStatuses, shippingStatuses),
    );
    // CHANGED: Seller rows are already searched by the API (SEARCH), so they are not filtered again here.
    if (this.isSeller) return rows;
    return rows.filter((row) =>
      !query || `${row.orderNo} ${row.customer} ${row.mobile}`.toLowerCase().includes(query),
    );
  });

  protected readonly visibleRows = computed(() => {
    // CHANGED: a Seller response is already one page (LIMIT/OFFSET); Admin still pages in the browser.
    if (this.isSeller) return this.filteredRows();
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

  /** Order count for the pagination: total_records for a Seller, the filtered list length for an Admin. */
  // CHANGED (new)
  protected readonly totalOrders = computed(() =>
    this.isSeller ? this.totalRecords() : this.filteredRows().length,
  );

  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visibleRows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.id));
  });

  protected paymentTone(status: string): BadgeTone {
    return PAYMENT_TONES[status.toUpperCase()] ?? 'neutral';
  }

  protected orderTone(status: string): BadgeTone {
    return ORDER_TONES[status.toUpperCase()] ?? 'neutral';
  }

  protected shippingTone(status: string): BadgeTone {
    return SHIPPING_TONES[status.toUpperCase()] ?? 'neutral';
  }

  protected setQuery(event: Event): void {
    this.query.set(eventValue(event) ?? '');
    // CHANGED: a Seller's page is reset when the debounced search is sent (see the constructor).
    if (!this.isSeller) this.page.set(1);
  }

  protected setFilter(filter: 'orderStatus' | 'paymentStatus' | 'shippingStatus', event: Event): void {
    const rawValue = eventValue(event) ?? '';
    const options =
      filter === 'orderStatus'
        ? this.orderStatusOptions()
        : filter === 'paymentStatus'
          ? this.paymentStatusOptions()
          : this.shippingStatusOptions();
    const selected = options.find(
      (option) => String(option.id) === rawValue || option.label === rawValue,
    );
    this[filter].set(rawValue === '' ? String(FILTER_ALL) : String(selected?.id ?? rawValue));
    this.page.set(1);
  }

  protected setRange(value: string): void {
    if (value === this.range()) return;
    this.range.set(value);
    this.page.set(1);
  }

  protected retryLoad(): void {
    this.listingRetry.update((retry) => retry + 1);
  }

  protected retryOrderCounts(): void {
    // CHANGED: Seller counts come from the listing request, so retrying them retries the listing.
    if (this.isSeller) {
      this.retryLoad();
      return;
    }
    this.orderCountRetry.update((retry) => retry + 1);
  }

  protected retryDateFilters(): void {
    this.dateFilterRetry.update((retry) => retry + 1);
  }

  protected retryOrderStatuses(): void {
    this.orderStatusRetry.update((retry) => retry + 1);
  }

  protected retryPaymentStatuses(): void {
    this.paymentStatusRetry.update((retry) => retry + 1);
  }

  protected retryShippingStatuses(): void {
    this.shippingStatusRetry.update((retry) => retry + 1);
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }

  protected toggleSelected(id: number, checked: boolean): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected toggleAllVisible(checked: boolean): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      for (const row of this.visibleRows()) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  /** Exports the filtered orders (or only the ticked ones) as CSV. */
  protected exportOrders(): void {
    const selected = this.selectedIds();
    const rows = this.filteredRows().filter((row) => !selected.size || selected.has(row.id));
    const header = ['Order No', 'Order Date', 'Customer Name', 'Mobile No', 'Products', 'Quantity', 'Order Amount', 'Payment Status', 'Order Status', 'Shipping Status'];
    const lines = rows.map((row) =>
      [row.orderNo, row.orderDate, row.customer, row.mobile, row.products, row.quantity, row.amount, row.paymentStatus, row.orderStatus, row.shippingStatus]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );
    const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orders.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
