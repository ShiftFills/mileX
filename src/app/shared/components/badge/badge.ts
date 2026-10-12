import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-badge',
  styleUrl: './badge.scss',
  templateUrl: './badge.html',
})
export class Badge {
  readonly tone = input<'neutral' | 'success' | 'warning' | 'danger'>('neutral');
}
