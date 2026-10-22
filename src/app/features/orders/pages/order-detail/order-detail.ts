import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared';

@Component({
  selector: 'app-order-detail',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="store-container py-4"><app-page-header title="Order details" subtitle="Single order view. Coming soon." /></div>`,
})
export class OrderDetail {}
