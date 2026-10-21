import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from '../button/button';

/** Accent "Export" action used in admin page headings. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  selector: 'app-export-button',
  styleUrl: './export-button.scss',
  templateUrl: './export-button.html',
})
export class ExportButton {
  readonly label = input('Export');
  readonly disabled = input(false);
  readonly exported = output<void>();
}
