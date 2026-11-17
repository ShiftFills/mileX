import { formatDate as formatLocaleDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, LOCALE_ID, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, defer, distinctUntilChanged, finalize, switchMap, tap } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { OrderService } from '@features/orders/services/order.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { DateRangeFilter } from '@shared/components/date-range-filter/date-range-filter';
import { ExportButton } from '@shared/components/export-button/export-button';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { StatCard, StatCardIcon, StatCardTone } from '@shared/components/stat-card/stat-card';
import { Table, TableCellContext, TableColumn, TableHeaderContext } from '@shared/components/table/table';
import { ReturnReasonOption, ReturnRequestRow, ReturnRequestsPage, StatusOption } from '@shared/models';
import { ClickOutside } from '@shared/directives/click-outside';
import { eventValue } from '@shared/utils/form-events';

type LoadStatus = 'loading' | 'success' | 'error';

interface ReturnStat {
  label: string;
  value: string;
  trend: string;
  trendDirection: 'up' | 'down';
  trendTone: 'positive' | 'negative';
  icon: StatCardIcon;
  iconImage?: string;
  tone: StatCardTone;
}

const PAGE_SIZE = 10;
const VISIBLE_IMAGES = 2;
const ALL_FILTER = -1;
/** Same display format as the refund screen's dates (e.g. "16 Nov 2026"). */
const DATE_FORMAT = 'dd MMM y';
const STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  'IN TRANSIT': 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
};

const STATS: readonly ReturnStat[] = [
  { label: 'Total Requests', value: '—', trend: '', trendDirection: 'up', trendTone: 'positive', icon: 'returns', iconImage: '/images/totalRequest.svg', tone: 'indigo' },
  { label: 'Pending', value: '—', trend: '', trendDirection: 'up', trendTone: 'positive', icon: 'pending', iconImage: '/images/returnRequest-Pending.svg', tone: 'amber' },
  { label: 'Approved', value: '—', trend: '', trendDirection: 'up', trendTone: 'positive', icon: 'approved', tone: 'green' },
  { label: 'In Transit', value: '—', trend: '', trendDirection: 'down', trendTone: 'positive', icon: 'transit', tone: 'cyan' },
  { label: 'Rejected', value: '—', trend: '', trendDirection: 'down', trendTone: 'negative', icon: 'rejected', tone: 'red' },
];

function normalizedStatus(status: string | null): string {
  return (status ?? '').trim().toUpperCase().replace(/_/g, ' ');
}

