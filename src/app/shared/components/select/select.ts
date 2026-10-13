import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-select',
  styleUrl: './select.scss',
  templateUrl: './select.html',
})
export class Select {
  readonly inputId = input<string | null>(null);
  readonly name = input<string | null>(null);
  readonly value = input('');
  readonly required = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly size = input<'normal' | 'compact'>('normal');
  readonly ariaLabel = input<string | null>(null);
  readonly ariaInvalid = input<boolean | null>(null);
  readonly ariaDescribedBy = input<string | null>(null);
  readonly valueChange = output<Event>();
}
