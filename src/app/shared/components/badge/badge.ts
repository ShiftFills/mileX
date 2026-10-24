import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-badge',
  styleUrl: './badge.scss',
  templateUrl: './badge.html',
})
export class Badge {
  readonly tone = input<BadgeTone>('neutral');
  readonly size = input<'normal' | 'compact'>('normal');
}