@Component({
  selector: 'app-admin-return-request',
  imports: [Badge, Card, Checkbox, ClickOutside, DateRangeFilter, ExportButton, Input, LoadingSpinner, PageHeading, Pagination, Select, StatCard, Table],
  templateUrl: './return-request.html',
  styleUrl: './return-request.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnRequest {
  private readonly orderService = inject(OrderService);
  private readonly sellerOnboarding = inject(SellerOnboardingService);
  private readonly toast = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);
  private readonly destroyRef = inject(DestroyRef);
  // CHANGED (new): Sellers list only their own return requests (SELLER_ID + paging). That API has no
  // day/status/reason filters, so those controls are hidden for Sellers; Admins are unchanged.
  protected readonly isSeller = inject(AuthService).user()?.userType?.trim().toUpperCase() === 'SELLER';
  protected readonly pageSize = PAGE_SIZE;
  protected readonly visibleImages = VISIBLE_IMAGES;
  protected readonly stats = STATS;

  protected readonly tableRows = signal<readonly ReturnRequestRow[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly requestLoadStatus = signal<LoadStatus>('loading');
  protected readonly requestLoadError = signal('');
  private readonly listingRetry = signal(0);

  protected readonly statusOptions = signal<readonly StatusOption[]>([]);
  protected readonly statusLoadStatus = signal<LoadStatus>('loading');
  protected readonly statusLoadError = signal('');
  private readonly statusRetry = signal(0);
  protected readonly reasons = signal<readonly ReturnReasonOption[]>([]);
  protected readonly reasonLoadStatus = signal<LoadStatus>('loading');
  protected readonly reasonLoadError = signal('');
  private readonly reasonRetry = signal(0);

  protected readonly query = signal('');
  protected readonly statusId = signal(ALL_FILTER);
  protected readonly reasonId = signal(ALL_FILTER);
  protected readonly range = signal('30');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());
  protected readonly openActionMenuId = signal<number | null>(null);
  protected readonly actionInProgress = signal<number | null>(null);
  protected readonly statusValue = computed(() => {
    return String(this.statusId());
  });
  private readonly pageRequest = computed(() => ({
    days: Number(this.range()),
    statusId: this.statusId(),
    reasonId: this.reasonId(),
    page: this.page(),
    retry: this.listingRetry(),
  }));

  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<ReturnRequestRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('selectRowCell');
  private readonly orderNoCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('orderNoCell');
  private readonly productCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('productCell');
  private readonly reasonCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('reasonCell');
  private readonly imagesCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('imagesCell');
  private readonly addressCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('addressCell');
  private readonly statusCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('statusCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('actionCell');

  protected readonly tableColumns = computed<readonly TableColumn<ReturnRequestRow>[]>(() => [
    {
      key: 'selection', label: '', width: '5%', selection: true,
      headerTemplate: this.selectAllHeader(), cellTemplate: this.selectRowCell(),
    },
    { key: 'orderNumber', label: 'Order No', width: '10%', cellTemplate: this.orderNoCell() },
    { key: 'productName', label: 'Product', width: '11%', emphasized: true, cellTemplate: this.productCell() },
    { key: 'quantity', label: 'Quantity', width: '8%', align: 'center' },
    { key: 'reason', label: 'Return Reason', width: '14%', emphasized: true, cellTemplate: this.reasonCell() },
    { key: 'images', label: 'Return Images', width: '14%', cellTemplate: this.imagesCell() },
    { key: 'address', label: 'Pickup Address', width: '19%', cellTemplate: this.addressCell() },
    { key: 'status', label: 'Return Status', width: '9%', align: 'center', cellTemplate: this.statusCell() },
    { key: 'actions', label: 'Action', width: '8%', align: 'center', overflowVisible: true, cellTemplate: this.actionCell() },
  ]);

  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.tableRows().filter((row) => {
      const searchable = [
        row.returnId,
        row.orderNumber,
        row.productName,
        row.description,
        row.reason,
        row.customerName,
        row.customerMobile,
        row.address,
        row.status,
      ].join(' ').toLowerCase();
      return !query || searchable.includes(query);
    });
  });

  protected readonly visibleRows = computed(() => this.filteredRows());
  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visibleRows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.returnId));
  });

  constructor() {
    toObservable(this.statusRetry)
      .pipe(
        switchMap(() => {
          this.statusLoadStatus.set('loading');
          this.statusLoadError.set('');
          return defer(() => this.orderService.getOrderStatuses(10, 0)).pipe(
            tap((options) => {
              this.statusOptions.set(options);
              this.statusLoadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.statusOptions.set([]);
              this.statusLoadStatus.set('error');
              this.statusLoadError.set(this.errorMessage(error, 'Return statuses could not be loaded.'));
              this.toast.showError(this.statusLoadError());
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    // CHANGED: return reasons only feed the reason filter, which Sellers do not have.
    if (!this.isSeller) {
      toObservable(this.reasonRetry)
        .pipe(
          switchMap(() => {
            this.reasonLoadStatus.set('loading');
            this.reasonLoadError.set('');
            return defer(() => this.orderService.getReturnReasons()).pipe(
              tap((reasons) => {
                this.reasons.set(reasons);
                this.reasonLoadStatus.set('success');
              }),
              catchError((error: unknown) => {
                this.reasons.set([]);
                this.reasonLoadStatus.set('error');
                this.reasonLoadError.set(this.errorMessage(error, 'Return reasons could not be loaded.'));
                this.toast.showError(this.reasonLoadError());
                return EMPTY;
              }),
            );
          }),
          takeUntilDestroyed(),
        )
        .subscribe();
    }

    toObservable(this.pageRequest)
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous.days === current.days &&
            previous.statusId === current.statusId &&
            previous.reasonId === current.reasonId &&
            previous.page === current.page &&
            previous.retry === current.retry,
        ),
        switchMap(({ days, statusId, reasonId, page }) => {
          this.requestLoadStatus.set('loading');
          this.requestLoadError.set('');
          // CHANGED: the request now depends on the role; the response handling below is shared.
          return defer(() => this.loadReturnRequests(days, statusId, reasonId, page)).pipe(
            tap((result) => {
              this.tableRows.set(result.requests);
              this.totalRecords.set(result.totalRecords);
              this.requestLoadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.tableRows.set([]);
              this.totalRecords.set(0);
              this.requestLoadError.set(this.errorMessage(error, 'Return requests could not be loaded.'));
              this.requestLoadStatus.set('error');
              this.toast.showError(this.requestLoadError());
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected statusTone(status: string | null): BadgeTone {
    return STATUS_TONES[this.normalizedRequestStatus(status)] ?? 'neutral';
  }

  protected statusLabel(status: string | null): string {
    const value = this.normalizedRequestStatus(status);
    if (!value) return '—';
    return value
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  protected formatDate(value: string | null): string {
    if (!value) return '—';
    if (Number.isNaN(Date.parse(value))) return value;
    try {
      return formatLocaleDate(value, DATE_FORMAT, this.locale);
    } catch {
      return value;
    }
  }

  protected setQuery(event: Event): void {
    const value = eventValue(event) ?? '';
    if (value === this.query()) return;
    this.query.set(value);
    this.page.set(1);
  }

  protected setRange(value: string): void {
    const days = Number(value);
    if (!Number.isSafeInteger(days) || days < 1 || days === Number(this.range())) return;
    this.range.set(String(days));
    this.page.set(1);
  }

  protected setFilter(filter: 'status' | 'reason', event: Event): void {
    const rawValue = eventValue(event);
    const value = rawValue === undefined ? NaN : Number(rawValue);
    if (!Number.isSafeInteger(value) || (value !== ALL_FILTER && value <= 0)) return;

    if (filter === 'status') {
      if (value === this.statusId()) return;
      this.statusId.set(value);
    } else {
      if (value === this.reasonId()) return;
      this.reasonId.set(value);
    }
    this.page.set(1);
  }

  protected retryRequests(): void {
    this.listingRetry.update((retry) => retry + 1);
  }

  protected retryStatuses(): void {
    this.statusRetry.update((retry) => retry + 1);
  }

  protected retryReasons(): void {
    this.reasonRetry.update((retry) => retry + 1);
  }

  protected setPage(page: number): void {
    this.page.set(page);
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
        if (checked) next.add(row.returnId);
        else next.delete(row.returnId);
      }
      return next;
    });
  }

  protected toggleActionMenu(id: number): void {
    this.openActionMenuId.update((openId) => (openId === id ? null : id));
  }

  protected closeActionMenu(id: number): void {
    if (this.openActionMenuId() === id) this.openActionMenuId.set(null);
  }

  protected canReview(row: ReturnRequestRow): boolean {
    return this.normalizedRequestStatus(row.status) === 'PENDING';
  }

  protected review(row: ReturnRequestRow, decision: 'APPROVED' | 'REJECTED'): void {
    if (!this.canReview(row) || this.actionInProgress() !== null) return;
    this.actionInProgress.set(row.returnId);
    defer(() =>
      this.orderService.updateReturnRequestStatus({
        RETURN_ID: row.returnId,
        RETURN_STATUS: decision,
      }),
    )
      .pipe(
        tap((message) => {
          this.toast.showSuccess(message);
          this.openActionMenuId.set(null);
          this.listingRetry.update((retry) => retry + 1);
        }),
        catchError((error: unknown) => {
          this.toast.showError(
            this.errorMessage(error, `Return request could not be ${decision.toLowerCase()}.`),
          );
          return EMPTY;
        }),
        finalize(() => this.actionInProgress.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /**
   * Admin: every seller's requests with the day/status/reason filters.
   * Seller: only the logged-in seller's requests; SELLER_ID is resolved from their seller record.
   */
  // CHANGED (new): picks the Admin or Seller return request API for the current page.
  private loadReturnRequests(days: number, statusId: number, reasonId: number, page: number): Observable<ReturnRequestsPage> {
    const offset = (page - 1) * PAGE_SIZE;
    if (!this.isSeller) {
      return this.orderService.getReturnRequests({
        DAYS: days,
        RETURN_STATUS: statusId,
        RETURN_REASON: reasonId,
        LIMIT: PAGE_SIZE,
        OFFSET: offset,
      });
    }
    return this.sellerOnboarding.getCurrentSellerId().pipe(
      switchMap((sellerId) =>
        this.orderService.getSellerReturnRequests({ SELLER_ID: sellerId, LIMIT: PAGE_SIZE, OFFSET: offset }),
      ),
    );
  }

  private normalizedRequestStatus(status: string | null): string {
    const value = status?.trim() ?? '';
    const option = this.statusOptions().find((item) => String(item.id) === value);
    return normalizedStatus(option?.label ?? status);
  }

  protected exportRequests(): void {
    const selected = this.selectedIds();
    const rows = this.filteredRows().filter((row) => !selected.size || selected.has(row.returnId));
    const header = ['Order No', 'Product', 'Quantity', 'Return Reason', 'Pickup Address', 'Return Status'];
    const lines = rows.map((row) =>
      [
        row.orderNumber ?? '—',
        row.productName ?? '—',
        row.quantity ?? '—',
        row.reason ?? '—',
        row.address ?? '—',
        row.status ?? '—',
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );
    const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'return-requests.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'string' && body.trim()) return body.trim();
      if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
        const message = (body as Record<string, unknown>)['message'] ?? (body as Record<string, unknown>)['MESSAGE'];
        if (typeof message === 'string' && message.trim()) return message.trim();
      }
      return error.status ? `${fallback} (HTTP ${error.status}).` : fallback;
    }
    return error instanceof Error && error.message.trim() ? error.message : fallback;
  }
}