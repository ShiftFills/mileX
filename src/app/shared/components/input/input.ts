import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  input,
  numberAttribute,
  output,
} from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-input',
  styleUrl: './input.scss',
  templateUrl: './input.html',
})
export class Input {
  readonly inputId = input<string | null>(null);
  readonly name = input<string | null>(null);
  readonly type = input('text');
  readonly placeholder = input('');
  readonly value = input<string | number>('');
  readonly autocomplete = input<string | null>(null);
  readonly min = input<number | null>(null, { transform: numberAttribute });
  readonly max = input<number | null>(null, { transform: numberAttribute });
  readonly step = input<number | null>(null, { transform: numberAttribute });
  readonly size = input<'normal' | 'compact' | 'dense'>('normal');
  readonly required = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);
  readonly ariaInvalid = input<boolean | null>(null);
  readonly ariaDescribedBy = input<string | null>(null);
  readonly valueInput = output<Event>();
  readonly valueChange = output<Event>();
}
