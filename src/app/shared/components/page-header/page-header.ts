import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header" [class.page-header--compact]="compact()">
      <h1>{{ title() }}</h1>
      @if (subtitle()) {
        <p class="text-muted">{{ subtitle() }}</p>
      }
    </header>
  `,
  styles: `
    .page-header {
      margin-block-end: var(--space-6);
    }
    .page-header--compact {
      margin-block-end: 0;
    }
    .page-header--compact h1 {
      font-size: var(--text-xl);
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly compact = input(false);
}
