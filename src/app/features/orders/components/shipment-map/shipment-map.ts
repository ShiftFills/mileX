import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { ShipmentTracking } from '@shared/models';
import { shipmentStage, shippingStatusLabel } from '../../services/order.service';

/** The status bar's title when there is nothing else to say. */
const NO_LIVE_LOCATION = 'Live location not available yet';

/**
 * Live Route GPS Tracking card (design): illustrative map with the package marker, route and driver status bar.
 * CHANGED: takes any shipment and is always shown (as in the design). Each live detail appears only when the tracking
 * API sends it (it sends none yet): the route line, marker and popup need the current location, the pill the distance,
 * the status bar the route title / driver / vehicle. Without them the bar says the live location is not available and
 * shows the carrier and tracking number. Nothing is made up and nothing is called real-time that is not.
 */
@Component({
  selector: 'app-shipment-map',
  imports: [Button, Card],
  templateUrl: './shipment-map.html',
  styleUrl: './shipment-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipmentMap {
  readonly shipment = input.required<ShipmentTracking>();
  /** True while the page loads the tracking details again (Refresh). */
  // CHANGED (new): Refresh reloads the tracking API through the page (it was a timer that only showed a spinner).
  readonly refreshing = input(false);
  /** Why the last Refresh failed, shown in the status bar ('' when it did not). */
  // CHANGED (new)
  readonly error = input('');
  readonly refresh = output<void>();

  protected readonly expanded = signal(false);
  protected readonly popupOpen = signal(true);
  // CHANGED (new): the live details the API sent, each '' / undefined when it did not.
  protected readonly location = computed(() => this.shipment().currentLocation?.trim() ?? '');
  protected readonly distanceKm = computed(() => this.shipment().distanceKm);
  protected readonly routeTitle = computed(() => this.shipment().route?.title?.trim() ?? '');
  protected readonly driver = computed(() => this.shipment().route?.driver?.trim() ?? '');
  protected readonly vehicle = computed(() => this.shipment().route?.vehicle?.trim() ?? '');
  /**
   * The status bar's title: the route title the API sends; else the current location; else, from the shipping status
   * and the delivery address's city, "En route to <city>" (shipped, not delivered yet) or "Delivered in <city>"; else
   * the shipping status; else that the live location is not available yet.
   */
  // CHANGED (new)
  protected readonly title = computed(() => {
    if (this.routeTitle()) return this.routeTitle();
    if (this.location()) return `Currently at ${this.location()}`;
    const status = this.shipment().shippingStatus?.trim() ?? '';
    const stage = status ? shipmentStage(status) : null;
    const city = this.shipment().address.city?.trim() ?? '';
    if (city && stage !== null && stage >= 2 && stage < 5) return `En route to ${city}`;
    if (city && stage === 5) return `Delivered in ${city}`;
    return status ? shippingStatusLabel(status) : NO_LIVE_LOCATION;
  });
  /** The empty map says why it is empty (unless the title already does). */
  // CHANGED (new)
  protected readonly emptyNote = computed(() => !this.location() && this.title() !== NO_LIVE_LOCATION);
  protected readonly stageLabel = computed(() => {
    const location = this.location();
    if (!location) return 'Map: live location not available yet';
    const distance = this.distanceKm();
    return `Map: package at ${location}` + (distance !== undefined ? `, ${distance} km from destination` : '');
  });

  protected toggleExpanded(): void {
    this.expanded.update((expanded) => !expanded);
  }
}
