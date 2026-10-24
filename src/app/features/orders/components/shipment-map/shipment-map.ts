import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { ShipmentTracking } from '@shared/models';

const REFRESH_DELAY_MS = 800;

/** Live route card: illustrative map with the package marker, route and driver status bar. */
@Component({
  selector: 'app-shipment-map',
  imports: [Button, Card],
  templateUrl: './shipment-map.html',
  styleUrl: './shipment-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipmentMap {
  readonly shipment = input.required<ShipmentTracking>();

  protected readonly expanded = signal(false);
  protected readonly popupOpen = signal(true);
  protected readonly refreshing = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected toggleExpanded(): void {
    this.expanded.update((expanded) => !expanded);
  }

  /** Demo refresh: shows the busy state until a live tracking feed exists. */
  protected refresh(): void {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.timer = setTimeout(() => this.refreshing.set(false), REFRESH_DELAY_MS);
  }
}
