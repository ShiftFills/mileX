import type { StatCardIcon, StatCardTone } from '@shared/components/stat-card/stat-card';

export interface DashboardStat {
  label: string;
  value: string;
  prefix?: string;
  trend: string;
  trendDirection: 'up' | 'down';
  trendTone: 'positive' | 'negative';
  icon: StatCardIcon;
  tone: StatCardTone;
}

export interface SalesPoint {
  label: string;
  /** Position on the chart, 0 (bottom) to 100 (top). */
  value: number;
  amount: string;
  change: string;
}

export interface RadarPoint {
  label: string;
  /** Share of the outer ring, 0 to 1. */
  value: number;
}

export interface OrderStatusSlice {
  label: string;
  percent: number;
  color: string;
}

export type RecentOrderStatus = 'Delivered' | 'Shipped';

export interface RecentOrder {
  id: string;
  customer: string;
  product: string;
  amount: string;
  status: RecentOrderStatus;
}

export interface TopSeller {
  name: string;
  totalSales: string;
  orders: number;
}

export const DASHBOARD_STATS: readonly DashboardStat[] = [
  { label: 'Total Revenue', value: '54,239', prefix: '₹', trend: '%+12.5', trendDirection: 'up', trendTone: 'positive', icon: 'revenue', tone: 'green' },
  { label: 'Total Orders', value: '342', trend: '%+8.2', trendDirection: 'up', trendTone: 'positive', icon: 'cart', tone: 'indigo' },
  { label: 'Active Sellers', value: '128', trend: '%+18.7', trendDirection: 'up', trendTone: 'positive', icon: 'store', tone: 'amber' },
  { label: 'Total Customers', value: '48', trend: '%-3.1', trendDirection: 'down', trendTone: 'negative', icon: 'customers', tone: 'cyan' },
];

export const SALES_PERFORMANCE: readonly SalesPoint[] = [
  { label: 'Jan', value: 20, amount: '₹19,720', change: '+1.2%' },
  { label: 'Feb', value: 54, amount: '₹41,380', change: '+6.8%' },
  { label: 'Mar', value: 35, amount: '₹32,640', change: '-2.1%' },
  { label: 'Apr', value: 59, amount: '₹46,210', change: '+4.7%' },
  { label: 'May', value: 63, amount: '₹48,975', change: '+3.4%' },
  { label: 'Jun', value: 97, amount: '₹92,430', change: '+9.6%' },
];

export const SALES_AXIS: readonly string[] = ['₹100K', '₹50K', '₹10K', '₹0'];

export const ORDERS_BY_DAY: readonly RadarPoint[] = [
  { label: 'Sat', value: 0.21 },
  { label: 'Sun', value: 0.32 },
  { label: 'Mon', value: 0.34 },
  { label: 'Tue', value: 0.68 },
  { label: 'Wed', value: 0.14 },
  { label: 'Thu', value: 0.57 },
  { label: 'Fri', value: 0.31 },
];

export const ORDER_STATUS_TOTAL = '9,550';

export const ORDER_STATUS: readonly OrderStatusSlice[] = [
  { label: 'Delivered', percent: 55, color: '#fed605' },
  { label: 'Shipping', percent: 30, color: '#02356e' },
  { label: 'Canceled', percent: 15, color: '#f0486b' },
];

export const RECENT_ORDERS: readonly RecentOrder[] = [
  { id: '#ORD-2401', customer: 'Sarah Arjun', product: 'Wireless Earbuds', amount: '₹2,500', status: 'Delivered' },
  { id: '#ORD-2402', customer: 'Michael Riyas', product: 'Smart Watch', amount: '₹3,000', status: 'Shipped' },
  { id: '#ORD-2403', customer: 'Swetha', product: 'Mobile Phone', amount: '₹15,000', status: 'Delivered' },
  { id: '#ORD-2404', customer: 'Rithika', product: 'Smart Watch', amount: '₹3,000', status: 'Shipped' },
];

export const TOP_SELLERS: readonly TopSeller[] = [
  { name: 'Sunrise Traders', totalSales: '₹28,500', orders: 54 },
  { name: 'Sunrise Traders', totalSales: '₹63,000', orders: 23 },
  { name: 'Sunrise Traders', totalSales: '₹15,000', orders: 66 },
  { name: 'Sunrise Traders', totalSales: '₹36,000', orders: 77 },
];
