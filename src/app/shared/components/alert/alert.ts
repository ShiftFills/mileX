import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-alert',
  styleUrl: './alert.scss',
  templateUrl: './alert.html',
})
export class Alert {
  readonly tone = input<'info' | 'success' | 'warning' | 'danger'>('info');
  readonly role = input<'status' | 'alert'>('status');
}
