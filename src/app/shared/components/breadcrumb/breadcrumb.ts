import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-breadcrumb',
  styleUrl: './breadcrumb.scss',
  templateUrl: './breadcrumb.html',
})
export class Breadcrumb {
  readonly ariaLabel = input('Breadcrumb');
}
