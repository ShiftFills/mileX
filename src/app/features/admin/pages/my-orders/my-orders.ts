import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { OrderCard } from '@shared/components/order-card/order-card';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { OrderSummary, OrderSummaryStatus } from '@shared/models';

const PAGE_SIZE = 4;
const STATUS_NOTES: Record<OrderSummaryStatus, string> = {
  Delivered: 'Delivered on 21 Apr 2026',
  Shipped: 'Expected by 24 Apr 2026',
  Processing: 'Preparing for dispatch',
};

const ORDER_FIXTURE: OrderSummary[] = Array.from({ length: 128 }, (_, index) => {
  // Page one mirrors the design (all delivered); later pages show the other states.
  const status: OrderSummaryStatus = index < 4 ? 'Delivered' : (['Delivered', 'Shipped', 'Processing'] as const)[index % 3];
  return {
    id: `ORD-${2408 + index}`,
    placedOn: '18 Apr 2026',
    total: 4980,
    status,
    statusNote: STATUS_NOTES[status],
    trackingNo: status === 'Processing' ? '' : '732418563210',
    items: [
      { name: 'Ear Phones', variant: 'Black', quantity: 1, image: '/images/headphones.svg' },
      { name: 'Sneakers', variant: 'White / 42', quantity: 1, image: '/images/sneakers.svg' },
    ],
  };
});

@Component({
  selector: 'app-admin-my-orders',
  imports: [OrderCard, PageHeading, Pagination],
  templateUrl: './my-orders.html',
  styleUrl: './my-orders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyOrders {
  protected readonly pageSize = PAGE_SIZE;
  protected readonly orders = signal(ORDER_FIXTURE);
  protected readonly page = signal(1);

  protected readonly visibleOrders = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.orders().slice(start, start + PAGE_SIZE);
  });
}
