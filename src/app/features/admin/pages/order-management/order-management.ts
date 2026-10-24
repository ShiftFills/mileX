import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
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
import { eventValue } from '@shared/utils/form-events';

type PaymentStatus = 'Paid' | 'Pending' | 'Failed';
type OrderStatus = 'Confirmed' | 'Processing' | 'Cancelled';
type ShippingStatus = 'Shipped' | 'In Transit' | 'Delivered' | 'Not Shipped';

interface OrderRow {
  id: number;
  orderNo: string;
  orderDate: string;
  customer: string;
  mobile: string;
  products: string;
  quantity: number;
  amount: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  shippingStatus: ShippingStatus;
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

const PAGE_SIZE = 6;
const PAYMENT_STATUSES: readonly PaymentStatus[] = ['Paid', 'Pending', 'Failed'];
const ORDER_STATUSES: readonly OrderStatus[] = ['Confirmed', 'Processing', 'Cancelled'];
const SHIPPING_STATUSES: readonly ShippingStatus[] = ['Shipped', 'In Transit', 'Delivered', 'Not Shipped'];

const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = { Paid: 'success', Pending: 'warning', Failed: 'danger' };
const ORDER_TONES: Record<OrderStatus, BadgeTone> = { Confirmed: 'info', Processing: 'warning', Cancelled: 'danger' };
const SHIPPING_TONES: Record<ShippingStatus, BadgeTone> = {
  Shipped: 'purple',
  'In Transit': 'info',
  Delivered: 'success',
  'Not Shipped': 'neutral',
};

const STATS: readonly OrderStat[] = [
  { label: 'Total Orders', value: '342', trend: '%+8.2', trendDirection: 'up', trendTone: 'positive', icon: 'cart', tone: 'indigo' },
  { label: 'Total Revenue', value: '54,239', prefix: '₹', trend: '%+12.5', trendDirection: 'up', trendTone: 'positive', icon: 'revenue', tone: 'green' },
  { label: 'Pending Orders', value: '54', trend: '%+12.5', trendDirection: 'up', trendTone: 'negative', icon: 'pending', tone: 'red' },
  { label: 'Shipped Orders', value: '128', trend: '%+18.7', trendDirection: 'up', trendTone: 'positive', icon: 'shipped', tone: 'amber' },
  { label: 'Delivered Orders', value: '48', trend: '%-3.1', trendDirection: 'down', trendTone: 'negative', icon: 'delivered', tone: 'cyan' },
];

const ORDER_FIXTURE: OrderRow[] = Array.from({ length: 128 }, (_, index) => {
  // First rows mirror the design (Paid / Confirmed / Shipped); later rows vary so the filters have something to do.
  const variant = index < 6 ? 0 : index % 7;
  return {
    id: index + 1,
    orderNo: `#ORD-${2401 + index}`,
    orderDate: '18 Apr 2026',
    customer: 'Sujan Saha',
    mobile: '+91 9876543210',
    products: 'Earbuds, Mic',
    quantity: 2,
    amount: '₹2,500',
    paymentStatus: variant === 4 ? 'Pending' : variant === 6 ? 'Failed' : 'Paid',
    orderStatus: variant === 1 ? 'Processing' : variant === 6 ? 'Cancelled' : 'Confirmed',
    shippingStatus: variant === 1 ? 'In Transit' : variant === 3 ? 'Delivered' : variant >= 4 ? 'Not Shipped' : 'Shipped',
  };
});

@Component({
  selector: 'app-admin-order-management',
  imports: [Badge, Card, Checkbox, DateRangeFilter, ExportButton, Input, PageHeading, Pagination, Select, StatCard, Table],
  templateUrl: './order-management.html',
  styleUrl: './order-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderManagement {
  protected readonly pageSize = PAGE_SIZE;
  protected readonly stats = STATS;
  protected readonly orderStatuses = ORDER_STATUSES;
  protected readonly paymentStatuses = PAYMENT_STATUSES;
  protected readonly shippingStatuses = SHIPPING_STATUSES;

  protected readonly orders = signal(ORDER_FIXTURE);
  protected readonly query = signal('');
  protected readonly orderStatus = signal('');
  protected readonly paymentStatus = signal('');
  protected readonly shippingStatus = signal('');
  protected readonly range = signal('30');
  protected readonly page = signal(1);
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());

  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<OrderRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('selectRowCell');
  private readonly orderNoCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('orderNoCell');
  private readonly paymentCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('paymentCell');
  private readonly orderStatusCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('orderStatusCell');
  private readonly shippingCell = viewChild<TemplateRef<TableCellContext<OrderRow>>>('shippingCell');

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
    return this.orders().filter((row) => {
      const matchesQuery = !query || `${row.orderNo} ${row.customer} ${row.mobile}`.toLowerCase().includes(query);
      return (
        matchesQuery &&
        (!this.orderStatus() || row.orderStatus === this.orderStatus()) &&
        (!this.paymentStatus() || row.paymentStatus === this.paymentStatus()) &&
        (!this.shippingStatus() || row.shippingStatus === this.shippingStatus())
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

  protected paymentTone(status: PaymentStatus): BadgeTone {
    return PAYMENT_TONES[status];
  }

  protected orderTone(status: OrderStatus): BadgeTone {
    return ORDER_TONES[status];
  }

  protected shippingTone(status: ShippingStatus): BadgeTone {
    return SHIPPING_TONES[status];
  }

  protected setQuery(event: Event): void {
    this.query.set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setFilter(filter: 'orderStatus' | 'paymentStatus' | 'shippingStatus', event: Event): void {
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
