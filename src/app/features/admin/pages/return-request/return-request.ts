import { formatCurrency, formatDate as formatLocaleDate } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  LOCALE_ID,
  TemplateRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subscription, catchError, defer, distinctUntilChanged, finalize, switchMap, tap } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { OrderService, isReturnType, shippingStatusLabel } from '@features/orders/services/order.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { DateRangeFilter } from '@shared/components/date-range-filter/date-range-filter';
import { Dialog } from '@shared/components/dialog/dialog';
import { ExportButton } from '@shared/components/export-button/export-button';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { SearchableSelect, SearchableSelectOption } from '@shared/components/searchable-select/searchable-select';
import { Select } from '@shared/components/select/select';
import { StatCard, StatCardIcon, StatCardTone } from '@shared/components/stat-card/stat-card';
import { Table, TableCellContext, TableColumn, TableHeaderContext } from '@shared/components/table/table';
import {
  ReturnDecision,
  ReturnReasonOption,
  ReturnRequestRow,
  ReturnRequestsPage,
  ShipmentItem,
  ShipmentTracking,
  StatusOption,
} from '@shared/models';
import { eventValue } from '@shared/utils/form-events';

type LoadStatus = 'loading' | 'success' | 'error';
// CHANGED (new): the columns the table sorts by (the requests of the page on screen, as search does).
// CHANGED: not by Return ID (that column is removed).
type SortKey = 'orderNumber' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

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

/** One label / value line of the details dialog ('—' when the APIs do not have it). */
// CHANGED (new)
interface DetailField {
  label: string;
  value: string;
}

/** The order's tracking details (GET tracking), read when a request's details open. */
// CHANGED (new)
interface TrackingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  shipment: ShipmentTracking | null;
}

// CHANGED: 5 requests per page (it was 10).
const PAGE_SIZE = 5;
/** CHANGED (new): the update the actions dialog is sending: Approve, Reject, or Save Status (ACTION null). */
type PendingAction = ReturnDecision | 'STATUS';
const ALL_FILTER = -1;
/** Same display format as the refund screen's dates (e.g. "16 Nov 2026"). */
const DATE_FORMAT = 'dd MMM y';
const STATUS_TONES: Record<string, BadgeTone> = {
  PENDING: 'warning',
  'IN TRANSIT': 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
};
const SORT_KEYS: readonly string[] = ['orderNumber', 'status', 'createdAt'];

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

function isSortKey(key: string): key is SortKey {
  return SORT_KEYS.includes(key);
}

/** "PENDING" / "in_transit" -> "Pending" / "In Transit". */
function titleCase(value: string): string {
  return value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Return Request (Admin and Seller). The listing reads return_request/get (Admin: every seller's requests with the
 * day / status / reason filters; Seller: their own, by SELLER_ID), searched and sorted on the page on screen.
 *
 * CHANGED: a request's order number opens its details dialog (read only), which shows the return's own fields and,
 * from the order's tracking (GET tracking, the API the customer's Cancel / Return Item uses), the returned product's
 * SKU, price, seller and shipment. The return type (Refund / Replace) is named from the shipping statuses
 * (RETURN/REFUND, RETURN/REPLACE).
 *
 * CHANGED: each row's three-dot action opens the actions dialog: a required Return Status (the shipping statuses,
 * shipping_status/get) and Approve, Reject and Save Status, each sending PUT return_request/update `{ RETURN_ID,
 * RETURN_STATUS, ACTION }` with the row's RETURN_ID, the SHIPPING_STATUS_ID picked and ACTION APPROVED, REJECTED or null
 * (the status only). A request the listing reports as Approved (Rejected) cannot be approved (rejected) again.
 */
