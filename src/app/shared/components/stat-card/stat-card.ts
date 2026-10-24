import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type StatCardIcon =
  | 'cart' | 'revenue' | 'pending' | 'shipped' | 'delivered'
  | 'returns' | 'approved' | 'transit' | 'rejected' | 'sellers';
export type StatCardTone = 'indigo' | 'green' | 'amber' | 'red' | 'cyan';

/** KPI tile: label, big value, trend arrow and a tinted icon. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-stat-card',
  styleUrl: './stat-card.scss',
  templateUrl: './stat-card.html',
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly prefix = input('');
  readonly trend = input('');
  readonly trendDirection = input<'up' | 'down'>('up');
  readonly trendTone = input<'positive' | 'negative'>('positive');
  readonly icon = input<StatCardIcon>('cart');
  readonly iconImage = input<string | null>(null);
  readonly tone = input<StatCardTone>('indigo');
}
