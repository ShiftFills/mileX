import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Select } from '../select/select';

export interface DateRangeOption {
  label: string;
  value: string;
}

export const DEFAULT_DATE_RANGES: readonly DateRangeOption[] = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'Last 12 months', value: '365' },
];

/** Calendar-icon range picker shown in admin page headings ("Last 30 days"). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Select],
  selector: 'app-date-range-filter',
  styleUrl: './date-range-filter.scss',
  templateUrl: './date-range-filter.html',
})
export class DateRangeFilter {
  readonly value = input('30');
  readonly options = input<readonly DateRangeOption[]>(DEFAULT_DATE_RANGES);
  readonly inputId = input('date-range-filter');
  readonly valueChange = output<string>();

  protected change(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) this.valueChange.emit(select.value);
  }
}
