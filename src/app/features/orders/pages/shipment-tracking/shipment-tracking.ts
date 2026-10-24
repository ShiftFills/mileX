import { CurrencyPipe, DatePipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper, StepperStep } from '@shared/components/stepper/stepper';
import { ShipmentMap } from '../../components/shipment-map/shipment-map';
import { OrderService } from '../../services/order.service';

/** 24x24 icon paths for the timeline markers. */
const TRUCK_ICON = 'M2 6h11v10H2zM13 9.5h4.5l3 3.5V16H13M6.5 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01';
const HOME_ICON = 'M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5';
const COPIED_RESET_MS = 2000;

@Component({
  selector: 'app-shipment-tracking',
  imports: [Alert, Button, Card, CurrencyPipe, DatePipe, PageHeading, RouterLink, ShipmentMap, Stepper],
  templateUrl: './shipment-tracking.html',
  styleUrl: './shipment-tracking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipmentTrackingPage {
  private readonly orders = inject(OrderService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderId = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly routes = APP_ROUTES;
  protected readonly shipment = computed(() => this.orders.findTracking(this.orderId()));
  protected readonly steps = computed<StepperStep[]>(() =>
    (this.shipment()?.steps ?? []).map((step) => ({ ...step, icon: TRUCK_ICON, upcomingIcon: HOME_ICON })),
  );
  protected readonly subtotal = computed(() =>
    (this.shipment()?.items ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0),
  );
  protected readonly itemCount = computed(() => this.shipment()?.items.length ?? 0);

  protected readonly copied = signal(false);
  protected readonly notice = signal('');
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    this.destroyRef.onDestroy(() => this.timers.forEach(clearTimeout));
  }

  protected showMap(): void {
    const map = this.document.getElementById('shipment-map');
    map?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    map?.focus({ preventScroll: true });
  }

  protected async copyTrackingNo(): Promise<void> {
    const trackingNo = this.shipment()?.carrier.trackingNo;
    if (!trackingNo) return;
    try {
      await navigator.clipboard.writeText(trackingNo);
      this.copied.set(true);
      this.timers.push(setTimeout(() => this.copied.set(false), COPIED_RESET_MS));
    } catch {
      this.notice.set('Could not copy the tracking number. Please copy it manually.');
    }
  }

  protected downloadInvoice(): void {
    this.notice.set('Invoice download is not available yet.');
  }
}