@Component({
  selector: 'app-admin-return-request',
  // CHANGED: no Checkbox (the row selection column is removed).
  imports: [
    Badge, Button, Card, DateRangeFilter, Dialog, ExportButton, Input, LoadingSpinner, PageHeading, Pagination,
    SearchableSelect, Select, StatCard, Table,
  ],
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
  private readonly injector = inject(Injector);
  // CHANGED (new): Sellers list only their own return requests (SELLER_ID + paging). That API has no
  // day/status/reason filters, so those controls are hidden for Sellers; Admins are unchanged.
  protected readonly isSeller = inject(AuthService).user()?.userType?.trim().toUpperCase() === 'SELLER';
  protected readonly pageSize = PAGE_SIZE;
  protected readonly stats = STATS;

  protected readonly tableRows = signal<readonly ReturnRequestRow[]>([]);
  protected readonly totalRecords = signal(0);
  protected readonly requestLoadStatus = signal<LoadStatus>('loading');
  protected readonly requestLoadError = signal('');
  private readonly listingRetry = signal(0);
  /** The next listing read keeps the table on screen (after a status update). */
  private quietListing = false;

  protected readonly statusOptions = signal<readonly StatusOption[]>([]);
  protected readonly statusLoadStatus = signal<LoadStatus>('loading');
  protected readonly statusLoadError = signal('');
  private readonly statusRetry = signal(0);
  protected readonly reasons = signal<readonly ReturnReasonOption[]>([]);
  protected readonly reasonLoadStatus = signal<LoadStatus>('loading');
  protected readonly reasonLoadError = signal('');
  private readonly reasonRetry = signal(0);
  /**
   * CHANGED: the shipping statuses (shipping_status/get): the actions dialog's Return Status options (it was
   * return_status), and the names of the return types (RETURN/REFUND, RETURN/REPLACE) of RETURN_OPTION.
   */
  private readonly shippingStatuses = signal<readonly StatusOption[]>([]);
  protected readonly shippingStatusLoadStatus = signal<LoadStatus>('loading');
  private readonly shippingStatusRetry = signal(0);
  private readonly returnTypes = computed(() => this.shippingStatuses().filter(isReturnType));

  protected readonly query = signal('');
  protected readonly statusId = signal(ALL_FILTER);
  protected readonly reasonId = signal(ALL_FILTER);
  protected readonly range = signal('30');
  protected readonly page = signal(1);
  /** CHANGED (new): the table's sort (null: the API's order). */
  protected readonly sort = signal<{ key: SortKey; direction: SortDirection } | null>(null);
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

  private readonly sortHeader = viewChild<TemplateRef<TableHeaderContext<ReturnRequestRow>>>('sortHeader');
  private readonly orderNoCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('orderNoCell');
  private readonly productCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('productCell');
  private readonly sellerCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('sellerCell');
  private readonly returnTypeCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('returnTypeCell');
  private readonly reasonCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('reasonCell');
  private readonly addressCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('addressCell');
  private readonly statusCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('statusCell');
  private readonly dateCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('dateCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<ReturnRequestRow>>>('actionCell');

  // CHANGED: Return ID, Seller, Return Type and Requested On columns (the product's variant under its name), sortable
  // Return ID / Order No / Status / Requested On, and View / Review instead of the row menu (the return images moved to
  // the details dialog).
  // CHANGED: no row selection column. The widths add up to 100% and fit each header on one line at the table's
  // minimum width (return-request.scss); the text columns (Product, Reason, Pickup Address) get the most room.
  // CHANGED: no Return ID column (the details and actions dialogs still name the return); its width went to the text
  // columns and Return Status.
  protected readonly tableColumns = computed<readonly TableColumn<ReturnRequestRow>[]>(() => {
    const sortHeader = this.sortHeader();
    return [
      { key: 'orderNumber', label: 'Order No', width: '9%', headerTemplate: sortHeader, cellTemplate: this.orderNoCell() },
      { key: 'productName', label: 'Product', width: '14%', emphasized: true, cellTemplate: this.productCell() },
      { key: 'seller', label: 'Seller', width: '8%', cellTemplate: this.sellerCell() },
      { key: 'quantity', label: 'Quantity', width: '6%', align: 'center' },
      { key: 'returnType', label: 'Return Type', width: '10%', cellTemplate: this.returnTypeCell() },
      { key: 'reason', label: 'Return Reason', width: '13%', emphasized: true, cellTemplate: this.reasonCell() },
      { key: 'address', label: 'Pickup Address', width: '14%', cellTemplate: this.addressCell() },
      { key: 'status', label: 'Return Status', width: '10%', align: 'center', headerTemplate: sortHeader, cellTemplate: this.statusCell() },
      { key: 'createdAt', label: 'Requested On', width: '10%', headerTemplate: sortHeader, cellTemplate: this.dateCell() },
      { key: 'actions', label: 'Actions', width: '6%', align: 'center', overflowVisible: true, cellTemplate: this.actionCell() },
    ];
  });

  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.tableRows().filter((row) => {
      const searchable = [
        row.returnId,
        row.orderNumber,
        row.productName,
        row.description,
        this.reasonLabel(row),
        this.returnTypeLabel(row),
        this.sellerLabel(row),
        row.customerName,
        row.customerMobile,
        row.address,
        this.statusLabel(row.status),
      ].join(' ').toLowerCase();
      return !query || searchable.includes(query);
    });
  });

  /** The page's requests, searched, in the chosen sort order (the API's order without one). */
  // CHANGED: sorted.
  protected readonly visibleRows = computed(() => {
    const rows = this.filteredRows();
    const sort = this.sort();
    if (!sort) return rows;
    return [...rows].sort((a, b) => this.compareRows(a, b, sort.key, sort.direction));
  });

  // ---- Details and status update (CHANGED (new)) ----

  private readonly activeReturnId = signal<number | null>(null);
  /** The request as it was when opened (or last updated), should a reload leave it off the page on screen. */
  private readonly activeSnapshot = signal<ReturnRequestRow | null>(null);
  /** The request whose details dialog is open, as the latest listing read has it. */
  protected readonly activeRequest = computed(() => {
    const id = this.activeReturnId();
    if (id === null) return null;
    return this.tableRows().find((row) => row.returnId === id) ?? this.activeSnapshot();
  });
  protected readonly tracking = signal<TrackingState>({ status: 'idle', shipment: null });
  private trackingRequest?: Subscription;
  /**
   * The returned product's tracking row: the same PRODUCT_ID, and the same PRODUCT_VARIANT_ID when both are known.
   * Null when the tracking has no such product (no other product's details are shown).
   */
  protected readonly trackedItem = computed<ShipmentItem | null>(() => {
    const request = this.activeRequest();
    const shipment = this.tracking().shipment;
    if (!request || !shipment || request.productId === null) return null;
    return (
      shipment.items.find(
        (item) =>
          item.productId === request.productId &&
          (request.variantId === null || item.variantId === undefined || item.variantId === request.variantId),
      ) ?? null
    );
  });

  protected readonly returnFields = computed<readonly DetailField[]>(() => {
    const request = this.activeRequest();
    if (!request) return [];
    return [
      { label: 'Return ID', value: `#${request.returnId}` },
      { label: 'Requested On', value: this.formatDate(request.createdAt) },
      { label: 'Return Type', value: this.returnTypeLabel(request) ?? '—' },
      { label: 'Return Reason', value: this.reasonLabel(request) ?? '—' },
      { label: 'Additional Details', value: request.description ?? '—' },
    ];
  });
  protected readonly productFields = computed<readonly DetailField[]>(() => {
    const request = this.activeRequest();
    if (!request) return [];
    const item = this.trackedItem();
    const variantId = request.variantId ?? item?.variantId ?? null;
    const sellerId = request.sellerId ?? item?.sellerId ?? null;
    return [
      { label: 'Order Number', value: request.orderNumber ?? '—' },
      { label: 'Product', value: request.productName ?? (request.productId !== null ? `Product #${request.productId}` : '—') },
      { label: 'SKU', value: item?.sku || '—' },
      { label: 'Variant', value: variantId !== null ? `#${variantId}` : '—' },
      { label: 'Quantity', value: String(request.quantity ?? item?.quantity ?? '—') },
      { label: 'Unit Price', value: item?.price != null ? formatCurrency(item.price, this.locale, '₹', 'INR', '1.2-2') : '—' },
      { label: 'Seller', value: request.sellerName ?? (sellerId !== null ? `Seller #${sellerId}` : '—') },
    ];
  });
  protected readonly pickupFields = computed<readonly DetailField[]>(() => {
    const request = this.activeRequest();
    if (!request) return [];
    // The delivery address stands in only when it is the pickup address (same ID).
    const item = this.trackedItem();
    const shipment = this.tracking().shipment;
    const delivery =
      shipment && item && request.pickupAddressId !== null && item.deliveryAddressId === request.pickupAddressId
        ? shipment.address
        : null;
    return [
      { label: 'Pickup Address', value: request.address ?? (delivery?.lines.join(', ') || '—') },
      { label: 'Customer', value: request.customerName ?? (delivery?.name || '—') },
      { label: 'Mobile', value: request.customerMobile ?? (delivery?.phone || '—') },
    ];
  });
  /** The order's shipment, only once the returned product is found in its tracking. */
  protected readonly shipmentFields = computed<readonly DetailField[]>(() => {
    const shipment = this.tracking().shipment;
    if (!shipment || !this.trackedItem()) return [];
    return [
      { label: 'Order Status', value: shipment.orderStatus ? titleCase(shipment.orderStatus) : '—' },
      { label: 'Shipping Status', value: shipment.shippingStatus ? shippingStatusLabel(shipment.shippingStatus) : '—' },
      { label: 'Carrier', value: shipment.carrier.name || '—' },
      { label: 'Tracking Number', value: shipment.carrier.trackingNo || '—' },
      { label: 'Shipment Number', value: shipment.shipmentNumber || '—' },
    ];
  });

  private dialogOpener: HTMLElement | null = null;
  private readonly detailsDialog = viewChild<ElementRef<HTMLElement>>('detailsDialog');

  // ---- CHANGED (new): the actions dialog (the row's three-dot action; it replaces View / Review and the details
  // dialog's review) ----

  private readonly actionReturnId = signal<number | null>(null);
  /** The request as it was when the dialog opened, should a reload leave it off the page on screen. */
  private readonly actionSnapshot = signal<ReturnRequestRow | null>(null);
  /** The request whose actions dialog is open, as the latest listing read has it. */
  protected readonly actionRequest = computed(() => {
    const id = this.actionReturnId();
    if (id === null) return null;
    return this.tableRows().find((row) => row.returnId === id) ?? this.actionSnapshot();
  });
  /** The Return Status options: every shipping status, by SHIPPING_STATUS_ID. */
  protected readonly actionStatusOptions = computed<SearchableSelectOption[]>(() =>
    this.shippingStatuses().map((option) => ({ value: String(option.id), label: shippingStatusLabel(option.label) })),
  );
  /** The Return Status picked (a SHIPPING_STATUS_ID of the list), null until one is. */
  private readonly actionStatusChoice = signal<number | null>(null);
  protected readonly actionStatusValue = computed(() => {
    const statusId = this.actionStatusChoice();
    return statusId !== null && this.shippingStatuses().some((option) => option.id === statusId) ? String(statusId) : '';
  });
  /** "Select a return status…" after an action without one. */
  protected readonly actionStatusError = signal(false);
  /** Why the last update failed ('' when it did not). */
  protected readonly actionError = signal('');
  /** The update being sent: one at a time, and the dialog stays open meanwhile. */
  protected readonly pendingAction = signal<PendingAction | null>(null);
  /**
   * The request's status as the listing reports it (RETURN_STATUS_NAME, else its status ID's name in All Status):
   * an Approved request is not approved again, a Rejected one not rejected again. By name, not by a fixed status ID.
   */
  protected readonly actionRequestStatus = computed(() => {
    const request = this.actionRequest();
    return request ? this.normalizedRequestStatus(request.status) : '';
  });
  protected readonly isApproved = computed(() => this.actionRequestStatus() === 'APPROVED');
  protected readonly isRejected = computed(() => this.actionRequestStatus() === 'REJECTED');
  private actionsOpener: HTMLElement | null = null;
  private readonly actionsDialog = viewChild<ElementRef<HTMLElement>>('actionsDialog');

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

    // CHANGED: the shipping statuses (shipping_status/get?SHIPPING_STATUS_ID=-1): the actions dialog's Return Status
    // options, and the requests' return type names (without them a type shows by its ID). Retried from the dialog.
    toObservable(this.shippingStatusRetry)
      .pipe(
        switchMap(() => {
          this.shippingStatusLoadStatus.set('loading');
          return defer(() => this.orderService.getShippingStatuses()).pipe(
            tap((statuses) => {
              this.shippingStatuses.set(statuses);
              this.shippingStatusLoadStatus.set('success');
            }),
            catchError(() => {
              this.shippingStatusLoadStatus.set('error');
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
            previous.statusId === current.statusId &&
            previous.reasonId === current.reasonId &&
            previous.page === current.page &&
            previous.retry === current.retry,
        ),
        switchMap(({ days, statusId, reasonId, page }) => {
          // CHANGED: a quiet read (after a status update) keeps the table on screen while it loads.
          const quiet = this.quietListing;
          this.quietListing = false;
          if (!quiet) {
            this.requestLoadStatus.set('loading');
            this.requestLoadError.set('');
          }
          // CHANGED: the request now depends on the role; the response handling below is shared.
          return defer(() => this.loadReturnRequests(days, statusId, reasonId, page)).pipe(
            tap((result) => {
              this.tableRows.set(result.requests);
              this.totalRecords.set(result.totalRecords);
              this.requestLoadStatus.set('success');
            }),
            catchError((error: unknown) => {
              const message = this.errorMessage(error, 'Return requests could not be loaded.');
              this.toast.showError(message);
              if (quiet && this.requestLoadStatus() === 'success') return EMPTY;
              this.tableRows.set([]);
              this.totalRecords.set(0);
              this.requestLoadError.set(message);
              this.requestLoadStatus.set('error');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    this.destroyRef.onDestroy(() => this.trackingRequest?.unsubscribe());
  }

  protected statusTone(status: string | null): BadgeTone {
    return STATUS_TONES[this.normalizedRequestStatus(status)] ?? 'neutral';
  }

  protected statusLabel(status: string | null): string {
    const value = this.normalizedRequestStatus(status);
    return value ? titleCase(value) : '—';
  }

  /** The return type the customer chose (RETURN_OPTION), e.g. "Return/Refund"; null when the API sends none. */
  // CHANGED (new)
  protected returnTypeLabel(row: ReturnRequestRow): string | null {
    if (row.returnOptionName) return shippingStatusLabel(row.returnOptionName);
    if (row.returnOptionId === null) return null;
    const type = this.returnTypes().find((candidate) => candidate.id === row.returnOptionId);
    return type ? shippingStatusLabel(type.label) : `Option #${row.returnOptionId}`;
  }

  // CHANGED (new)
  protected returnTypeTone(row: ReturnRequestRow): BadgeTone {
    const label = (this.returnTypeLabel(row) ?? '').toUpperCase();
    return label.includes('REFUND') ? 'info' : label.includes('REPLACE') ? 'purple' : 'neutral';
  }

  /** RETURN_REASON, else the reason of its ID in the reason list. */
  // CHANGED (new)
  protected reasonLabel(row: ReturnRequestRow): string | null {
    return row.reason ?? this.reasons().find((reason) => reason.REASON_ID === row.reasonId)?.REASON ?? null;
  }

  // CHANGED (new)
  protected sellerLabel(row: ReturnRequestRow): string | null {
    return row.sellerName ?? (row.sellerId !== null ? `Seller #${row.sellerId}` : null);
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

  /** Sorts by a column: ascending first, then descending. */
  // CHANGED (new)
  protected toggleSort(key: string): void {
    if (!isSortKey(key)) return;
    const current = this.sort();
    this.sort.set({ key, direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc' });
  }

  // CHANGED (new)
  protected sortDirection(key: string): SortDirection | null {
    const sort = this.sort();
    return sort?.key === key ? sort.direction : null;
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

  // CHANGED: retries the shipping statuses (the actions dialog's Return Status options).
  protected retryShippingStatuses(): void {
    this.shippingStatusRetry.update((retry) => retry + 1);
  }

  protected setPage(page: number): void {
    this.page.set(page);
  }

  // ---- Details (CHANGED: read only; the status is updated from the actions dialog) ----

  /** Opens a request's details and reads its order's tracking (for the product's SKU, price, seller and shipment). */
  protected openDetails(row: ReturnRequestRow, opener?: EventTarget | null): void {
    this.dialogOpener = opener instanceof HTMLElement ? opener : null;
    this.activeReturnId.set(row.returnId);
    this.activeSnapshot.set(row);
    this.loadTracking(row.orderNumber);
    afterNextRender(() => this.detailsDialog()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeDetails(): void {
    this.activeReturnId.set(null);
    this.activeSnapshot.set(null);
    this.trackingRequest?.unsubscribe();
    this.tracking.set({ status: 'idle', shipment: null });
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    if (opener?.isConnected) opener.focus();
  }

  protected retryTracking(): void {
    this.loadTracking(this.activeRequest()?.orderNumber ?? null);
  }

  // ---- Actions dialog (CHANGED (new)) ----

  /** The row's three-dot action: the actions dialog, with no Return Status picked yet. */
  protected openActions(row: ReturnRequestRow, opener?: EventTarget | null): void {
    this.actionsOpener = opener instanceof HTMLElement ? opener : null;
    this.actionReturnId.set(row.returnId);
    this.actionSnapshot.set(row);
    this.actionStatusChoice.set(null);
    this.actionStatusError.set(false);
    this.actionError.set('');
    if (this.shippingStatusLoadStatus() === 'error') this.retryShippingStatuses();
    afterNextRender(() => this.actionsDialog()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Cancel / close (not while an update is being sent). */
  protected closeActions(): void {
    if (this.pendingAction()) return;
    this.actionReturnId.set(null);
    this.actionSnapshot.set(null);
    this.actionStatusChoice.set(null);
    this.actionStatusError.set(false);
    this.actionError.set('');
    const opener = this.actionsOpener;
    this.actionsOpener = null;
    if (opener?.isConnected) opener.focus();
  }

  protected setActionStatus(value: string): void {
    const statusId = Number(value);
    const valid = !!value && Number.isSafeInteger(statusId) && statusId > 0;
    this.actionStatusChoice.set(valid ? statusId : null);
    if (valid) this.actionStatusError.set(false);
    this.actionError.set('');
  }

  /**
   * Approve (APPROVED), Reject (REJECTED) or Save Status (null): PUT return_request/update `{ RETURN_ID, RETURN_STATUS,
   * ACTION }` with the row's RETURN_ID and the Return Status picked (required; nothing is sent without one), one update
   * at a time. An Approved (Rejected) request is not approved (rejected) again. On success: a toast, the dialog closes,
   * and the table is read again (with the status the backend set); an approval or rejection shows on the row at once.
   * On failure the dialog stays open with the reason.
   */
  protected submitAction(action: ReturnDecision | null): void {
    const request = this.actionRequest();
    if (!request || this.pendingAction()) return;
    if ((action === 'APPROVED' && this.isApproved()) || (action === 'REJECTED' && this.isRejected())) return;
    const statusId = this.actionStatusValue() ? this.actionStatusChoice() : null;
    if (statusId === null) {
      this.actionStatusError.set(true);
      return;
    }

    this.actionStatusError.set(false);
    this.actionError.set('');
    this.pendingAction.set(action ?? 'STATUS');
    defer(() =>
      this.orderService.reviewReturnRequest({ RETURN_ID: request.returnId, RETURN_STATUS: statusId, ACTION: action }),
    )
      .pipe(
        finalize(() => this.pendingAction.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (message) => {
          // An approval or rejection shows at once (so it cannot be sent again); the listing read below brings the
          // status the backend set.
          if (action) {
            this.tableRows.update((rows) =>
              rows.map((row) => (row.returnId === request.returnId ? { ...row, status: action, statusId: null } : row)),
            );
          }
          this.toast.showSuccess(message);
          this.pendingAction.set(null);
          this.closeActions();
          this.quietListing = true;
          this.listingRetry.update((retry) => retry + 1);
        },
        error: (error: unknown) => {
          const message = this.orderService.returnReviewErrorMessage(error, action);
          this.actionError.set(message);
          this.toast.showError(message);
        },
      });
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

  /** The order's tracking (GET tracking); a failure only leaves the shipment details out. */
  // CHANGED (new)
  private loadTracking(orderNumber: string | null): void {
    this.trackingRequest?.unsubscribe();
    if (!orderNumber) {
      this.tracking.set({ status: 'error', shipment: null });
      return;
    }
    this.tracking.set({ status: 'loading', shipment: null });
    this.trackingRequest = defer(() => this.orderService.getShipmentTracking(orderNumber))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (shipment) => this.tracking.set({ status: 'success', shipment }),
        error: () => this.tracking.set({ status: 'error', shipment: null }),
      });
  }

  private normalizedRequestStatus(status: string | null): string {
    const value = status?.trim() ?? '';
    const option = this.statusOptions().find((item) => String(item.id) === value);
    return normalizedStatus(option?.label ?? status);
  }

  /** Rows without a value go last in both directions. */
  private compareRows(a: ReturnRequestRow, b: ReturnRequestRow, key: SortKey, direction: SortDirection): number {
    const value = (row: ReturnRequestRow): string | number | null => {
      switch (key) {
        case 'orderNumber': return row.orderNumber;
        case 'status': return row.status ? this.statusLabel(row.status) : null;
        case 'createdAt': {
          const time = row.createdAt ? Date.parse(row.createdAt) : NaN;
          return Number.isFinite(time) ? time : null;
        }
      }
    };
    const first = value(a);
    const second = value(b);
    if (first === null || second === null) return first === second ? 0 : first === null ? 1 : -1;
    const order =
      typeof first === 'number' && typeof second === 'number'
        ? first - second
        : String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' });
    return direction === 'asc' ? order : -order;
  }

  // CHANGED: exports the requests shown (searched and sorted); there is no row selection any more.
  protected exportRequests(): void {
    const rows = this.visibleRows();
    // CHANGED: with the Return ID, Return Type, Seller and Requested On.
    const header = [
      'Return ID', 'Order No', 'Product', 'Variant', 'Quantity', 'Seller', 'Return Type', 'Return Reason',
      'Pickup Address', 'Return Status', 'Requested On',
    ];
    const lines = rows.map((row) =>
      [
        row.returnId,
        row.orderNumber ?? '—',
        row.productName ?? '—',
        row.variantId !== null ? `#${row.variantId}` : '—',
        row.quantity ?? '—',
        this.sellerLabel(row) ?? '—',
        this.returnTypeLabel(row) ?? '—',
        this.reasonLabel(row) ?? '—',
        row.address ?? '—',
        this.statusLabel(row.status),
        this.formatDate(row.createdAt),
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
