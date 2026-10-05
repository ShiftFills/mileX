import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared';

@Component({
  selector: 'app-home',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-page-header title="Welcome to MileX" subtitle="Storefront landing page. Coming soon." />`,
})
export class Home {}
