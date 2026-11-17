import { CurrencyPipe, DatePipe, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
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
import { ReturnReasonOption } from '@shared/models';
import { ShipmentMap } from '../../components/shipment-map/shipment-map';
import { OrderService } from '../../services/order.service';

/** 24x24 icon paths for the timeline markers. */
const TRUCK_ICON = 'M2 6h11v10H2zM13 9.5h4.5l3 3.5V16H13M6.5 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01';
const HOME_ICON = 'M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5';
const COPIED_RESET_MS = 2000;

@Component({
  selector: 'app-shipment-tracking',
  imports: [Alert, Button, Card, CurrencyPipe, DatePipe, Dialog, LoadingSpinner, PageHeading, RouterLink, Select, ShipmentMap, Stepper, Textarea],
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

  protected downloadInvoice(): void {
    this.notice.set('Invoice download is not available yet.');
  }
}
