import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-textarea',
  styleUrl: './textarea.scss',
  templateUrl: './textarea.html',
})
export class Textarea {
  readonly inputId = input<string | null>(null);
  readonly name = input<string | null>(null);
  readonly placeholder = input('');
  readonly value = input('');
  readonly rows = input(3);
  readonly required = input(false);
  readonly disabled = input(false);
  readonly size = input<'normal' | 'compact'>('normal');
  readonly ariaLabel = input<string | null>(null);
  readonly valueInput = output<Event>();
  readonly valueChange = output<Event>();
}
