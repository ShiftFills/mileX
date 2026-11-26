import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, debounceTime, defer, distinctUntilChanged, filter, finalize, map, switchMap, tap } from 'rxjs';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { DateRangeFilter, DateRangeOption } from '@shared/components/date-range-filter/date-range-filter';
import { Dialog } from '@shared/components/dialog/dialog';
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
  // CHANGED (new): raw values the Admin table sorts by (the columns above are display text).
  orderTime: number | null;
  amountValue: number | null;
}

// CHANGED: no trend: the order count APIs send no previous-period figures, so the hardcoded "%+8.2"-style trends
// (which were not real data) are no longer shown.
interface OrderStat {
  label: string;
  value: string;
  prefix?: string;
  icon: StatCardIcon;
  tone: StatCardTone;
}

interface OrderStatDefinition extends Omit<OrderStat, 'value'> {
  key: keyof OrderManagementCounts;
}

/** One listing response: Admin gets the whole filtered list; Seller gets one API page with its counts. */
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

/** Table columns the Admin can sort by (Admin has the whole filtered list, so sorting covers every page). */
// CHANGED (new)
type SortKey = 'orderNo' | 'orderDate' | 'customer' | 'amount';
type SortDirection = 'asc' | 'desc';

/** The status update form: the selected status IDs, as the <select> values ('' when none is selected). */
// CHANGED (new)
interface StatusForm {
  orderStatus: string;
  paymentStatus: string;
  shippingStatus: string;
}
type StatusField = keyof StatusForm;

/** A labelled value of the order details dialog. */
// CHANGED (new)
interface DetailField {
  label: string;
  value: string;
}

const PAGE_SIZE = 6;
const FILTER_ALL = -1;
const ADMIN_DEFAULT_DAYS = 7;
// Seller defaults follow the Seller API request (DAYS=30, ORDER_STATUS=-1, LIMIT=10).
const SELLER_DEFAULT_DAYS = 30;
const SELLER_PAGE_SIZE = 10;
/** Seller search is done by the API, so typing is debounced before a request is sent. */
const SEARCH_DEBOUNCE_MS = 400;
// CHANGED: more status names get a colour (labels come from the status APIs; an unknown one stays neutral).
const PAYMENT_TONES: Record<string, BadgeTone> = {
  PAID: 'success',
  COMPLETED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  REFUNDED: 'info',
};
const ORDER_TONES: Record<string, BadgeTone> = {
  PLACED: 'info',
  CONFIRMED: 'info',
  PENDING: 'warning',
  PROCESSING: 'warning',
  SHIPPED: 'purple',
  DELIVERED: 'success',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  RETURNED: 'neutral',
};
const SHIPPING_TONES: Record<string, BadgeTone> = {
  SHIPPED: 'purple',
  'IN TRANSIT': 'info',
  'OUT FOR DELIVERY': 'info',
  DELIVERED: 'success',
  'NOT SHIPPED': 'neutral',
  RETURNED: 'danger',
};

const STAT_DEFINITIONS: readonly OrderStatDefinition[] = [
  { key: 'totalOrders', label: 'Total Orders', icon: 'cart', tone: 'indigo' },
  { key: 'totalRevenue', label: 'Total Revenue', prefix: '₹', icon: 'revenue', tone: 'green' },
  { key: 'pendingOrders', label: 'Pending Orders', icon: 'pending', tone: 'red' },
  { key: 'shippedOrders', label: 'Shipped Orders', icon: 'shipped', tone: 'amber' },
  { key: 'deliveredOrders', label: 'Delivered Orders', icon: 'delivered', tone: 'cyan' },
];

type LookupStatus = 'loading' | 'success' | 'error';

interface StatusMaps {
  order: ReadonlyMap<number, string>;
  payment: ReadonlyMap<number, string>;
  shipping: ReadonlyMap<number, string>;
}

function statusNameMap(options: readonly StatusOption[]): ReadonlyMap<number, string> {
  return new Map(options.map(({ id, label }) => [id, label]));
}

function optionLabel(options: ReadonlyMap<number, string>, rawId: unknown): string {
  if (typeof rawId !== 'number' && (typeof rawId !== 'string' || !rawId.trim())) return '—';
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return '—';
  return options.get(id) ?? '—';
}

