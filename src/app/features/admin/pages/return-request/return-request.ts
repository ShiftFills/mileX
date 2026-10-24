import { ChangeDetectionStrategy, Component, TemplateRef, computed, signal, viewChild } from '@angular/core';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { DateRangeFilter } from '@shared/components/date-range-filter/date-range-filter';
import { ExportButton } from '@shared/components/export-button/export-button';
import { Input } from '@shared/components/input/input';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { StatCard, StatCardIcon, StatCardTone } from '@shared/components/stat-card/stat-card';
import { Table, TableCellContext, TableColumn, TableHeaderContext } from '@shared/components/table/table';
import { ClickOutside } from '@shared/directives/click-outside';
import { eventValue } from '@shared/utils/form-events';

type ReturnStatus = 'Pending' | 'In Transit' | 'Approved' | 'Rejected';
type ReturnReason = 'Defective Product' | 'Wrong Item Received' | 'Not as Described' | 'Size / Fit Issue';

interface ReturnRow {
  id: number;
  orderNo: string;
  product: string;
  quantity: number;
  reason: ReturnReason;
  images: string[];
  pickupAddress: string;
  status: ReturnStatus;
}

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

const PAGE_SIZE = 6;
const VISIBLE_IMAGES = 2;
const STATUSES: readonly ReturnStatus[] = ['Pending', 'In Transit', 'Approved', 'Rejected'];
const REASONS: readonly ReturnReason[] = ['Defective Product', 'Wrong Item Received', 'Not as Described', 'Size / Fit Issue'];
const STATUS_TONES: Record<ReturnStatus, BadgeTone> = {
  Pending: 'warning',
  'In Transit': 'info',
  Approved: 'success',
  Rejected: 'danger',
};

const STATS: readonly ReturnStat[] = [
  { label: 'Total Requests', value: '342', trend: '%+8.2', trendDirection: 'up', trendTone: 'positive', icon: 'returns', iconImage: '/images/totalRequest.svg', tone: 'indigo' },
  { label: 'Pending', value: '128', trend: '%+18.7', trendDirection: 'up', trendTone: 'positive', icon: 'pending', iconImage: '/images/returnRequest-Pending.svg', tone: 'amber' },
  { label: 'Approved', value: '39', trend: '%+12.5', trendDirection: 'up', trendTone: 'positive', icon: 'approved', tone: 'green' },
  { label: 'In Transit', value: '48', trend: '%-3.1', trendDirection: 'down', trendTone: 'positive', icon: 'transit', tone: 'cyan' },
  { label: 'Rejected', value: '54', trend: '%-12.5', trendDirection: 'down', trendTone: 'negative', icon: 'rejected', tone: 'red' },
];

const RETURN_FIXTURE: ReturnRow[] = Array.from({ length: 128 }, (_, index) => ({
  id: index + 1,
  orderNo: `#ORD-${2401 + index}`,
  product: 'Smart Watch',
  quantity: 2,
  reason: index < 6 ? 'Defective Product' : REASONS[index % REASONS.length],
  images: Array.from({ length: 4 }, () => '/images/headphones.svg'),
  pickupAddress: '123, Green Park, Chennai - 600035 India',
  // Mirrors the design for the first page, then cycles through every status.
  status: index < 6 ? (index === 1 || index === 2 ? 'In Transit' : 'Pending') : STATUSES[index % STATUSES.length],
}));

@Component({
  selector: 'app-admin-return-request',
  imports: [Badge, Card, Checkbox, ClickOutside, DateRangeFilter, ExportButton, Input, PageHeading, Pagination, Select, StatCard, Table],
  templateUrl: './return-request.html',
  styleUrl: './return-request.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnRequest {
  protected readonly pageSize = PAGE_SIZE;
  protected readonly visibleImages = VISIBLE_IMAGES;
  protected readonly stats = STATS;
  protected readonly statuses = STATUSES;
  protected readonly reasons = REASONS;

  protected readonly requests = signal(RETURN_FIXTURE);
  protected readonly query = signal('');
  protected readonly status = signal('');
  protected readonly reason = signal('');
  protected readonly range = signal('30');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());
  protected readonly openActionMenuId = signal<number | null>(null);

  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<ReturnRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<ReturnRow>>>('selectRowCell');
  private readonly orderNoCell = viewChild<TemplateRef<TableCellContext<ReturnRow>>>('orderNoCell');
  private readonly imagesCell = viewChild<TemplateRef<TableCellContext<ReturnRow>>>('imagesCell');
  private readonly statusCell = viewChild<TemplateRef<TableCellContext<ReturnRow>>>('statusCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<ReturnRow>>>('actionCell');

  protected readonly tableColumns = computed<readonly TableColumn<ReturnRow>[]>(() => [
    {
      key: 'selection', label: '', width: '5%', selection: true,
      headerTemplate: this.selectAllHeader(), cellTemplate: this.selectRowCell(),
    },
    { key: 'orderNo', label: 'Order No', width: '10%', cellTemplate: this.orderNoCell() },
    { key: 'product', label: 'Product', width: '11%', emphasized: true },
    { key: 'quantity', label: 'Quantity', width: '8%', align: 'center' },
    { key: 'reason', label: 'Return Reason', width: '14%', emphasized: true },
    { key: 'images', label: 'Return Images', width: '14%', cellTemplate: this.imagesCell() },
    { key: 'pickupAddress', label: 'Pickup Address', width: '19%' },
    { key: 'status', label: 'Return Status', width: '9%', align: 'center', cellTemplate: this.statusCell() },
    { key: 'actions', label: 'Action', width: '8%', align: 'center', overflowVisible: true, cellTemplate: this.actionCell() },
  ]);

  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.requests().filter((row) => {
      const matchesQuery = !query || `${row.orderNo} ${row.product} ${row.reason}`.toLowerCase().includes(query);
      return (
        matchesQuery &&
        (!this.status() || row.status === this.status()) &&
        (!this.reason() || row.reason === this.reason())
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

  protected statusTone(status: ReturnStatus): BadgeTone {
    return STATUS_TONES[status];
  }

  protected setQuery(event: Event): void {
    this.query.set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setFilter(filter: 'status' | 'reason', event: Event): void {
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

  protected toggleActionMenu(id: number): void {
    this.openActionMenuId.update((openId) => (openId === id ? null : id));
  }

  protected closeActionMenu(id: number): void {
    if (this.openActionMenuId() === id) this.openActionMenuId.set(null);
  }

  /** Only pending requests can be approved or rejected; approved ones move to pickup (In Transit). */
  protected canReview(row: ReturnRow): boolean {
    return row.status === 'Pending';
  }

  protected review(row: ReturnRow, decision: 'Approved' | 'Rejected'): void {
    if (!this.canReview(row)) return;
    const status: ReturnStatus = decision === 'Approved' ? 'In Transit' : 'Rejected';
    this.requests.update((rows) => rows.map((item) => (item.id === row.id ? { ...item, status } : item)));
    this.openActionMenuId.set(null);
  }

  protected exportRequests(): void {
    const selected = this.selectedIds();
    const rows = this.filteredRows().filter((row) => !selected.size || selected.has(row.id));
    const header = ['Order No', 'Product', 'Quantity', 'Return Reason', 'Pickup Address', 'Return Status'];
    const lines = rows.map((row) =>
      [row.orderNo, row.product, row.quantity, row.reason, row.pickupAddress, row.status]
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
}
