import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeader } from '@shared';

@Component({
  selector: 'app-not-found',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-page-header title="Page not found" subtitle="The page you are looking for does not exist." />`,
})
export class NotFound {}