/** ORDER_DATE as "16 Nov 2026, 12:20 PM" (local time); text the API sends in another form is shown as it is. */
// CHANGED (new): the table showed the raw ISO timestamp.
function displayDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? formatDate(time, 'dd MMM yyyy, h:mm a', 'en-US') : value;
}

function displayAmount(amount: number | null): string {
  return amount === null
    ? '—'
    : `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toOrderRow(order: OrderManagementOrder, statuses: StatusMaps): OrderRow {
  const time = Date.parse(order.orderDate);
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderDate: displayDate(order.orderDate),
    customer: order.customer,
    mobile: order.mobile,
    // Shows PRODUCT_NAME when the API sends it (Seller response); otherwise the product ID.
    products: order.productName ?? (order.productId === null ? '—' : String(order.productId)),
    quantity: order.quantity ?? '—',
    amount: displayAmount(order.amount),
    paymentStatus: optionLabel(statuses.payment, order.paymentStatusId),
    orderStatus: optionLabel(statuses.order, order.orderStatusId),
    shippingStatus: optionLabel(statuses.shipping, order.shippingStatusId),
    orderTime: Number.isFinite(time) ? time : null,
    amountValue: order.amount,
  };
}

/** Compares two rows by a sort key; rows without a date or amount go last in both directions. */
// CHANGED (new)
function compareRows(a: OrderRow, b: OrderRow, key: SortKey, direction: SortDirection): number {
  const factor = direction === 'asc' ? 1 : -1;
  if (key === 'orderNo') return factor * a.orderNo.localeCompare(b.orderNo, undefined, { numeric: true });
  if (key === 'customer') return factor * a.customer.localeCompare(b.customer, undefined, { sensitivity: 'base' });
  const [left, right] = key === 'orderDate' ? [a.orderTime, b.orderTime] : [a.amountValue, b.amountValue];
  if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
  return factor * (left - right);
}

/** A positive status ID from a <select> value, else null. */
// CHANGED (new)
function statusId(value: string): number | null {
  const id = Number(value);
  return value.trim() && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The options of one status dropdown in the update form: the lookup's statuses, plus the order's current status when
 * the lookup does not list it (so the dialog always shows what the order has now).
 */
// CHANGED (new)
function withCurrentStatus(options: readonly StatusOption[], currentId: number | null | undefined): StatusOption[] {
  if (currentId === null || currentId === undefined || !Number.isSafeInteger(currentId) || currentId <= 0) {
    return [...options];
  }
  return options.some((option) => option.id === currentId)
    ? [...options]
    : [...options, { id: currentId, label: `Status #${currentId}` }];
}

const EMPTY_FORM: StatusForm = { orderStatus: '', paymentStatus: '', shippingStatus: '' };

/**
 * Order Management (Admin and Seller).
 * - Admin: order_dashboard/get?DAYS=…&ORDER_STATUS=…&PAYMENT_STATUS=…&SHIPPING_STATUS=… (DAYS 7 and -1 for every
 *   status at first), searched, sorted and paged in the browser; the summary cards come from order_count/get. An
 *   order's details open in a dialog where its order, payment and shipping statuses are updated with PUT
 *   place_order/update.
 * - Seller: the same endpoint with SELLER_ID, SEARCH, LIMIT and OFFSET (searched and paged by the API), with the
 *   summary cards from that response. Sellers can view an order's details, but not change its statuses.
 * Every status name and ID comes from the status lookups (all_status/get, payment_status/get, shipping_status/get).
 */
