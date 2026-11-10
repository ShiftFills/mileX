import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, catchError, defer, distinctUntilChanged, filter, switchMap, tap } from 'rxjs';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import {
  DateRangeFilter,
  DateRangeOption,
} from '@shared/components/date-range-filter/date-range-filter';
import { Dialog } from '@shared/components/dialog/dialog';
import { ExportButton } from '@shared/components/export-button/export-button';
import { Input } from '@shared/components/input/input';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import {
  SearchableSelect,
  SearchableSelectOption,
} from '@shared/components/searchable-select/searchable-select';
import { Select } from '@shared/components/select/select';
import { StatCard, StatCardIcon, StatCardTone } from '@shared/components/stat-card/stat-card';
import {
  Table,
  TableCellContext,
  TableColumn,
  TableHeaderContext,
} from '@shared/components/table/table';
import { Textarea } from '@shared/components/textarea/textarea';
import { ToastService } from '@core/services/toast.service';
import { DocumentPreview } from '@features/seller/components/document-preview/document-preview';
import {
  SellerLookupOption,
  SellerOnboardingService,
} from '@features/seller/services/seller-onboarding.service';
import { eventValue } from '@shared/utils/form-events';
import {
  REQUIRED_SELLER_DOCUMENT_TYPES,
  SellerSummary,
  DateFilterOption,
  SellerVerificationRecord,
  SellerVerificationService,
  SellerVerificationStatus,
  StatusOption,
} from '../../services/seller-verification.service';

type SellerRow = SellerVerificationRecord;
type SellerDocument = SellerRow['documents'][number];

interface SellerStat {
  key: keyof SellerSummary;
  label: string;
  value: string;
  trend: string;
  trendDirection: 'up' | 'down';
  trendTone: 'positive' | 'negative';
  icon: StatCardIcon;
  iconImage?: string;
  tone: StatCardTone;
}

const PAGE_SIZE = 6;
const STATUS_TONES: Record<SellerVerificationStatus, BadgeTone> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
};

function formatCount(count: number | null | undefined): string {
  return count === null || count === undefined ? '—' : count.toLocaleString('en-IN');
}

const STATS: readonly SellerStat[] = [
  {
    key: 'total',
    label: 'Total Sellers',
    value: '—',
    trend: '',
    trendDirection: 'up',
    trendTone: 'positive',
    icon: 'sellers',
    tone: 'indigo',
  },
  {
    key: 'pending',
    label: 'Pending Verification',
    value: '—',
    trend: '',
    trendDirection: 'up',
    trendTone: 'positive',
    icon: 'pending',
    iconImage: '/images/returnRequest-Pending.svg',
    tone: 'amber',
  },
  {
    key: 'approved',
    label: 'Approved Sellers',
    value: '—',
    trend: '',
    trendDirection: 'up',
    trendTone: 'positive',
    icon: 'approved',
    tone: 'green',
  },
  {
    key: 'rejected',
    label: 'Rejected Sellers',
    value: '—',
    trend: '',
    trendDirection: 'down',
    trendTone: 'negative',
    icon: 'rejected',
    tone: 'red',
  },
];

