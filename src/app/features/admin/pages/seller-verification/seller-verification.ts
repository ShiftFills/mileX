import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, catchError, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { DateRangeFilter } from '@shared/components/date-range-filter/date-range-filter';
import { Dialog } from '@shared/components/dialog/dialog';
import { ExportButton } from '@shared/components/export-button/export-button';
import { Input } from '@shared/components/input/input';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { StatCard, StatCardIcon, StatCardTone } from '@shared/components/stat-card/stat-card';
import { Table, TableCellContext, TableColumn, TableHeaderContext } from '@shared/components/table/table';
import { Textarea } from '@shared/components/textarea/textarea';
import { DocumentPreview } from '@features/seller/components/document-preview/document-preview';
import { eventValue } from '@shared/utils/form-events';
import { SellerVerificationRecord, SellerVerificationService, SellerVerificationStatus } from '../../services/seller-verification.service';

type BusinessType = 'Private Limited Company' | 'Partnership' | 'Sole Proprietorship';
type SellerRow = SellerVerificationRecord;
type SellerDocument = SellerRow['documents'][number];

interface SellerStat {
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
const STATUS_OPTIONS: readonly SellerVerificationStatus[] = ['Pending', 'Approved', 'Rejected'];
const BUSINESS_TYPES: readonly (BusinessType | '—')[] = ['Private Limited Company', 'Partnership', 'Sole Proprietorship', '—'];
const STATUS_TONES: Record<SellerVerificationStatus, BadgeTone> = { Pending: 'warning', Approved: 'success', Rejected: 'danger' };

const STATS: readonly SellerStat[] = [
  { label: 'Total Sellers', value: '—', trend: '', trendDirection: 'up', trendTone: 'positive', icon: 'sellers', tone: 'indigo' },
  { label: 'Pending Verification', value: '—', trend: '', trendDirection: 'up', trendTone: 'positive', icon: 'pending', iconImage: '/images/returnRequest-Pending.svg', tone: 'amber' },
  { label: 'Approved Sellers', value: '—', trend: '', trendDirection: 'up', trendTone: 'positive', icon: 'approved', tone: 'green' },
  { label: 'Rejected Sellers', value: '—', trend: '', trendDirection: 'down', trendTone: 'negative', icon: 'rejected', tone: 'red' },
];

@Component({
  selector: 'app-admin-seller-verification',
  imports: [Badge, Button, Card, Checkbox, DateRangeFilter, Dialog, DocumentPreview, ExportButton, Input, LoadingSpinner, PageHeading, Pagination, Select, StatCard, Table, Textarea],
  templateUrl: './seller-verification.html',
  styleUrl: './seller-verification.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerVerification {
  private readonly verificationService = inject(SellerVerificationService);
  private readonly router = inject(Router);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly stats = STATS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly businessTypes = BUSINESS_TYPES;

  protected readonly sellers = signal<SellerRow[]>([]);
  protected readonly loadStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly loadError = signal('');
  private readonly retryCount = signal(0);
  private readonly totalSellers = signal<number | undefined>(undefined);
  private readonly hasNextPage = signal(false);
  protected readonly query = signal('');
  protected readonly status = signal('');
  protected readonly businessType = signal('');
  protected readonly range = signal('30');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  protected readonly activeSellerId = signal<number | null>(null);
  protected readonly previewDocument = signal<SellerDocument | null>(null);
  protected readonly detailStatus = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  protected readonly detailError = signal('');
  private readonly detailRetry = signal(0);
  private readonly detailRecord = signal<SellerVerificationRecord | null>(null);
  protected readonly remarks = signal('');
  protected readonly remarksError = signal('');
  protected readonly pendingDecision = signal<'approve' | 'deny' | null>(null);
  protected readonly actionNotice = signal('');

  protected readonly totalCount = computed(() => this.totalSellers());
  private readonly detailRequest = computed(() => {
    const selected = this.sellers().find((seller) => seller.id === this.activeSellerId());
    return selected
      ? { sellerId: selected.sellerId, status: selected.status, retry: this.detailRetry() }
      : null;
  });
  private readonly pageRequest = computed(() => ({
    page: this.page(),
    retry: this.retryCount(),
    status: this.status(),
  }));

  constructor() {
    toObservable(this.detailRequest)
      .pipe(
        distinctUntilChanged((previous, current) =>
          previous?.sellerId === current?.sellerId &&
          previous?.status === current?.status &&
          previous?.retry === current?.retry,
        ),
        switchMap((request) => {
          this.detailRecord.set(null);
          this.detailError.set('');
          if (!request) {
            this.detailStatus.set('idle');
            return EMPTY;
          }
          this.detailStatus.set('loading');
          return this.verificationService.getSellerDetails(request.sellerId, request.status).pipe(
            tap((seller) => {
              this.detailRecord.set(seller);
              this.detailStatus.set(seller ? 'success' : 'empty');
            }),
            catchError((error: unknown) => {
              this.detailError.set(this.verificationService.getErrorMessage(error));
              this.detailStatus.set('error');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    toObservable(this.pageRequest)
      .pipe(
        distinctUntilChanged((previous, current) =>
          previous.page === current.page &&
          previous.retry === current.retry &&
          previous.status === current.status,
        ),
        switchMap(({ page, status }) => {
          this.sellers.set([]);
          this.totalSellers.set(undefined);
          this.hasNextPage.set(false);
          this.loadStatus.set('loading');
          this.loadError.set('');
          return this.verificationService.getSellers(page, PAGE_SIZE, status || 'PENDING').pipe(
            tap((result) => {
              this.sellers.set(result.items);
              this.totalSellers.set(result.total);
              this.hasNextPage.set(result.hasNext);
              this.loadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.loadError.set(this.verificationService.getErrorMessage(error));
              this.loadStatus.set('error');
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

  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<SellerRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<SellerRow>>>('selectRowCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<SellerRow>>>('actionCell');
  private readonly documentNameCell = viewChild<TemplateRef<TableCellContext<SellerDocument>>>('documentNameCell');
  private readonly documentStatusCell = viewChild<TemplateRef<TableCellContext<SellerDocument>>>('documentStatusCell');
  private readonly documentActionCell = viewChild<TemplateRef<TableCellContext<SellerDocument>>>('documentActionCell');

  protected readonly tableColumns = computed<readonly TableColumn<SellerRow>[]>(() => [
    {
      key: 'selection', label: '', width: '6%', selection: true,
      headerTemplate: this.selectAllHeader(), cellTemplate: this.selectRowCell(),
    },
    { key: 'sellerName', label: 'Seller Name', width: '16%', emphasized: true },
    { key: 'businessName', label: 'Business Name', width: '20%', emphasized: true },
    { key: 'email', label: 'Email', width: '22%' },
    { key: 'mobile', label: 'Mobile No', width: '18%' },
    { key: 'actions', label: 'Action', width: '18%', align: 'center', cellTemplate: this.actionCell() },
  ]);

  protected readonly documentColumns = computed<readonly TableColumn<SellerDocument>[]>(() => [
    { key: 'name', label: 'Document Name', width: '38%', emphasized: true, cellTemplate: this.documentNameCell() },
    { key: 'fileName', label: 'File Name', width: '28%' },
    { key: 'status', label: 'Status', width: '18%', cellTemplate: this.documentStatusCell() },
    { key: 'actions', label: 'Action', width: '16%', align: 'center', cellTemplate: this.documentActionCell() },
  ]);

  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.sellers().filter((row) => {
      const matchesQuery = !query || `${row.sellerName} ${row.businessName} ${row.email} ${row.mobile} ${row.sellerCode}`.toLowerCase().includes(query);
      return (
        matchesQuery &&
        (!this.status() || row.status === this.status()) &&
        (!this.businessType() || row.businessType === this.businessType())
      );
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
    return selected && details?.sellerId === selected.sellerId ? details : selected;
  });

  protected statusTone(status: SellerVerificationStatus): BadgeTone {
    return STATUS_TONES[status];
  }

  protected setQuery(event: Event): void {
    this.query.set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setFilter(filter: 'status' | 'businessType', event: Event): void {
    this[filter].set(eventValue(event) ?? '');
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
    this.pendingDecision.set(null);
    this.actionNotice.set('');
    this.remarks.set(seller.remarks);
    this.remarksError.set('');
  }

  protected closeDetails(): void {
    this.activeSellerId.set(null);
    this.detailRecord.set(null);
    this.detailStatus.set('idle');
    this.detailError.set('');
    this.pendingDecision.set(null);
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

  protected viewDocument(doc: SellerDocument): void {
    if (doc.url) this.previewDocument.set(doc);
  }

  protected closeDocumentPreview(): void {
    this.previewDocument.set(null);
  }

  protected approve(): void {
    this.actionNotice.set('');
    this.pendingDecision.set('approve');
  }

  /** Rejecting a seller must carry a reason so the seller knows what to fix. */
  protected reject(): void {
    if (!this.remarks().trim()) {
      this.remarksError.set('Add remarks explaining why the documents are being rejected.');
      return;
    }
    this.actionNotice.set('');
    this.pendingDecision.set('deny');
  }

  protected cancelDecision(): void {
    this.pendingDecision.set(null);
  }

  protected confirmDecision(): void {
    const decision = this.pendingDecision();
    if (!decision) return;
    const action = decision === 'approve' ? 'Approval' : 'Denial';
    this.actionNotice.set(`${action} API is not available. The seller status was not changed.`);
    this.pendingDecision.set(null);
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
    const url = URL.createObjectURL(new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sellers.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
}