@Component({
  selector: 'app-admin-order-management',
  imports: [
    Badge, Button, Card, Checkbox, DateRangeFilter, Dialog, ExportButton, Input, LoadingSpinner, PageHeading, Pagination,
    Select, StatCard, Table,
  ],
  templateUrl: './order-management.html',
  styleUrl: './order-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderManagement {
  private readonly orderService = inject(OrderService);
  private readonly sellerVerificationService = inject(SellerVerificationService);
  private readonly sellerOnboarding = inject(SellerOnboardingService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  // Sellers see only their own orders, searched and paged by the API (SELLER_ID, SEARCH, LIMIT, OFFSET) with the
  // summary cards from the same response. Admins keep the existing requests.
  protected readonly isSeller = inject(AuthService).user()?.userType?.trim().toUpperCase() === 'SELLER';
  /** Only Admins change an order's statuses (PUT place_order/update); Sellers see them read-only. */
  // CHANGED (new)
  protected readonly canUpdate = !this.isSeller;
  protected readonly pageSize = this.isSeller ? SELLER_PAGE_SIZE : PAGE_SIZE;
  /** Seller only: total_records of the current API query (Admin pages its full list in the browser). */
  private readonly totalRecords = signal(0);
  /** Seller only: the debounced search text sent as SEARCH. */
  private readonly sellerSearch = signal('');
  protected readonly orderCounts = signal<OrderManagementCounts | null>(null);
  protected readonly countLoadStatus = signal<LookupStatus>('loading');
  protected readonly countError = signal('');
  private readonly orderCountRetry = signal(0);
  protected readonly stats = computed<readonly OrderStat[]>(() => {
    const counts = this.orderCounts();
    return STAT_DEFINITIONS.map(({ key, ...definition }) => ({
      ...definition,
      value: counts?.[key].toLocaleString('en-IN') ?? '—',
    }));
  });
  protected readonly orders = signal<readonly OrderManagementOrder[]>([]);
  protected readonly loadStatus = signal<LookupStatus>('loading');
  protected readonly loadError = signal('');
  private readonly listingRetry = signal(0);
  /**
   * Set just before a reload that keeps the table and the cards on screen while it runs (after a status update), so
   * they do not flash a loading state. Read once by the next listing / count request.
   */
  // CHANGED (new)
  private quietListing = false;
  private quietCounts = false;
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
  /** The DATE_FILTER_ID of the default range (7 days for Admin, 30 for Seller), once the date filters loaded. */
  // CHANGED (new): used by "Clear filters".
  private readonly defaultRange = signal('');
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
    { id: FILTER_ALL, label: 'All Order Status' },
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

  protected readonly query = signal('');
  // CHANGED: Admins also start on every order status (ORDER_STATUS=-1); it used to be 1.
  protected readonly orderStatus = signal(String(FILTER_ALL));
  protected readonly paymentStatus = signal(String(FILTER_ALL));
  protected readonly shippingStatus = signal(String(FILTER_ALL));
  /** Selected DATE_FILTER_ID; listing requests use its mapped DAYS value. */
  protected readonly range = signal('');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());
  /** The Admin table's sort (null: the API's order). */
  // CHANGED (new)
  protected readonly sort = signal<{ key: SortKey; direction: SortDirection } | null>(null);

  /** True when a search or a filter other than the defaults is applied (shows "Clear filters"). */
  // CHANGED (new)
  protected readonly hasActiveFilters = computed(
    () =>
      this.query().trim() !== '' ||
      this.orderStatus() !== String(FILTER_ALL) ||
      this.paymentStatus() !== String(FILTER_ALL) ||
      this.shippingStatus() !== String(FILTER_ALL) ||
      (this.defaultRange() !== '' && this.range() !== this.defaultRange()),
  );

  private readonly pageRequest = computed(() => ({
    days: this.days(),
    dateFilterReady: this.dateFilterStatus() === 'success',
    orderStatusId: Number(this.orderStatus()),
    paymentStatusId: Number(this.paymentStatus()),
    shippingStatusId: Number(this.shippingStatus()),
    // Seller requests also depend on the search text and page; Admin's never change here, because Admin searches
    // and pages the loaded list in the browser.
    search: this.sellerSearch(),
    page: this.isSeller ? this.page() : 1,
    retry: this.listingRetry(),
  }));
  private readonly countRequest = computed(() => ({
    days: this.days(),
    dateFilterReady: this.dateFilterStatus() === 'success',
    retry: this.orderCountRetry(),
  }));

  // ---- Order details and status update (CHANGED (new)) ----
  /** The order whose details dialog is open. */
  protected readonly activeOrder = signal<OrderManagementOrder | null>(null);
  protected readonly statusForm = signal<StatusForm>(EMPTY_FORM);
  /** True while PUT place_order/update runs: one update at a time, and the dialog stays open. */
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  /** The element that opened the dialog, focused again when it closes. */
  private dialogOpener: HTMLElement | null = null;
  private readonly detailsDialog = viewChild<ElementRef<HTMLElement>>('detailsDialog');

  private readonly statusMaps = computed<StatusMaps>(() => ({
    order: statusNameMap(this.orderStatusOptions()),
    payment: statusNameMap(this.paymentStatusOptions()),
    shipping: statusNameMap(this.shippingStatusOptions()),
  }));
  protected readonly activeRow = computed(() => {
    const order = this.activeOrder();
    return order ? toOrderRow(order, this.statusMaps()) : null;
  });
  protected readonly orderDetails = computed<readonly DetailField[]>(() => {
    const row = this.activeRow();
    if (!row) return [];
    return [
      { label: 'Order No', value: row.orderNo },
      { label: 'Order Date', value: row.orderDate },
      { label: 'Customer Name', value: row.customer },
      { label: 'Customer Mobile', value: row.mobile },
      { label: this.activeOrder()?.productName ? 'Product' : 'Product ID', value: row.products },
      { label: 'Quantity', value: String(row.quantity) },
      { label: 'Order Amount', value: row.amount },
    ];
  });
  protected readonly updateOrderStatusOptions = computed(() =>
    withCurrentStatus(this.orderStatusOptions(), this.activeOrder()?.orderStatusId),
  );
  protected readonly updatePaymentStatusOptions = computed(() =>
    withCurrentStatus(this.paymentStatusOptions(), this.activeOrder()?.paymentStatusId),
  );
  protected readonly updateShippingStatusOptions = computed(() =>
    withCurrentStatus(this.shippingStatusOptions(), this.activeOrder()?.shippingStatusId),
  );
  /** A status lookup failed: the update form cannot offer every status, so it cannot be saved. */
  protected readonly statusLookupFailed = computed(
    () =>
      this.orderStatusLoadStatus() === 'error' ||
      this.paymentStatusLoadStatus() === 'error' ||
      this.shippingStatusLoadStatus() === 'error',
  );
  /** Every status of the form is selected. */
  protected readonly formComplete = computed(() => {
    const form = this.statusForm();
    return [form.orderStatus, form.paymentStatus, form.shippingStatus].every((value) => statusId(value) !== null);
  });
  /** At least one status differs from the order's current one. */
  protected readonly formChanged = computed(() => {
    const order = this.activeOrder();
    const form = this.statusForm();
    if (!order) return false;
    return (
      statusId(form.orderStatus) !== order.orderStatusId ||
      statusId(form.paymentStatus) !== order.paymentStatusId ||
      statusId(form.shippingStatus) !== order.shippingStatusId
    );
  });
  protected readonly canSave = computed(
    () =>
      this.canUpdate &&
      !this.saving() &&
      !this.statusLookupsLoading() &&
      !this.statusLookupFailed() &&
      this.formComplete() &&
      this.formChanged(),
  );

  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<OrderRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('selectRowCell');
  private readonly sortHeader = viewChild<TemplateRef<TableHeaderContext<OrderRow>>>('sortHeader');
  private readonly orderNoCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('orderNoCell');
  private readonly paymentCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('paymentCell');
  private readonly orderStatusCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('orderStatusCell');
  private readonly shippingCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('shippingCell');
  private readonly actionsCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('actionsCell');

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
              // Sellers start on the 30-day range; Admins on the 7-day range.
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
              this.defaultRange.set(String(selected.id));
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
          // CHANGED: a quiet reload (after a status update) keeps the current cards until the new counts arrive.
          const quiet = this.quietCounts;
          this.quietCounts = false;
          // Sellers get their counts from the listing response (`dashboard`), not order_count/get.
          if (this.isSeller || !dateFilterReady || days === undefined) return EMPTY;
          if (!quiet) {
            this.countLoadStatus.set('loading');
            this.countError.set('');
            this.orderCounts.set(null);
          }
          return defer(() => this.orderService.getManagementCounts(days)).pipe(
            tap((counts) => {
              this.orderCounts.set(counts);
              this.countError.set('');
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
          // CHANGED: a quiet reload (after a status update) keeps the current rows on screen until it is answered.
          const quiet = this.quietListing;
          this.quietListing = false;
          if (!dateFilterReady || days === undefined) return EMPTY;
          if (!quiet) {
            this.loadStatus.set('loading');
            this.loadError.set('');
          }
          // The request depends on the role; the response handling below is shared.
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
              const message = this.errorMessage(error, 'Orders could not be loaded.');
              if (quiet) {
                // The update itself succeeded and its row is already updated; keep the table as it is.
                this.toast.showError(message);
                return EMPTY;
              }
              this.loadError.set(message);
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

    // Seller search is sent to the API, debounced, and restarts at page 1.
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
   * Admin: order_dashboard/get with DAYS and the three status filters (-1: every status).
   * Seller: the same endpoint with SELLER_ID, SEARCH, LIMIT and OFFSET; SELLER_ID is resolved from the logged-in
   * seller's record.
   */
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

  // CHANGED: sortable Order No / Order Date / Customer / Amount headers (Admin), and an Actions column.
  protected readonly tableColumns = computed<readonly TableColumn<OrderRow>[]>(() => {
    const sortHeader = this.isSeller ? undefined : this.sortHeader();
    return [
      {
        key: 'selection', label: '', width: '4%', selection: true,
        headerTemplate: this.selectAllHeader(), cellTemplate: this.selectRowCell(),
      },
      { key: 'orderNo', label: 'Order No', width: '9%', headerTemplate: sortHeader, cellTemplate: this.orderNoCell() },
      { key: 'orderDate', label: 'Order Date', width: '10%', headerTemplate: sortHeader },
      { key: 'customer', label: 'Customer Name', width: '10%', emphasized: true, headerTemplate: sortHeader },
      { key: 'mobile', label: 'Mobile No', width: '9%' },
      { key: 'products', label: 'Products', width: '8%' },
      { key: 'quantity', label: 'Qty', width: '5%', align: 'center' },
      { key: 'amount', label: 'Order Amount', width: '9%', bold: true, headerTemplate: sortHeader },
      { key: 'paymentStatus', label: 'Payment Status', width: '9%', cellTemplate: this.paymentCell() },
      { key: 'orderStatus', label: 'Order Status', width: '9%', cellTemplate: this.orderStatusCell() },
      { key: 'shippingStatus', label: 'Shipping Status', width: '10%', cellTemplate: this.shippingCell() },
      { key: 'actions', label: 'Actions', width: '8%', align: 'center', cellTemplate: this.actionsCell() },
    ];
  });

  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    const statuses = this.statusMaps();
    const rows = this.orders().map((order) => toOrderRow(order, statuses));
    // Seller rows are already searched by the API (SEARCH), so they are not filtered again here.
    if (this.isSeller) return rows;
    // CHANGED: the product name/ID is searched too.
    return rows.filter((row) =>
      !query || `${row.orderNo} ${row.customer} ${row.mobile} ${row.products}`.toLowerCase().includes(query),
    );
  });

  /** The Admin list in the chosen sort order (the API's order without one). Seller rows stay as the API sent them. */
  // CHANGED (new)
  private readonly sortedRows = computed(() => {
    const rows = this.filteredRows();
    const sort = this.sort();
    if (this.isSeller || !sort) return rows;
    return [...rows].sort((a, b) => compareRows(a, b, sort.key, sort.direction));
  });

  /** Admin: the page on screen, kept within the pages there are (e.g. after an update moved a row out of the list). */
  // CHANGED (new)
  protected readonly currentPage = computed(() => {
    if (this.isSeller) return this.page();
    return Math.min(this.page(), Math.max(1, Math.ceil(this.filteredRows().length / PAGE_SIZE)));
  });

  protected readonly visibleRows = computed(() => {
    // A Seller response is already one page (LIMIT/OFFSET); Admin pages in the browser.
    if (this.isSeller) return this.sortedRows();
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.sortedRows().slice(start, start + PAGE_SIZE);
  });

  /** Order count for the pagination: total_records for a Seller, the filtered list length for an Admin. */
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
    // A Seller's page is reset when the debounced search is sent (see the constructor).
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

  /** Back to the default range, every status and no search. */
  // CHANGED (new)
  protected clearFilters(): void {
    this.query.set('');
    this.orderStatus.set(String(FILTER_ALL));
    this.paymentStatus.set(String(FILTER_ALL));
    this.shippingStatus.set(String(FILTER_ALL));
    if (this.defaultRange()) this.range.set(this.defaultRange());
    this.page.set(1);
  }

  /** Sorts the Admin table by a column: ascending first, then descending. */
  // CHANGED (new)
  protected toggleSort(key: string): void {
    if (!isSortKey(key)) return;
    const current = this.sort();
    this.sort.set({ key, direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc' });
    this.page.set(1);
  }

  protected sortDirection(key: string): SortDirection | null {
    const sort = this.sort();
    return sort?.key === key ? sort.direction : null;
  }

  protected retryLoad(): void {
    this.listingRetry.update((retry) => retry + 1);
  }

  protected retryOrderCounts(): void {
    // Seller counts come from the listing request, so retrying them retries the listing.
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

  /** Retries every status lookup that failed (from the details dialog). */
  // CHANGED (new)
  protected retryFailedStatusLookups(): void {
    if (this.orderStatusLoadStatus() === 'error') this.retryOrderStatuses();
    if (this.paymentStatusLoadStatus() === 'error') this.retryPaymentStatuses();
    if (this.shippingStatusLoadStatus() === 'error') this.retryShippingStatuses();
  }

  // ---- Order details and status update ----

  /** Opens an order's details, with its current statuses selected in the update form. */
  // CHANGED (new)
  protected openDetails(orderId: number, opener?: EventTarget | null): void {
    const order = this.orders().find((candidate) => candidate.id === orderId);
    if (!order) return;
    this.dialogOpener = opener instanceof HTMLElement ? opener : null;
    this.activeOrder.set(order);
    this.statusForm.set({
      orderStatus: order.orderStatusId === null ? '' : String(order.orderStatusId),
      paymentStatus: order.paymentStatusId === null ? '' : String(order.paymentStatusId),
      shippingStatus: order.shippingStatusId === null ? '' : String(order.shippingStatusId),
    });
    this.saveError.set('');
    afterNextRender(() => this.detailsDialog()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Closes the dialog (not while an update runs: it closes only once the update succeeded or failed). */
  // CHANGED (new)
  protected closeDetails(): void {
    if (this.saving()) return;
    this.activeOrder.set(null);
    this.statusForm.set(EMPTY_FORM);
    this.saveError.set('');
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    if (opener?.isConnected) opener.focus();
  }

  // CHANGED (new)
  protected setStatusField(field: StatusField, event: Event): void {
    this.statusForm.update((form) => ({ ...form, [field]: eventValue(event) ?? '' }));
    this.saveError.set('');
  }

  /**
   * Saves the form with PUT place_order/update `{ ORDER_ID, ORDER_STATUS, PAYMENT_STATUS, SHIPPING_STATUS }` (one
   * request at a time). On success: a toast, the row shows its new statuses at once, the dialog closes, and the list
   * and the summary cards are read again without leaving the page. On failure the dialog stays open with the reason.
   */
  // CHANGED (new)
  protected saveStatuses(): void {
    const order = this.activeOrder();
    if (!order || !this.canSave()) return;
    const form = this.statusForm();
    const orderStatusId = statusId(form.orderStatus);
    const paymentStatusId = statusId(form.paymentStatus);
    const shippingStatusId = statusId(form.shippingStatus);
    if (orderStatusId === null || paymentStatusId === null || shippingStatusId === null) return;

    this.saving.set(true);
    this.saveError.set('');
    this.orderService
      .updateOrderStatus({
        ORDER_ID: order.id,
        ORDER_STATUS: orderStatusId,
        PAYMENT_STATUS: paymentStatusId,
        SHIPPING_STATUS: shippingStatusId,
      })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (message) => {
          this.orders.update((orders) =>
            orders.map((candidate) =>
              candidate.id === order.id
                ? { ...candidate, orderStatusId, paymentStatusId, shippingStatusId }
                : candidate,
            ),
          );
          this.toast.showSuccess(message);
          this.saving.set(false);
          this.closeDetails();
          this.reloadQuietly();
        },
        error: (error: unknown) => {
          const message = this.orderService.orderUpdateErrorMessage(error);
          this.saveError.set(message);
          this.toast.showError(message);
        },
      });
  }

  /** Reads the list (and the Admin's counts) again, keeping the table and cards on screen meanwhile. */
  // CHANGED (new)
  private reloadQuietly(): void {
    this.quietListing = true;
    this.listingRetry.update((retry) => retry + 1);
    if (!this.isSeller) {
      this.quietCounts = true;
      this.orderCountRetry.update((retry) => retry + 1);
    }
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

  /** Exports the filtered orders (or only the ticked ones) as CSV, in the table's order. */
  protected exportOrders(): void {
    const selected = this.selectedIds();
    const rows = this.sortedRows().filter((row) => !selected.size || selected.has(row.id));
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

function isSortKey(key: string): key is SortKey {
  return key === 'orderNo' || key === 'orderDate' || key === 'customer' || key === 'amount';
}
