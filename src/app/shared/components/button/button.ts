import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-button',
  styleUrl: './button.scss',
  templateUrl: './button.html',
})
export class Button {
  readonly variant = input<'primary' | 'secondary' | 'accent' | 'danger' | 'outline' | 'outline-danger' | 'plain' | 'link' | 'icon'>('primary');
  readonly size = input<'normal' | 'small' | 'compact' | 'dense'>('normal');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly ariaLabel = input<string | null>(null);
  readonly ariaPressed = input<boolean | null>(null);
  readonly ariaExpanded = input<boolean | null>(null);
  readonly ariaHaspopup = input<string | null>(null);
  readonly ariaControls = input<string | null>(null);
  readonly clicked = output<MouseEvent>();
}
