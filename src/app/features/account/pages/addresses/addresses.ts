import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared';

@Component({
  selector: 'app-addresses',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-page-header title="Addresses" subtitle="Saved shipping addresses. Coming soon." />`,
})
export class Addresses {}
