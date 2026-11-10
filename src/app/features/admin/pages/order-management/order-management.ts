import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, defer, distinctUntilChanged, switchMap, tap } from 'rxjs';
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
import { ToastService } from '@core/services/toast.service';
import { StatusOption } from '@shared/models/api.model';
import { DateFilterOption, SellerVerificationService } from '@features/admin/services/seller-verification.service';
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

const PAGE_SIZE = 6;
const FILTER_ALL = -1;
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
    products: order.productId === null ? '—' : String(order.productId),
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
  private readonly toast = inject(ToastService);
  protected readonly pageSize = PAGE_SIZE;
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
  protected readonly orderStatus = signal('1');
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
              const selected = options.find((option) => option.days === 7) ?? options[0];
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
          if (!dateFilterReady || days === undefined) return EMPTY;
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
            previous.retry === current.retry,
        ),
        switchMap(({ days, dateFilterReady, orderStatusId, paymentStatusId, shippingStatusId }) => {
          if (!dateFilterReady || days === undefined) return EMPTY;
          this.loadStatus.set('loading');
          this.loadError.set('');
          return defer(() =>
            this.orderService.getManagementOrders({
              DAYS: days,
              ORDER_STATUS: orderStatusId,
              PAYMENT_STATUS: paymentStatusId,
              SHIPPING_STATUS: shippingStatusId,
            }),
          ).pipe(
            tap((orders) => {
              this.orders.set(orders);
              this.loadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.loadError.set(this.errorMessage(error, 'Orders could not be loaded.'));
              this.loadStatus.set('error');
              this.toast.showError(this.loadError());
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
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
    return this.orders()
      .map((order) => toOrderRow(order, orderStatuses, paymentStatuses, shippingStatuses))
      .filter((row) =>
        !query || `${row.orderNo} ${row.customer} ${row.mobile}`.toLowerCase().includes(query),
      );
  });

  protected readonly visibleRows = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

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
    this.page.set(1);
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
