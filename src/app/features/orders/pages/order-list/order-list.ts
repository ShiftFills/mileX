import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared';

@Component({
  selector: 'app-order-list',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-page-header title="My orders" subtitle="Order history. Coming soon." />`,
})
export class OrderList {}
