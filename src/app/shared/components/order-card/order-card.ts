import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { OrderSummary, OrderSummaryStatus } from '@shared/models';
import { Badge, BadgeTone } from '../badge/badge';

const STATUS_TONES: Record<OrderSummaryStatus, BadgeTone> = {
  Delivered: 'success',
  Shipped: 'purple',
  Processing: 'warning',
};

/**
 * One order in an order-history list: summary, items and delivery status.
 * Size it with `--order-card-scale` (1 = admin density); it adapts to its own width.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, CurrencyPipe, RouterLink],
  selector: 'app-order-card',
  styleUrl: './order-card.scss',
  templateUrl: './order-card.html',
})
export class OrderCard {
  readonly order = input.required<OrderSummary>();

  protected readonly detailsLink = computed(() => [APP_ROUTES.orders, this.order().id]);
  protected readonly statusTone = computed(() => STATUS_TONES[this.order().status]);
  protected readonly itemCount = computed(() =>
    this.order().items.reduce((count, item) => count + item.quantity, 0),
  );
}
