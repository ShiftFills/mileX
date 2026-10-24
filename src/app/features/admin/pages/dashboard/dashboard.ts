import { ChangeDetectionStrategy, Component, TemplateRef, computed, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Card } from '@shared/components/card/card';
import { DateRangeFilter } from '@shared/components/date-range-filter/date-range-filter';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Select } from '@shared/components/select/select';
import { StatCard } from '@shared/components/stat-card/stat-card';
import { Table, TableCellContext, TableColumn } from '@shared/components/table/table';
import { eventValue } from '@shared/utils/form-events';
import { DonutChart } from '../../components/donut-chart/donut-chart';
import { RadarChart } from '../../components/radar-chart/radar-chart';
import { SalesChart } from '../../components/sales-chart/sales-chart';
import {
  DASHBOARD_STATS,
  ORDERS_BY_DAY,
  ORDER_STATUS,
  ORDER_STATUS_TOTAL,
  RECENT_ORDERS,
  RecentOrder,
  RecentOrderStatus,
  SALES_AXIS,
  SALES_PERFORMANCE,
  TOP_SELLERS,
  TopSeller,
} from '../../data/admin-dashboard';

const ADMIN_NAME = 'Sujan';
const CHART_PERIODS = [
  { label: 'This week', value: 'week' },
  { label: 'This month', value: 'month' },
  { label: 'This year', value: 'year' },
] as const;
const STATUS_TONES: Record<RecentOrderStatus, BadgeTone> = { Delivered: 'success', Shipped: 'warning' };

@Component({
  selector: 'app-admin-dashboard',
  imports: [Badge, Card, DateRangeFilter, DonutChart, PageHeading, RadarChart, RouterLink, SalesChart, Select, StatCard, Table],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly adminName = ADMIN_NAME;
  protected readonly stats = DASHBOARD_STATS;
  protected readonly salesPoints = SALES_PERFORMANCE;
  protected readonly salesAxis = SALES_AXIS;
  protected readonly activeSalesIndex = SALES_PERFORMANCE.findIndex((point) => point.label === 'May');
  protected readonly ordersByDay = ORDERS_BY_DAY;
  protected readonly orderStatus = ORDER_STATUS;
  protected readonly orderStatusTotal = ORDER_STATUS_TOTAL;
  protected readonly recentOrders = RECENT_ORDERS;
  protected readonly topSellers = TOP_SELLERS;
  protected readonly periods = CHART_PERIODS;

  protected readonly range = signal('30');
  protected readonly salesPeriod = signal('week');
  protected readonly ordersPeriod = signal('week');

  private readonly orderIdCell = viewChild<TemplateRef<TableCellContext<RecentOrder>>>('orderIdCell');
  private readonly orderAmountCell = viewChild<TemplateRef<TableCellContext<RecentOrder>>>('orderAmountCell');
  private readonly orderStatusCell = viewChild<TemplateRef<TableCellContext<RecentOrder>>>('orderStatusCell');
  private readonly sellerSalesCell = viewChild<TemplateRef<TableCellContext<TopSeller>>>('sellerSalesCell');

  protected readonly orderColumns = computed<readonly TableColumn<RecentOrder>[]>(() => [
    { key: 'id', label: 'Order ID', width: '20.6%', cellTemplate: this.orderIdCell() },
    { key: 'customer', label: 'Customer', width: '22.5%', emphasized: true },
    { key: 'product', label: 'Product', width: '26.7%' },
    { key: 'amount', label: 'Amount', width: '14.4%', cellTemplate: this.orderAmountCell() },
    { key: 'status', label: 'Status', width: '15.8%', align: 'center', cellTemplate: this.orderStatusCell() },
  ]);

  protected readonly sellerColumns = computed<readonly TableColumn<TopSeller>[]>(() => [
    { key: 'name', label: 'Seller Name', width: '46%', emphasized: true },
    { key: 'totalSales', label: 'Total Sales', width: '38.6%', cellTemplate: this.sellerSalesCell() },
    { key: 'orders', label: 'Orders', width: '15.4%' },
  ]);

  protected statusTone(status: RecentOrderStatus): BadgeTone {
    return STATUS_TONES[status];
  }

  protected setPeriod(target: 'sales' | 'orders', event: Event): void {
    const value = eventValue(event) ?? 'week';
    (target === 'sales' ? this.salesPeriod : this.ordersPeriod).set(value);
  }
}
