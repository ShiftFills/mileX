import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-radio',
  styleUrl: './radio.scss',
  templateUrl: './radio.html',
})
export class Radio {
  readonly name = input.required<string>();
  readonly value = input.required<string>();
  readonly checked = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly valueChange = output<Event>();
}
