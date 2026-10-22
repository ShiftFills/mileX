import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../button/button';
import { Input } from '../input/input';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, Input],
  selector: 'app-search-box',
  styleUrl: './search-box.scss',
  templateUrl: './search-box.html',
})
export class SearchBox {
  readonly name = input('q');
  readonly inputId = input('search-box-input');
  readonly placeholder = input('Search...');
  readonly ariaLabel = input('Search');
  readonly value = input('');
  readonly submitLabel = input('Search');
  readonly buttonSize = input<'normal' | 'small'>('small');
  readonly buttonVariant = input<'primary' | 'accent'>('primary');
  readonly iconOnly = input(false);
  readonly changed = output<string>();
  readonly submitted = output<string>();

  protected updateValue(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.changed.emit(target.value);
  }

  protected submit(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.currentTarget;
    if (form instanceof HTMLFormElement) {
      const data = new FormData(form);
      this.submitted.emit(String(data.get(this.name()) ?? '').trim());
    }
  }
}
