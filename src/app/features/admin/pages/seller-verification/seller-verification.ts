import { ChangeDetectionStrategy, Component, TemplateRef, computed, signal, viewChild } from '@angular/core';
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
import { eventValue } from '@shared/utils/form-events';

type VerificationStatus = 'Pending' | 'Approved' | 'Rejected';
type BusinessType = 'Private Limited Company' | 'Partnership' | 'Sole Proprietorship';

interface SellerDocument {
  name: string;
  fileName: string;
  /** Download/preview URL; empty until the backend provides one. */
  url: string;
}

interface SellerRow {
  id: number;
  sellerName: string;
  businessName: string;
  businessType: BusinessType;
  sellerCode: string;
  email: string;
  mobile: string;
  gstNumber: string;
  panNumber: string;
  status: VerificationStatus;
  remarks: string;
  documents: SellerDocument[];
}

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
const STATUS_OPTIONS: readonly VerificationStatus[] = ['Pending', 'Approved', 'Rejected'];
const BUSINESS_TYPES: readonly BusinessType[] = ['Private Limited Company', 'Partnership', 'Sole Proprietorship'];
const STATUS_TONES: Record<VerificationStatus, BadgeTone> = { Pending: 'warning', Approved: 'success', Rejected: 'danger' };

const STATS: readonly SellerStat[] = [
  { label: 'Total Sellers', value: '342', trend: '%+8.2', trendDirection: 'up', trendTone: 'positive', icon: 'sellers', tone: 'indigo' },
  { label: 'Pending Verification', value: '128', trend: '%+18.7', trendDirection: 'up', trendTone: 'positive', icon: 'pending', iconImage: '/images/returnRequest-Pending.svg', tone: 'amber' },
  { label: 'Approved Sellers', value: '39', trend: '%+12.5', trendDirection: 'up', trendTone: 'positive', icon: 'approved', tone: 'green' },
  { label: 'Rejected Sellers', value: '54', trend: '%+12.5', trendDirection: 'down', trendTone: 'negative', icon: 'rejected', tone: 'red' },
];

const SELLER_FIXTURE: SellerRow[] = Array.from({ length: 128 }, (_, index) => ({
  id: index + 1,
  sellerName: 'Ragupathi',
  businessName: 'GreenMart Supplies',
  businessType: BUSINESS_TYPES[index % BUSINESS_TYPES.length],
  sellerCode: `MLX-SLR-${String(248 + index).padStart(5, '0')}`,
  email: 'priya@greenmart.com',
  mobile: '+91 9876543210',
  gstNumber: '33AABCG1234F1Z5',
  panNumber: 'AABCG1234F',
  status: index < 6 ? 'Pending' : STATUS_OPTIONS[index % STATUS_OPTIONS.length],
  remarks: '',
  documents: [
    { name: 'GST Certificate', fileName: 'GST_Certificate.pdf', url: '' },
    { name: 'PAN Card', fileName: 'PAN_Card.pdf', url: '' },
    { name: 'Business Registration Certificate', fileName: 'Business_Registration.pdf', url: '' },
    { name: 'Bank Proof / Cancelled Cheque', fileName: 'Bank_Proof.pdf', url: '' },
  ],
}));

@Component({
  selector: 'app-admin-seller-verification',
  imports: [Badge, Button, Card, Checkbox, DateRangeFilter, Dialog, ExportButton, Input, PageHeading, Pagination, Select, StatCard, Table, Textarea],
  templateUrl: './seller-verification.html',
  styleUrl: './seller-verification.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerVerification {
  protected readonly pageSize = PAGE_SIZE;
  protected readonly stats = STATS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly businessTypes = BUSINESS_TYPES;

  protected readonly sellers = signal(SELLER_FIXTURE);
  protected readonly query = signal('');
  protected readonly status = signal('');
  protected readonly businessType = signal('');
  protected readonly range = signal('30');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  protected readonly activeSellerId = signal<number | null>(null);
  protected readonly remarks = signal('');
  protected readonly remarksError = signal('');

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
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visibleRows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.id));
  });

  protected readonly activeSeller = computed(() => this.sellers().find((seller) => seller.id === this.activeSellerId()) ?? null);

  protected statusTone(status: VerificationStatus): BadgeTone {
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
    this.remarks.set(seller.remarks);
    this.remarksError.set('');
  }

  protected closeDetails(): void {
    this.activeSellerId.set(null);
    this.remarks.set('');
    this.remarksError.set('');
  }

  protected setRemarks(event: Event): void {
    this.remarks.set(eventValue(event) ?? '');
    this.remarksError.set('');
  }

  protected viewDocument(doc: SellerDocument): void {
    if (doc.url) window.open(doc.url, '_blank', 'noopener');
  }

  protected approve(): void {
    this.decide('Approved');
  }

  /** Rejecting a seller must carry a reason so the seller knows what to fix. */
  protected reject(): void {
    if (!this.remarks().trim()) {
      this.remarksError.set('Add remarks explaining why the documents are being rejected.');
      return;
    }
    this.decide('Rejected');
  }

  private decide(status: VerificationStatus): void {
    const id = this.activeSellerId();
    if (id === null) return;
    const remarks = this.remarks().trim();
    this.sellers.update((rows) => rows.map((row) => (row.id === id ? { ...row, status, remarks } : row)));
    this.closeDetails();
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
