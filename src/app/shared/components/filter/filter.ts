import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface FilterOption {
  value: string;
  label: string;
  /** Optional count shown in brackets, e.g. "Fashion (6)". */
  count?: number;
}

/** Pill-style single-select filter (e.g. category chips). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-filter',
  styleUrl: './filter.scss',
  templateUrl: './filter.html',
})
export class Filter {
  readonly options = input.required<readonly FilterOption[]>();
  readonly value = input('');
  readonly ariaLabel = input('Filter');
  readonly valueChange = output<string>();
}
