import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { OrderSummary } from '@shared/models';
import { Badge, BadgeTone } from '../badge/badge';

const STATUS_TONES: Record<string, BadgeTone> = {
  DELIVERED: 'success',
  SHIPPED: 'purple',
  IN_TRANSIT: 'purple',
  ORDERED: 'warning',
  PROCESSING: 'warning',
  PENDING: 'warning',
  CANCELLED: 'danger',
  FAILED: 'danger',
};

/**
 * One order in an order-history list: summary, items and delivery status.
 * Size it with `--order-card-scale` (1 = admin density); it adapts to its own width.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, CurrencyPipe, DatePipe, RouterLink],
  selector: 'app-order-card',
  styleUrl: './order-card.scss',
  templateUrl: './order-card.html',
})
export class OrderCard {
  readonly order = input.required<OrderSummary>();

  protected readonly detailsLink = computed(() => [APP_ROUTES.orders, this.order().id]);
  protected readonly trackingLink = computed(() => [APP_ROUTES.orders, this.order().id, 'tracking']);
  protected readonly statusTone = computed(
    () => STATUS_TONES[this.order().status.trim().toUpperCase()] ?? 'neutral',
  );
  protected readonly itemCount = computed(() =>
    this.order().items.reduce((count, item) => count + item.quantity, 0),
  );
}
