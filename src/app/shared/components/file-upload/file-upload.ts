import { booleanAttribute, ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-file-upload',
  styleUrl: './file-upload.scss',
  templateUrl: './file-upload.html',
})
export class FileUpload {
  readonly inputId = input.required<string>();
  readonly name = input.required<string>();
  readonly accept = input('application/pdf,image/jpeg,image/png');
  readonly multiple = input(false, { transform: booleanAttribute });
  readonly ariaDescribedBy = input<string | null>(null);
  readonly buttonLabel = input('Choose Files');
  readonly appearance = input<'default' | 'accent-outline'>('default');
  readonly fileSelected = output<File>();

  protected selectFile(event: Event): void {
    const inputElement = event.target;
    if (!(inputElement instanceof HTMLInputElement)) return;
    const files = Array.from(inputElement.files ?? []);
    if (!files.length) return;

    for (const file of files) this.fileSelected.emit(file);
    inputElement.value = '';
  }
}
