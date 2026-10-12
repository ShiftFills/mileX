import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card' },
  selector: 'app-card, [appCard]',
  styleUrl: './card.scss',
  templateUrl: './card.html',
})
export class Card {}
