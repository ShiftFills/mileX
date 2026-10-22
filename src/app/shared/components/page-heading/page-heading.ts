import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Admin page title + subtitle, with a slot for actions (date range, export, add button...). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-page-heading',
  styleUrl: './page-heading.scss',
  templateUrl: './page-heading.html',
})
export class PageHeading {
  readonly heading = input.required<string>();
  readonly subtitle = input('');
}
