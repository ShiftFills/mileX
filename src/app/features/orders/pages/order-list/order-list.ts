import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { OrderCard } from '@shared/components/order-card/order-card';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { OrderService } from '../../services/order.service';

const PAGE_SIZE = 8;

@Component({
  selector: 'app-order-list',
  imports: [OrderCard, PageHeading, Pagination, RouterLink],
  templateUrl: './order-list.html',
  styleUrl: './order-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderList {
  protected readonly routes = APP_ROUTES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly orders = inject(OrderService).orders;
  protected readonly page = signal(1);

  protected readonly visibleOrders = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.orders.slice(start, start + PAGE_SIZE);
  });
}
