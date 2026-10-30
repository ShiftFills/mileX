import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { ClickOutside } from '@shared/directives/click-outside';

export interface SearchableSelectOption {
  label: string;
  value: string;
}

@Component({
  imports: [ClickOutside],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-searchable-select',
  styleUrl: './searchable-select.scss',
  templateUrl: './searchable-select.html',
})
export class SearchableSelect {
  readonly inputId = input('searchable-select');
  readonly name = input<string | null>(null);
  readonly options = input<readonly SearchableSelectOption[]>([]);
  readonly value = input('');
  readonly placeholder = input('Select an option');
  readonly searchPlaceholder = input('Search options...');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly ariaLabel = input<string | null>(null);
  readonly ariaInvalid = input<boolean | null>(null);
  readonly ariaDescribedBy = input<string | null>(null);
  readonly valueChange = output<string>();

  protected readonly isOpen = signal(false);
  protected readonly query = signal('');
  protected readonly listboxId = computed(() => `${this.inputId()}-options`);
  protected readonly selectedOption = computed(
    () => this.options().find((option) => option.value === this.value()) ?? null,
  );
  protected readonly filteredOptions = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return query
      ? this.options().filter((option) => option.label.toLocaleLowerCase().includes(query))
      : this.options();
  });

  protected toggle(): void {
    if (this.disabled()) return;
    this.isOpen.update((open) => !open);
    this.query.set('');
  }

  protected setQuery(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.query.set(target.value);
  }

  protected select(option: SearchableSelectOption): void {
    this.valueChange.emit(option.value);
    this.isOpen.set(false);
    this.query.set('');
  }

  protected closeOnOutsideClick(): void {
    this.isOpen.set(false);
    this.query.set('');
  }

  protected closeOnFocusout(event: FocusEvent): void {
    const nextTarget = event.relatedTarget;
    const currentTarget = event.currentTarget;
    if (
      !(nextTarget instanceof Node) ||
      !(currentTarget instanceof HTMLElement) ||
      !currentTarget.contains(nextTarget)
    ) {
      this.isOpen.set(false);
    }
  }

  protected closeOnEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.isOpen.set(false);
      this.query.set('');
    }
  }
}
