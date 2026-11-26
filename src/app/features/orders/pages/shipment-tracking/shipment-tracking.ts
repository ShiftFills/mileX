import { CurrencyPipe, DatePipe, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, catchError, defer, finalize, map, switchMap, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ToastService } from '@core/services/toast.service';
import { Alert } from '@shared/components/alert/alert';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Dialog } from '@shared/components/dialog/dialog';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Select } from '@shared/components/select/select';
import { Stepper, StepperStep } from '@shared/components/stepper/stepper';
import { Textarea } from '@shared/components/textarea/textarea';
import { ReturnReasonOption, ShipmentTracking } from '@shared/models';
import { ShipmentMap } from '../../components/shipment-map/shipment-map';
import { OrderService, shipmentStage, shippingStatusLabel } from '../../services/order.service';

/** 24x24 icon paths for the timeline markers. */
const TRUCK_ICON = 'M2 6h11v10H2zM13 9.5h4.5l3 3.5V16H13M6.5 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01';
const HOME_ICON = 'M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5';
const COPIED_RESET_MS = 2000;
/** Order (or shipping) statuses that end an order before delivery, with the note shown instead of the steps. */
// CHANGED (new)
const CLOSED_STATUS_NOTES: Readonly<Record<string, string>> = {
  CANCELLED: 'This order was cancelled, so it will not be delivered.',
  FAILED: 'This order could not be completed, so it will not be delivered.',
  RETURNED: 'This shipment was returned.',
};

