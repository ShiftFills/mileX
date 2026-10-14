import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-checkbox',
  styleUrl: './checkbox.scss',
  templateUrl: './checkbox.html',
})
export class Checkbox {
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly name = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly checkedChange = output<boolean>();

  protected updateChecked(event: Event): void {
    this.checkedChange.emit((event.target as HTMLInputElement).checked);
  }
}