@Component({
  selector: 'app-admin-seller-verification',
  imports: [
    Badge,
    Button,
    Card,
    Checkbox,
    DateRangeFilter,
    Dialog,
    DocumentPreview,
    ExportButton,
    Input,
    LoadingSpinner,
    PageHeading,
    Pagination,
    SearchableSelect,
    Select,
    StatCard,
    Table,
    Textarea,
  ],
  templateUrl: './seller-verification.html',
  styleUrl: './seller-verification.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerVerification {
  private readonly verificationService = inject(SellerVerificationService);
  private readonly sellerOnboardingService = inject(SellerOnboardingService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly pageSize = PAGE_SIZE;

  private readonly summary = signal<SellerSummary | null>(null);
  protected readonly summaryStatus = signal<'loading' | 'success' | 'error'>('loading');
  private readonly summaryRetry = signal(0);
  protected readonly stats = computed<readonly SellerStat[]>(() => {
    const summary = this.summary();
    return STATS.map((stat) => ({ ...stat, value: formatCount(summary?.[stat.key]) }));
  });
  protected readonly statusOptions = signal<readonly StatusOption[]>([]);
  protected readonly statusOptionsStatus = signal<'loading' | 'success' | 'error'>('loading');
  private readonly statusRetry = signal(0);
  protected readonly businessTypes = signal<readonly SellerLookupOption[]>([]);
  protected readonly businessTypesStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly businessTypesError = signal('');
  private readonly businessTypesRetry = signal(0);
  protected readonly businessTypeOptions = computed<readonly SearchableSelectOption[]>(() =>
    [
      { label: 'All Business Types', value: '-1' },
      ...this.businessTypes().map((option) => ({ label: option.name, value: option.id })),
    ],
  );

  protected readonly sellers = signal<SellerRow[]>([]);
  protected readonly loadStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly loadError = signal('');
  private readonly retryCount = signal(0);
  private readonly totalSellers = signal<number | undefined>(undefined);
  private readonly hasNextPage = signal(false);
  protected readonly query = signal('');
  protected readonly status = signal('PENDING');
  protected readonly businessType = signal('-1');
  /** Selected DATE_FILTER_ID (as a string, because <select> values are strings). */
  protected readonly range = signal('');
  private readonly dateFilters = signal<readonly DateFilterOption[]>([]);
  private readonly dateFilterStatus = signal<'loading' | 'success' | 'error'>('loading');
  /** Options for the shared dropdown: label = FILTER_NAME, value = DATE_FILTER_ID. */
  protected readonly dateRangeOptions = computed<readonly DateRangeOption[]>(() =>
    this.dateFilters().map((filter) => ({ label: filter.label, value: String(filter.id) })),
  );
  /** DAYS for the selected DATE_FILTER_ID; this is what the seller API receives. */
  private readonly days = computed(
    () => this.dateFilters().find((filter) => String(filter.id) === this.range())?.days,
  );
  private readonly documentVerificationStatus = computed(() => {
    const selected = this.statusOptions().find(
      (option) => String(option.id) === this.status(),
    );
    return selected?.label.trim().toUpperCase() ?? this.status().trim().toUpperCase();
  });
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  protected readonly activeSellerId = signal<number | null>(null);
  protected readonly previewDocument = signal<SellerDocument | null>(null);
  protected readonly detailStatus = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>(
    'idle',
  );
  protected readonly detailError = signal('');
  private readonly detailRetry = signal(0);
  private readonly detailRecord = signal<SellerVerificationRecord | null>(null);
  private readonly refreshListingAfterDetailFor = signal<number | null>(null);
  private readonly detailStatusOverride = signal<{
    sellerId: number;
    status: SellerVerificationStatus;
  } | null>(null);
  protected readonly remarks = signal('');
  protected readonly remarksError = signal('');
  protected readonly documentRemarks = signal('');
  protected readonly documentRemarksError = signal('');
  protected readonly documentRejectionOpen = signal(false);
  protected readonly pendingDecision = signal<'approve' | 'deny' | null>(null);
  protected readonly decisionScope = signal<'seller' | 'document' | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly actionNotice = signal('');

  protected readonly totalCount = computed(() => this.totalSellers());
  private readonly detailRequest = computed(() => {
    const selected = this.sellers().find((seller) => seller.id === this.activeSellerId());
    const statusOverride = this.detailStatusOverride();
    return selected
      ? {
          sellerId: selected.sellerId,
          status:
            statusOverride?.sellerId === selected.sellerId
              ? statusOverride.status
              : selected.status,
          retry: this.detailRetry(),
        }
      : null;
  });
  private readonly pageRequest = computed(() => ({
    page: this.page(),
    retry: this.retryCount(),
    days: this.days(),
    businessTypeId: Number(this.businessType()),
    documentVerificationStatus: this.documentVerificationStatus(),
    ready:
      this.dateFilterStatus() !== 'loading' &&
      this.statusOptionsStatus() !== 'loading' &&
      this.businessTypesStatus() !== 'loading',
  }));
  private readonly summaryRequest = computed(() => ({
    days: this.days(),
    retry: this.summaryRetry(),
    ready: this.dateFilterStatus() !== 'loading',
  }));

  constructor() {
    toObservable(this.summaryRequest)
      .pipe(
        filter((request) => request.ready),
        distinctUntilChanged(
          (previous, current) =>
            previous.days === current.days && previous.retry === current.retry,
        ),
        switchMap(({ days }) => {
          this.summary.set(null);
          if (days === undefined) {
            this.summaryStatus.set('error');
            return EMPTY;
          }

          this.summaryStatus.set('loading');
          return this.verificationService.getSummary(days).pipe(
            tap((summary) => {
              this.summary.set(summary);
              this.summaryStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.summary.set(null);
              this.summaryStatus.set('error');
              this.toast.showError(this.verificationService.getSummaryErrorMessage(error));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.statusRetry)
      .pipe(
        switchMap(() => {
          this.statusOptionsStatus.set('loading');
          return this.verificationService.getStatuses().pipe(
            tap((options) => {
              this.statusOptions.set(options);
              if (this.status() === 'PENDING') {
                const pending = options.find(
                  (option) => option.label.trim().toUpperCase() === 'PENDING',
                );
                if (pending) this.status.set(String(pending.id));
              }
              this.statusOptionsStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.statusOptions.set([]);
              this.statusOptionsStatus.set('error');
              this.toast.showError(this.verificationService.getStatusErrorMessage(error));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.businessTypesRetry)
      .pipe(
        switchMap(() => {
          this.businessTypesStatus.set('loading');
          this.businessTypesError.set('');
          return this.sellerOnboardingService.getBusinessTypes().pipe(
            tap((options) => {
              this.businessTypes.set(options);
              this.businessTypesStatus.set('success');
            }),
            catchError((error: unknown) => {
              const message = this.sellerOnboardingService.getErrorMessage(error);
              this.businessTypes.set([]);
              this.businessTypesError.set(message);
              this.businessTypesStatus.set('error');
              this.toast.showError(message);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    this.verificationService
      .getDateFilters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => {
          this.dateFilters.set(options);
          // Default to the 30 Days option when the API provides it, otherwise the first option.
          const selected = options.find((option) => option.days === 30) ?? options[0];
          this.range.set(selected ? String(selected.id) : '');
          this.dateFilterStatus.set('success');
        },
        error: (error: unknown) => {
          this.dateFilters.set([]);
          this.range.set('');
          this.dateFilterStatus.set('error');
          this.toast.showError(this.verificationService.getDateFilterErrorMessage(error));
        },
      });

    toObservable(this.detailRequest)
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous?.sellerId === current?.sellerId &&
            previous?.status === current?.status &&
            previous?.retry === current?.retry,
        ),
        switchMap((request) => {
          this.detailError.set('');
          if (!request) {
            if (!this.detailRecord()) this.detailStatus.set('idle');
            return EMPTY;
          }
          if (this.detailRecord()?.sellerId !== request.sellerId) this.detailRecord.set(null);
          this.detailStatus.set('loading');
          return this.verificationService.getSellerDetails(request.sellerId).pipe(
            tap((seller) => {
              this.detailRecord.set(seller);
              this.detailStatus.set(seller ? 'success' : 'empty');
              if (this.refreshListingAfterDetailFor() === request.sellerId) {
                this.refreshListingAfterDetailFor.set(null);
                this.isSubmitting.set(false);
                this.retryCount.update((count) => count + 1);
                this.refreshSummary();
              }
            }),
            catchError((error: unknown) => {
              this.detailError.set(this.verificationService.getErrorMessage(error));
              this.detailStatus.set('error');
              if (this.refreshListingAfterDetailFor() === request.sellerId) {
                this.refreshListingAfterDetailFor.set(null);
                this.isSubmitting.set(false);
                this.retryCount.update((count) => count + 1);
                this.refreshSummary();
              }
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.pageRequest)
      .pipe(
        filter((request) => request.ready),
        distinctUntilChanged(
          (previous, current) =>
            previous.page === current.page &&
            previous.retry === current.retry &&
            previous.days === current.days &&
            previous.businessTypeId === current.businessTypeId &&
            previous.documentVerificationStatus === current.documentVerificationStatus,
        ),
        switchMap(({ page, days, businessTypeId, documentVerificationStatus }) => {
          this.loadStatus.set('loading');
          this.loadError.set('');
          return defer(() =>
            this.verificationService.getSellers(
              page,
              PAGE_SIZE,
              days,
              businessTypeId,
              documentVerificationStatus,
            ),
          ).pipe(
            tap((result) => {
              this.sellers.set(result.items);
              this.totalSellers.set(result.total);
              this.hasNextPage.set(result.hasNext);
              this.loadStatus.set('success');
            }),
            catchError((error: unknown) => {
              const message = this.verificationService.getErrorMessage(error);
              this.loadError.set(message);
              this.loadStatus.set('error');
              this.toast.showError(message);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected retryLoad(): void {
    this.retryCount.update((count) => count + 1);
  }

  protected retryStatuses(): void {
    this.statusRetry.update((count) => count + 1);
  }

  protected retryBusinessTypes(): void {
    this.businessTypesRetry.update((count) => count + 1);
  }

  protected businessTypePlaceholder(): string {
    if (this.businessTypesStatus() === 'loading') return 'Loading business types…';
    if (this.businessTypesStatus() === 'error') return 'Business types unavailable';
    return this.businessTypes().length ? 'All Business Type' : 'No business types available';
  }

  protected refreshSummary(): void {
    this.summaryRetry.update((count) => count + 1);
  }

  protected setRange(value: string): void {
    if (value === this.range()) return;
    this.range.set(value);
    this.page.set(1);
  }

  private readonly selectAllHeader =
    viewChild<TemplateRef<TableHeaderContext<SellerRow>>>('selectAllHeader');
  private readonly selectRowCell =
    viewChild<TemplateRef<TableCellContext<SellerRow>>>('selectRowCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<SellerRow>>>('actionCell');
  private readonly documentNameCell =
    viewChild<TemplateRef<TableCellContext<SellerDocument>>>('documentNameCell');
  private readonly documentStatusCell =
    viewChild<TemplateRef<TableCellContext<SellerDocument>>>('documentStatusCell');
  private readonly documentActionCell =
    viewChild<TemplateRef<TableCellContext<SellerDocument>>>('documentActionCell');

  protected readonly tableColumns = computed<readonly TableColumn<SellerRow>[]>(() => [
    {
      key: 'selection',
      label: '',
      width: '6%',
      selection: true,
      headerTemplate: this.selectAllHeader(),
      cellTemplate: this.selectRowCell(),
    },
    { key: 'sellerName', label: 'Seller Name', width: '16%', emphasized: true },
    { key: 'businessName', label: 'Business Name', width: '20%', emphasized: true },
    { key: 'email', label: 'Email', width: '22%' },
    { key: 'mobile', label: 'Mobile No', width: '18%' },
    {
      key: 'actions',
      label: 'Action',
      width: '18%',
      align: 'center',
      cellTemplate: this.actionCell(),
    },
  ]);

  protected readonly documentColumns = computed<readonly TableColumn<SellerDocument>[]>(() => [
    {
      key: 'name',
      label: 'Document Name',
      width: '38%',
      emphasized: true,
      cellTemplate: this.documentNameCell(),
    },
    { key: 'fileName', label: 'File Name', width: '28%' },
    { key: 'status', label: 'Status', width: '18%', cellTemplate: this.documentStatusCell() },
    {
      key: 'actions',
      label: 'Action',
      width: '16%',
      align: 'center',
      cellTemplate: this.documentActionCell(),
    },
  ]);

  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.sellers().filter((row) => {
      const matchesQuery =
        !query ||
        `${row.sellerName} ${row.businessName} ${row.email} ${row.mobile} ${row.sellerCode}`
          .toLowerCase()
          .includes(query);
      return matchesQuery;
    });
  });

  protected readonly visibleRows = computed(() => {
    return this.filteredRows();
  });

  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visibleRows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.id));
  });

  protected readonly activeSeller = computed(() => {
    const selected = this.sellers().find((seller) => seller.id === this.activeSellerId()) ?? null;
    const details = this.detailRecord();
    return details?.id === this.activeSellerId() ? details : selected;
  });
  protected readonly rejectedMandatoryDocuments = computed(
    () =>
      this.activeSeller()?.documents.filter(
        (document) => document.required === true && document.status === 'Rejected',
      ) ?? [],
  );
  protected readonly approvedSellerVerificationWarning = computed(() => {
    const seller = this.activeSeller();
    const rejectedDocuments = this.rejectedMandatoryDocuments();
    if (seller?.status !== 'Approved' || rejectedDocuments.length === 0) return null;
    const documentNames = rejectedDocuments.map((document) => document.name).join(', ');
    return `This seller is marked Approved, but mandatory documents have been rejected: ${documentNames}. The backend seller status has not changed; this verification needs attention.`;
  });
  protected readonly sellerApprovalDisabledReason = computed(() => {
    const seller = this.activeSeller();
    const state = this.sellerDecisionState();
    if (!seller || seller.status !== 'Pending' || seller.documentVerificationStatus === 'Approved') {
      return null;
    }
    if (state !== 'pending-documents' && state !== 'rejected-document') return null;
    if (this.rejectedMandatoryDocuments().length > 0) {
      return 'Seller approval is blocked while any mandatory document is rejected. The affected document must be resubmitted and reviewed again.';
    }
    return 'Seller approval is blocked until every mandatory document has been reviewed and approved.';
  });
  protected readonly canRejectSeller = computed(() => {
    const seller = this.activeSeller();
    return (
      this.detailStatus() === 'success' &&
      seller?.status === 'Pending' &&
      seller.documentVerificationStatus !== 'Approved'
    );
  });
  protected readonly canApproveSeller = computed(() => {
    const seller = this.activeSeller();
    return (
      this.detailStatus() === 'success' &&
      seller?.status === 'Pending' &&
      seller.documentVerificationStatus === 'Pending' &&
      this.sellerDecisionState() === 'approved-documents'
    );
  });
  protected readonly sellerDecisionState = computed(() => {
    const seller = this.activeSeller();
    if (!seller || this.detailStatus() !== 'success') return 'unavailable';
    if (seller.status !== 'Pending' || seller.documentVerificationStatus === 'Approved') {
      return 'already-decided';
    }

    const requiredDocuments = seller.documents.filter((document) => document.required === true);
    if (requiredDocuments.length < REQUIRED_SELLER_DOCUMENT_TYPES.length) {
      return 'pending-documents';
    }
    if (requiredDocuments.some((document) => !document.status || document.status === 'Pending')) {
      return 'pending-documents';
    }
    if (requiredDocuments.some((document) => document.status === 'Rejected')) {
      return 'rejected-document';
    }
    return requiredDocuments.every((document) => document.status === 'Approved')
      ? 'approved-documents'
      : 'pending-documents';
  });

  protected statusTone(status: SellerVerificationStatus): BadgeTone {
    return STATUS_TONES[status];
  }

  protected setQuery(event: Event): void {
    this.query.set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setFilter(filter: 'status', event: Event): void {
    this[filter].set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setBusinessType(value: string): void {
    this.businessType.set(value || '-1');
    this.page.set(1);
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

  protected openDetails(seller: SellerRow): void {
    this.activeSellerId.set(seller.id);
    this.detailStatusOverride.set(null);
    this.documentRejectionOpen.set(false);
    this.pendingDecision.set(null);
    this.decisionScope.set(null);
    this.actionNotice.set('');
    this.remarks.set(seller.remarks);
    this.remarksError.set('');
  }

  protected closeDetails(): void {
    this.activeSellerId.set(null);
    this.detailRecord.set(null);
    this.detailStatusOverride.set(null);
    this.refreshListingAfterDetailFor.set(null);
    this.detailStatus.set('idle');
    this.detailError.set('');
    this.documentRejectionOpen.set(false);
    this.pendingDecision.set(null);
    this.decisionScope.set(null);
    this.actionNotice.set('');
    this.remarks.set('');
    this.remarksError.set('');
  }

  protected retryDetails(): void {
    this.detailRetry.update((count) => count + 1);
  }

  protected editSeller(seller: SellerVerificationRecord): void {
    this.closeDetails();
    void this.router.navigate(['/sell'], {
      queryParams: {
        sellerId: seller.sellerId,
        ...(seller.documentId !== undefined ? { documentId: seller.documentId } : {}),
        ...(seller.bankDetailId !== undefined ? { bankDetailId: seller.bankDetailId } : {}),
      },
    });
  }

  protected setRemarks(event: Event): void {
    this.remarks.set(eventValue(event) ?? '');
    this.remarksError.set('');
  }

  protected setDocumentRemarks(event: Event): void {
    this.documentRemarks.set(eventValue(event) ?? '');
    this.documentRemarksError.set('');
  }

  protected viewDocument(doc: SellerDocument): void {
    if (doc.url) {
      this.documentRemarks.set('');
      this.documentRemarksError.set('');
      this.documentRejectionOpen.set(false);
      this.pendingDecision.set(null);
      this.decisionScope.set(null);
      this.actionNotice.set('');
      this.previewDocument.set(doc);
    }
  }

  protected closeDocumentPreview(): void {
    this.previewDocument.set(null);
    this.documentRemarks.set('');
    this.documentRemarksError.set('');
    this.documentRejectionOpen.set(false);
    if (this.decisionScope() === 'document') {
      this.pendingDecision.set(null);
      this.decisionScope.set(null);
      this.actionNotice.set('');
    }
  }

  protected approve(): void {
    if (!this.canApproveSeller() || this.isSubmitting()) return;
    this.actionNotice.set('');
    this.decisionScope.set('seller');
    this.pendingDecision.set('approve');
  }

  protected reject(): void {
    if (!this.canRejectSeller() || this.isSubmitting()) return;
    this.actionNotice.set('');
    this.decisionScope.set('seller');
    this.pendingDecision.set('deny');
  }

  private ensureDocumentDecisionAllowed(decision: 'approve' | 'deny' | null): boolean {
    const document = this.previewDocument();
    const allowed =
      decision === 'approve'
        ? document?.status === 'Pending' || document?.status === 'Rejected'
        : decision === 'deny'
          ? document?.status === 'Pending' || document?.status === 'Approved'
          : false;
    if (!allowed) {
      this.actionNotice.set(
        decision === 'approve'
          ? 'Only pending or rejected documents can be approved.'
          : 'Only pending or approved documents can be rejected.',
      );
    }
    return allowed;
  }

  protected approveDocument(): void {
    if (this.isSubmitting() || !this.ensureDocumentDecisionAllowed('approve')) return;
    this.documentRejectionOpen.set(false);
    this.documentRemarks.set('');
    this.documentRemarksError.set('');
    this.actionNotice.set('');
    this.decisionScope.set('document');
    this.pendingDecision.set('approve');
  }

  protected rejectDocument(): void {
    if (this.isSubmitting() || !this.ensureDocumentDecisionAllowed('deny')) return;
    this.documentRemarks.set('');
    this.documentRemarksError.set('');
    this.documentRejectionOpen.set(true);
    this.actionNotice.set('');
  }

  protected submitDocumentRejection(): void {
    if (this.isSubmitting() || !this.ensureDocumentDecisionAllowed('deny')) return;
    if (!this.documentRemarks().trim()) {
      this.documentRemarksError.set('Add remarks explaining why this document is being rejected.');
      return;
    }
    this.actionNotice.set('');
    this.decisionScope.set('document');
    this.pendingDecision.set('deny');
  }

  protected cancelDocumentRejection(): void {
    this.documentRejectionOpen.set(false);
    this.documentRemarks.set('');
    this.documentRemarksError.set('');
    this.pendingDecision.set(null);
    this.decisionScope.set(null);
    this.actionNotice.set('');
  }

  private ensurePendingDocumentReview(): boolean {
    const document = this.previewDocument();
    if (document?.status === 'Pending') return true;

    const message = 'Only pending documents can be reviewed. Refresh the seller details and try again.';
    this.actionNotice.set(message);
    this.toast.showError(message);
    return false;
  }

  protected cancelDecision(): void {
    if (this.decisionScope() === 'document') {
      this.cancelDocumentRejection();
      return;
    }
    this.pendingDecision.set(null);
    this.decisionScope.set(null);
  }

  protected confirmDecision(): void {
    const decision = this.pendingDecision();
    if (!decision) return;
    if (this.decisionScope() === 'document') {
      this.submitDocumentDecision(decision);
      return;
    }
    this.submitSellerDecision(decision);
  }

  private submitSellerDecision(decision: 'approve' | 'deny'): void {
    if (this.isSubmitting()) return;
    const seller = this.activeSeller();
    const state = this.sellerDecisionState();
    if (!seller) {
      this.actionNotice.set('The selected seller is no longer available.');
      return;
    }
    if (
      (decision === 'approve' && state !== 'approved-documents') ||
      (decision === 'deny' && state !== 'approved-documents' && state !== 'rejected-document')
    ) {
      this.pendingDecision.set(null);
      this.decisionScope.set(null);
      return;
    }

    const action = decision === 'approve' ? 'approval' : 'rejection';
    this.isSubmitting.set(true);
    this.verificationService
      .updateSellerDecision({
        SELLER_ID: seller.sellerId,
        DECISION: decision === 'approve' ? 'APPROVED' : 'REJECTED',
        UPDATED_BY: 1,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => {
          const status: SellerVerificationStatus = decision === 'approve' ? 'Approved' : 'Rejected';
          this.detailStatusOverride.set({ sellerId: seller.sellerId, status });
          this.refreshListingAfterDetailFor.set(seller.sellerId);
          this.detailRetry.update((retry) => retry + 1);
          this.pendingDecision.set(null);
          this.decisionScope.set(null);
          this.actionNotice.set(message);
          this.toast.showSuccess(message);
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          const message = this.verificationService.getActionErrorMessage(error, action, 'Seller');
          this.actionNotice.set(message);
          this.toast.showError(message);
        },
      });
  }

  private submitDocumentDecision(decision: 'approve' | 'deny'): void {
    if (this.isSubmitting() || !this.ensureDocumentDecisionAllowed(decision)) return;
    const document = this.previewDocument();
    const seller = this.activeSeller();
    if (!document || !seller) {
      this.actionNotice.set('The selected document is no longer available.');
      return;
    }
    const documentId = document.documentId ?? seller.documentId;
    if (!document.proofType || !documentId) {
      this.actionNotice.set('The selected document is missing its API document ID or proof type.');
      this.toast.showError(this.actionNotice());
      return;
    }
    if (decision === 'deny' && !this.documentRemarks().trim()) {
      this.documentRemarksError.set('Add remarks explaining why this document is being rejected.');
      return;
    }

    const action = decision === 'approve' ? 'approval' : 'rejection';
    const request =
      decision === 'approve'
        ? this.verificationService.approveDocument({
            DOCUMENT_ID: documentId,
            PROOF_TYPE: document.proofType,
            UPDATED_BY: 1,
          })
        : this.verificationService.rejectDocument({
            DOCUMENT_ID: documentId,
            PROOF_TYPE: document.proofType,
            REJECTION_REASON: this.documentRemarks().trim(),
            UPDATED_BY: 1,
          });

    this.isSubmitting.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (message) => {
        if (decision === 'deny') this.documentRejectionOpen.set(false);
        this.refreshDocumentStatus(seller, document, message);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        const message = this.verificationService.getActionErrorMessage(error, action);
        this.actionNotice.set(message);
        this.toast.showError(message);
      },
    });
  }

  private refreshDocumentStatus(
    seller: SellerRow,
    document: SellerDocument,
    successMessage: string,
  ): void {
    this.verificationService
      .getSellerDetails(seller.sellerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (refreshed) => {
          this.isSubmitting.set(false);
          this.pendingDecision.set(null);
          if (this.activeSellerId() !== seller.id) return;

          const refreshedDocument = refreshed?.documents.find(
            (item) => item.proofType === document.proofType,
          );
          if (!refreshed || !refreshedDocument) {
            const message =
              'The document decision was saved, but the latest document details were not returned. Close and reopen Seller Details to retry.';
            this.actionNotice.set(message);
            this.toast.showError(message);
            return;
          }

          this.detailRecord.set(refreshed);
          this.previewDocument.update((current) =>
            current?.proofType === document.proofType ? refreshedDocument : current,
          );
          this.actionNotice.set(successMessage);
          this.toast.showSuccess(successMessage);
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.pendingDecision.set(null);
          if (this.activeSellerId() !== seller.id) return;
          const message = `The document decision was saved, but Seller Details could not be refreshed. Previous details were retained. ${this.verificationService.getErrorMessage(error)}`;
          this.actionNotice.set(message);
          this.toast.showError(message);
        },
      });
  }

  protected exportSellers(): void {
    const selected = this.selectedIds();
    const rows = this.filteredRows().filter((row) => !selected.size || selected.has(row.id));
    const header = ['Seller Name', 'Business Name', 'Email', 'Mobile No', 'Status'];
    const lines = rows.map((row) =>
      [row.sellerName, row.businessName, row.email, row.mobile, row.status]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );
    const url = URL.createObjectURL(
      new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sellers.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