/** "In Transit" / "in-transit" -> "IN_TRANSIT". */
function statusKey(status: string | undefined): string {
  return (status ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

@Component({
  selector: 'app-shipment-tracking',
  imports: [Alert, Button, Card, CurrencyPipe, DatePipe, Dialog, LoadingSpinner, PageHeading, RouterLink, Select, ShipmentMap, Stepper, Textarea],
  templateUrl: './shipment-tracking.html',
  styleUrl: './shipment-tracking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Shipment Tracking (`/orders/:id/tracking`, :id is the ORDER_NUMBER): the tracking API's details of one order
 * (OrderService.getShipmentTracking). Nothing the API does not send is made up: the Live Route GPS Tracking card says
 * the live location is not available yet, and the payment card and the actions without an API are hidden.
 */
// CHANGED: reads the tracking API (it showed a demo shipment).
export class ShipmentTrackingPage {
  private readonly orders = inject(OrderService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderId = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  protected readonly routes = APP_ROUTES;
  /** The ORDER_NUMBER from the route, for the links back to its Order Details. */
  // CHANGED (new)
  protected readonly orderNumber = computed(() => this.orderId().trim());
  // CHANGED (new): the tracking request's state; a 'success' without a shipment is the "not shipped yet" state.
  protected readonly status = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly error = signal('');
  protected readonly shipment = signal<ShipmentTracking | null>(null);
  private readonly retryCount = signal(0);

  protected readonly steps = computed<StepperStep[]>(() =>
    (this.shipment()?.steps ?? []).map((step) => ({ ...step, icon: TRUCK_ICON, upcomingIcon: HOME_ICON })),
  );
  protected readonly itemCount = computed(() => this.shipment()?.items.length ?? 0);
  /**
   * The Live Route GPS Tracking card, Live Map View button and current-location line are shown (as in the design) for
   * every shipment that is not cancelled, failed or returned. They show live details only when the API sends them.
   */
  // CHANGED: they were shown only with live location data, which the tracking API does not send yet.
  protected readonly showLiveTracking = computed(() => !!this.shipment() && !this.closedNote());
  /** The current location the API sent ('' when none). */
  // CHANGED (new)
  protected readonly currentLocation = computed(() => this.shipment()?.currentLocation?.trim() ?? '');
  /**
   * Without a current location, the location line says where the package is in the delivery instead: the shipping
   * status ("In Transit", from ORDER_SHIPPING_STATUS_NAME) and, once it is shipped, the carrier it is with.
   */
  // CHANGED (new)
  protected readonly packageStatus = computed(() => {
    const shipment = this.shipment();
    const status = shipment?.shippingStatus?.trim() ?? '';
    if (!shipment || !status) return null;
    const stage = shipmentStage(status);
    return {
      status: shippingStatusLabel(status),
      carrier: stage !== null && stage >= 2 && stage < 5 ? shipment.carrier.name : '',
    };
  });
  /** True while Refresh loads the tracking details again. */
  // CHANGED (new)
  protected readonly refreshing = signal(false);
  /** Why the last Refresh failed ('' when it did not), shown in the map card. */
  // CHANGED (new)
  protected readonly refreshError = signal('');
  /** "Verified Packed": only once the shipping status is Packed or later. */
  // CHANGED (new): it was shown once the shipment had a shipping date.
  protected readonly verifiedPacked = computed(() => {
    const status = this.shipment()?.shippingStatus;
    const stage = status ? shipmentStage(status) : null;
    return stage !== null && stage >= 1;
  });
  /** The note shown instead of the progress steps for a cancelled, failed or returned order. */
  // CHANGED (new)
  protected readonly closedNote = computed(() => {
    const shipment = this.shipment();
    return CLOSED_STATUS_NOTES[statusKey(shipment?.orderStatus)] ?? CLOSED_STATUS_NOTES[statusKey(shipment?.shippingStatus)];
  });

  protected readonly copied = signal(false);
  protected readonly notice = signal('');
  protected readonly returnRequestOpen = signal(false);
  protected readonly returnReason = signal<number | null>(null);
  protected readonly returnReasonValue = computed(() => {
    const reasonId = this.returnReason();
    return reasonId === null ? '' : String(reasonId);
  });
  protected readonly returnDetails = signal('');
  protected readonly returnReasonError = signal(false);
  protected readonly returnReasons = signal<ReturnReasonOption[]>([]);
  protected readonly returnReasonsStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly returnReasonsError = signal('');
  private readonly toast = inject(ToastService);
  private readonly timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    this.destroyRef.onDestroy(() => this.timers.forEach(clearTimeout));
    // CHANGED (new): loads the order's tracking (again for another order number, and on "Try again").
    toObservable(computed(() => ({ orderNumber: this.orderNumber(), retry: this.retryCount() })))
      .pipe(
        switchMap(({ orderNumber }) => {
          this.shipment.set(null);
          this.error.set('');
          if (!orderNumber) {
            // No order number: nothing to load, so the page shows "not found".
            this.status.set('success');
            return EMPTY;
          }
          this.status.set('loading');
          return defer(() => this.orders.getShipmentTracking(orderNumber)).pipe(
            tap((shipment) => {
              this.shipment.set(shipment);
              this.status.set('success');
            }),
            catchError((error: unknown) => {
              const message = this.orders.customerOrdersErrorMessage(error, 'Shipment tracking');
              this.error.set(message);
              this.status.set('error');
              this.toast.showError(message);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** "Try again" after the tracking request failed. */
  // CHANGED (new)
  protected retry(): void {
    if (this.status() !== 'loading') this.retryCount.update((count) => count + 1);
  }

  /**
   * The map card's Refresh: requests the tracking details again (GET tracking; there is no live-tracking API or push
   * channel, so nothing polls) and shows what the API sends now, keeping the page as it is meanwhile. A failure keeps
   * the details shown and is reported in the map card and a toast.
   */
  // CHANGED (new)
  protected refreshTracking(): void {
    const orderNumber = this.orderNumber();
    if (!orderNumber || this.refreshing() || this.status() !== 'success') return;
    this.refreshing.set(true);
    this.refreshError.set('');
    this.orders
      .getShipmentTracking(orderNumber)
      .pipe(
        finalize(() => this.refreshing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (shipment) => {
          if (shipment) this.shipment.set(shipment);
        },
        error: (error: unknown) => {
          const message = this.orders.customerOrdersErrorMessage(error, 'Shipment tracking');
          this.refreshError.set(message);
          this.toast.showError(message);
        },
      });
  }

  protected showMap(): void {
    const map = this.document.getElementById('shipment-map');
    map?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    map?.focus({ preventScroll: true });
  }

  protected openReturnRequest(): void {
    this.returnReason.set(null);
    this.returnDetails.set('');
    this.returnReasonError.set(false);
    this.returnRequestOpen.set(true);
    this.loadReturnReasons();
  }

  protected closeReturnRequest(): void {
    this.returnRequestOpen.set(false);
    this.returnReasonError.set(false);
  }

  protected setReturnReason(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const reasonId = Number(value);
    this.returnReason.set(
      value && Number.isSafeInteger(reasonId) && reasonId > 0 ? reasonId : null,
    );
    if (this.returnReason() !== null) this.returnReasonError.set(false);
  }

  protected loadReturnReasons(): void {
    const status = this.returnReasonsStatus();
    if (status === 'loading' || status === 'success') return;

    this.returnReasonsStatus.set('loading');
    this.returnReasonsError.set('');
    this.orders
      .getReturnReasons()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reasons) => {
          this.returnReasons.set(reasons);
          this.returnReasonsStatus.set('success');
        },
        error: (error: unknown) => {
          const message =
            error instanceof HttpErrorResponse
              ? 'Return reasons could not be loaded. Please try again.'
              : error instanceof Error
                ? error.message
                : 'Return reasons could not be loaded. Please try again.';
          this.returnReasonsError.set(message);
          this.returnReasonsStatus.set('error');
          this.toast.showError(message);
        },
      });
  }

  protected setReturnDetails(event: Event): void {
    this.returnDetails.set((event.target as HTMLTextAreaElement).value.slice(0, 500));
  }

  protected submitReturnRequest(event: Event): void {
    event.preventDefault();
    if (!this.returnReason()) {
      this.returnReasonError.set(true);
      return;
    }
    this.notice.set('Your cancel / return request has been submitted for review.');
    this.closeReturnRequest();
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

  // CHANGED: downloadInvoice() is removed: Invoice PDF is now a link to the shipment's actions.invoiceUrl, shown only
  // when the backend sends one (there is no invoice API yet).
}
