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
import { SearchableSelect, SearchableSelectOption } from '@shared/components/searchable-select/searchable-select';
import { Stepper, StepperStep } from '@shared/components/stepper/stepper';
import { Textarea } from '@shared/components/textarea/textarea';
import {
  ReturnProductOption,
  ReturnReasonOption,
  ReturnRequestResult,
  ShipmentItem,
  ShipmentTracking,
  StatusOption,
} from '@shared/models';
import { ShipmentMap } from '../../components/shipment-map/shipment-map';
import {
  DELIVERED_STAGE,
  OrderService,
  RETURN_DESCRIPTION_MAX_LENGTH,
  ShipmentClosure,
  shipmentClosure,
  shipmentStage,
  shippingStatusLabel,
} from '../../services/order.service';

/** 24x24 icon paths for the timeline markers. */
const TRUCK_ICON = 'M2 6h11v10H2zM13 9.5h4.5l3 3.5V16H13M6.5 19a1.5 1.5 0 1 0 0-.01M17 19a1.5 1.5 0 1 0 0-.01';
const HOME_ICON = 'M4 11l8-7 8 7M6 10v9h12v-9M10 19v-5h4v5';
const COPIED_RESET_MS = 2000;
/** The note shown instead of the steps, by how the delivery ended (shipmentClosure). */
// CHANGED: by kind of status (it was a list of exact names, so RETURN/REFUND, RTO, … showed "Order Placed" instead).
const CLOSED_STATUS_NOTES: Readonly<Record<ShipmentClosure, string>> = {
  cancelled: 'This order was cancelled, so it will not be delivered.',
  failed: 'This order could not be completed, so it will not be delivered.',
  returned: 'This shipment was returned.',
};
/** The plain status of each kind, which the note already says (any other status name is added to it). */
const PLAIN_CLOSED_STATUSES: Readonly<Record<ShipmentClosure, string>> = {
  cancelled: 'Cancelled',
  failed: 'Failed',
  returned: 'Returned',
};

/** A dropdown value as a positive ID, or null for '' (nothing chosen). */
// CHANGED (new): shared by the return type and reason dropdowns.
function selectedId(value: string): number | null {
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}

type LookupStatus = 'idle' | 'loading' | 'success' | 'error';

/** The dialog's product card icon when the product has no tracking row (a parcel, as the tracking rows use). */
const PRODUCT_ICON = 'M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9';

/** A return request this page created, with what the customer chose (shown once the dialog closes). */
// CHANGED (new)
interface SubmittedReturn {
  orderNumber: string;
  result: ReturnRequestResult;
  /** The returned product, and the chosen return type ("Return/Refund") and reason, as the dialog showed them. */
  productName: string;
  typeLabel: string;
  reasonLabel: string;
  /** CHANGED (new): the chosen refund method ("Wallet"), '' for a replacement. */
  refundMethodLabel: string;
}

/** A product's order line ("<ORDER_ID>|<PRODUCT_ID>|<PRODUCT_VARIANT_ID>"): the Product dropdown's value. */
// CHANGED (new): the products come from return_dropdown (they were the tracking rows).
function productLineKey(product: ReturnProductOption): string {
  return `${product.orderId}|${product.productId}|${product.variantId ?? ''}`;
}

/** The Product dropdown's options: PRODUCT_NAME; products of the same name also show their variant (or order line). */
// CHANGED (new)
function productSelectOptions(products: readonly ReturnProductOption[]): SearchableSelectOption[] {
  const counts = new Map<string, number>();
  for (const product of products) counts.set(product.name, (counts.get(product.name) ?? 0) + 1);
  return products.map((product) => ({
    value: productLineKey(product),
    label:
      (counts.get(product.name) ?? 0) > 1
        ? `${product.name} · ${product.variantId ? `Variant ${product.variantId}` : `Order line ${product.orderId}`}`
        : product.name,
  }));
}

/**
 * The chosen product's tracking row (its SKU, quantity and price, and the SELLER_ID and DELIVERY_ADDRESS_ID a request
 * sends): the row of the same order line (ORDER_ID and PRODUCT_ID), else a row without an ORDER_ID of the same product
 * and variant. Null when the tracking has no such row.
 */
// CHANGED (new)
function trackingItemFor(product: ReturnProductOption, items: readonly ShipmentItem[]): ShipmentItem | null {
  return (
    items.find((item) => item.orderId === product.orderId && item.productId === product.productId) ??
    items.find(
      (item) =>
        item.orderId === undefined && item.productId === product.productId && (item.variantId ?? null) === product.variantId,
    ) ??
    null
  );
}

/** A lookup's own failure message; a generic one for an HTTP error (not raw HTTP details). */
function lookupErrorMessage(error: unknown, fallback: string): string {
  return !(error instanceof HttpErrorResponse) && error instanceof Error && error.message ? error.message : fallback;
}

@Component({
  selector: 'app-shipment-tracking',
  // CHANGED: SearchableSelect (the dialog's dropdowns) instead of Select.
  imports: [Alert, Button, Card, CurrencyPipe, DatePipe, Dialog, LoadingSpinner, PageHeading, RouterLink, SearchableSelect, ShipmentMap, Stepper, Textarea],
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
  /**
   * The note shown instead of the progress steps, when the shipment left the delivery path. The shipment's own status
   * (ORDER_SHIPPING_STATUS_NAME) decides: cancelled, failed or returned (RETURNED, RETURN/REFUND, RTO, …), with that
   * status's name when the note does not already say it. The order status adds a note only for an order cancelled or
   * failed before delivery (it will not be delivered, whatever the shipping status still says). A returned order is
   * not closed here: its shipment was delivered first, so the timeline shows that.
   */
  // CHANGED: from ORDER_SHIPPING_STATUS_NAME (the order status RETURNED hid the timeline of a delivered shipment).
  protected readonly closedNote = computed(() => {
    const shipment = this.shipment();
    if (!shipment) return undefined;
    const shippingStatus = shipment.shippingStatus?.trim() ?? '';
    const closure = shippingStatus ? shipmentClosure(shippingStatus) : null;
    if (closure) {
      const label = shippingStatusLabel(shippingStatus);
      const note = CLOSED_STATUS_NOTES[closure];
      return label === PLAIN_CLOSED_STATUSES[closure] ? note : `${note} Shipping status: ${label}.`;
    }
    const orderClosure = shipment.orderStatus ? shipmentClosure(shipment.orderStatus) : null;
    const delivered = !!shippingStatus && shipmentStage(shippingStatus) === DELIVERED_STAGE;
    return (orderClosure === 'cancelled' || orderClosure === 'failed') && !delivered
      ? CLOSED_STATUS_NOTES[orderClosure]
      : undefined;
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
  // CHANGED: the limit is the service's (the request is checked against it too).
  protected readonly returnDetailsMaxLength = RETURN_DESCRIPTION_MAX_LENGTH;
  protected readonly returnReasonError = signal(false);
  protected readonly returnReasons = signal<ReturnReasonOption[]>([]);
  protected readonly returnReasonsStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly returnReasonsError = signal('');
  /** Return Type: refund or replacement, the RETURN_STATUS_ID of a "RETURN/…" return status (sent as RETURN_OPTION). */
  // CHANGED (new)
  protected readonly returnType = signal<number | null>(null);
  protected readonly returnTypeValue = computed(() => {
    const typeId = this.returnType();
    return typeId === null ? '' : String(typeId);
  });
  protected readonly returnTypeError = signal(false);
  protected readonly returnTypes = signal<StatusOption[]>([]);
  protected readonly returnTypesStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly returnTypesError = signal('');
  /** "RETURN/REFUND" -> "Return/Refund" (as the page shows its other shipping statuses). */
  protected readonly returnTypeLabel = shippingStatusLabel;
  /** The dropdowns' options: the API IDs as values. */
  // CHANGED (new): for SearchableSelect (the native select's list could not be styled and covered the dialog).
  protected readonly returnTypeOptions = computed<SearchableSelectOption[]>(() =>
    this.returnTypes().map((type) => ({ value: String(type.id), label: shippingStatusLabel(type.label) })),
  );
  protected readonly returnReasonOptions = computed<SearchableSelectOption[]>(() =>
    this.returnReasons().map((reason) => ({ value: String(reason.REASON_ID), label: reason.REASON })),
  );
  /**
   * CHANGED: the products a return can be requested for come from return_dropdown (by the order number), read when the
   * dialog first opens for the order; each keeps its ORDER_ID, PRODUCT_ID and PRODUCT_VARIANT_ID. A return sends the
   * IDs of the product chosen, never another product's (it was the tracking rows).
   */
  private readonly returnProductsState = signal<{
    orderNumber: string;
    status: LookupStatus;
    products: ReturnProductOption[];
    error: string;
  }>({ orderNumber: '', status: 'idle', products: [], error: '' });
  protected readonly returnProductsStatus = computed<LookupStatus>(() => {
    const state = this.returnProductsState();
    return state.orderNumber === this.orderNumber() ? state.status : 'idle';
  });
  protected readonly returnProductsError = computed(() => this.returnProductsState().error);
  /** Order lines already requested on this page ("<order number>|<order line key>"). */
  private readonly requestedReturns = signal<ReadonlySet<string>>(new Set());
  /** The products the dialog offers: those not yet requested on this page. */
  protected readonly returnProducts = computed(() => {
    const state = this.returnProductsState();
    const order = this.orderNumber();
    if (state.orderNumber !== order) return [];
    const requested = this.requestedReturns();
    return state.products.filter((product) => !requested.has(`${order}|${productLineKey(product)}`));
  });
  protected readonly returnProductOptions = computed(() => productSelectOptions(this.returnProducts()));
  /** The Product dropdown's choice ('' until one is chosen). */
  protected readonly returnProductKey = signal('');
  protected readonly returnProductError = signal(false);
  /** The chosen product; an order with only one product to return has it chosen. */
  // CHANGED: nothing is chosen for an order with several products (it chose the first).
  protected readonly selectedReturn = computed(() => {
    const products = this.returnProducts();
    return (
      products.find((product) => productLineKey(product) === this.returnProductKey()) ??
      (products.length === 1 ? products[0] : null)
    );
  });
  protected readonly returnProductValue = computed(() => {
    const product = this.selectedReturn();
    return product ? productLineKey(product) : '';
  });
  /** The chosen product's tracking row (card details, SELLER_ID and the pickup address); null without one. */
  protected readonly returnItem = computed(() => {
    const product = this.selectedReturn();
    return product ? trackingItemFor(product, this.shipment()?.items ?? []) : null;
  });
  protected readonly productIcon = PRODUCT_ICON;
  /** Every product of this order was requested on this page: Cancel / Return is then done. */
  // CHANGED: from the return_dropdown products (read when the dialog first opened).
  protected readonly allReturnsRequested = computed(
    () =>
      this.returnProductsStatus() === 'success' &&
      this.returnProductsState().products.length > 0 &&
      this.returnProducts().length === 0,
  );

  /**
   * CHANGED (new): Refund Method (refund_method, the active ones), shown and required for a refund only. It is read the
   * first time a refund is chosen, and kept.
   */
  protected readonly refundMethods = signal<StatusOption[]>([]);
  protected readonly refundMethodsStatus = signal<LookupStatus>('idle');
  protected readonly refundMethodsError = signal('');
  protected readonly refundMethod = signal<number | null>(null);
  protected readonly refundMethodValue = computed(() => {
    const methodId = this.refundMethod();
    return methodId === null ? '' : String(methodId);
  });
  protected readonly refundMethodError = signal(false);
  protected readonly refundMethodOptions = computed<SearchableSelectOption[]>(() =>
    this.refundMethods().map((method) => ({ value: String(method.id), label: method.label })),
  );
  /** The chosen Return Type is a refund ("RETURN/REFUND"), so a refund method is required. */
  protected readonly isRefund = computed(() => {
    const typeId = this.returnType();
    const type = typeId === null ? undefined : this.returnTypes().find((candidate) => candidate.id === typeId);
    return !!type && /REFUND/i.test(type.label);
  });
  /** True while POST return_request is in flight: the form is locked and Submit shows its spinner. */
  // CHANGED (new)
  protected readonly submittingReturn = signal(false);
  protected readonly returnSubmitError = signal('');
  private readonly submittedReturn = signal<SubmittedReturn | null>(null);
  /** The latest return request made for this order on this page. */
  // CHANGED (new)
  protected readonly currentReturn = computed(() => {
    const submitted = this.submittedReturn();
    return submitted && submitted.orderNumber === this.orderNumber() ? submitted : null;
  });
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

  // CHANGED: also resets and loads the Product (return_dropdown), the Return Type and the Refund Method; not offered
  // once every product of the order was requested.
  protected openReturnRequest(): void {
    if (this.allReturnsRequested()) return;
    this.returnProductKey.set('');
    this.returnProductError.set(false);
    this.returnType.set(null);
    this.returnTypeError.set(false);
    this.refundMethod.set(null);
    this.refundMethodError.set(false);
    this.returnReason.set(null);
    this.returnDetails.set('');
    this.returnReasonError.set(false);
    this.returnSubmitError.set('');
    this.returnRequestOpen.set(true);
    this.loadReturnProducts();
    this.loadReturnTypes();
    this.loadReturnReasons();
  }

  // CHANGED: stays open while the request is being sent.
  protected closeReturnRequest(): void {
    if (this.submittingReturn()) return;
    this.returnRequestOpen.set(false);
    this.returnProductError.set(false);
    this.returnTypeError.set(false);
    this.refundMethodError.set(false);
    this.returnReasonError.set(false);
  }

  /** Which product of the order is returned (its IDs are the ones sent). */
  // CHANGED (new)
  protected setReturnProduct(value: string): void {
    this.returnProductKey.set(value);
    if (value) this.returnProductError.set(false);
    this.returnSubmitError.set('');
  }

  // CHANGED (new): a refund also asks for the refund method (loaded the first time); a replacement clears it.
  protected setReturnType(value: string): void {
    this.returnType.set(selectedId(value));
    if (this.returnType() !== null) this.returnTypeError.set(false);
    if (this.isRefund()) {
      this.loadRefundMethods();
    } else {
      this.refundMethod.set(null);
      this.refundMethodError.set(false);
    }
    this.returnSubmitError.set('');
  }

  // CHANGED (new)
  protected setRefundMethod(value: string): void {
    this.refundMethod.set(selectedId(value));
    if (this.refundMethod() !== null) this.refundMethodError.set(false);
    this.returnSubmitError.set('');
  }

  /**
   * The Product options: the order's products (OrderService.getReturnProducts, GET return_dropdown by ORDER_NUMBER),
   * read once per order. A failed load offers Try again.
   */
  // CHANGED (new)
  protected loadReturnProducts(): void {
    const orderNumber = this.orderNumber();
    const state = this.returnProductsState();
    if (!orderNumber || (state.orderNumber === orderNumber && (state.status === 'loading' || state.status === 'success'))) {
      return;
    }
    this.returnProductsState.set({ orderNumber, status: 'loading', products: [], error: '' });
    this.orders
      .getReturnProducts(orderNumber)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => this.returnProductsState.set({ orderNumber, status: 'success', products, error: '' }),
        error: (error: unknown) => {
          const message = lookupErrorMessage(error, 'The products of this order could not be loaded. Please try again.');
          this.returnProductsState.set({ orderNumber, status: 'error', products: [], error: message });
          this.toast.showError(message);
        },
      });
  }

  /** The Refund Method options (OrderService.getRefundMethods, the active ones), read once. Try again on a failure. */
  // CHANGED (new)
  protected loadRefundMethods(): void {
    const status = this.refundMethodsStatus();
    if (status === 'loading' || status === 'success') return;

    this.refundMethodsStatus.set('loading');
    this.refundMethodsError.set('');
    this.orders
      .getRefundMethods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (methods) => {
          this.refundMethods.set(methods);
          this.refundMethodsStatus.set('success');
        },
        error: (error: unknown) => {
          const message = lookupErrorMessage(error, 'Refund methods could not be loaded. Please try again.');
          this.refundMethodsError.set(message);
          this.refundMethodsStatus.set('error');
          this.toast.showError(message);
        },
      });
  }

  // CHANGED: takes the dropdown's value (SearchableSelect emits it); same ID rule.
  protected setReturnReason(value: string): void {
    this.returnReason.set(selectedId(value));
    if (this.returnReason() !== null) this.returnReasonError.set(false);
    this.returnSubmitError.set('');
  }

  /**
   * The Return Type options: the "RETURN/…" return statuses (OrderService.getReturnTypes, GET return_status), read
   * once. A failed load offers Try again.
   */
  // CHANGED: from return_status (it was the shipping-status list the tracking loads).
  protected loadReturnTypes(): void {
    const status = this.returnTypesStatus();
    if (status === 'loading' || status === 'success') return;

    this.returnTypesStatus.set('loading');
    this.returnTypesError.set('');
    this.orders
      .getReturnTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (types) => {
          this.returnTypes.set(types);
          this.returnTypesStatus.set('success');
        },
        error: (error: unknown) => {
          // As for the reasons: the API's own failure message, else a generic one (not raw HTTP details).
          const message =
            error instanceof Error && error.message ? error.message : 'Return types could not be loaded. Please try again.';
          this.returnTypesError.set(message);
          this.returnTypesStatus.set('error');
          this.toast.showError(message);
        },
      });
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
    this.returnDetails.set((event.target as HTMLTextAreaElement).value.slice(0, RETURN_DESCRIPTION_MAX_LENGTH));
  }

  /**
   * Submit: the Product, the Return Type and the reason are required, and the Refund Method for a refund. POST
   * return_request then sends `{ ORDER_NUMBER, ORDER_ID, REASON_ID, RETURN_DESCRIPTION, RETURN_OPTION, PRODUCT_ID,
   * VARIANT_ID, SELLER_ID, PICKUP_ADDRESS_ID, REFUND_METHOD }` for the chosen product only, one request at a time:
   * ORDER_ID, PRODUCT_ID and VARIANT_ID (PRODUCT_VARIANT_ID) are the chosen product's (return_dropdown); SELLER_ID and
   * PICKUP_ADDRESS_ID (DELIVERY_ADDRESS_ID) come from that product's own tracking row; RETURN_OPTION is the chosen
   * Return Type (RETURN_STATUS_ID), REASON_ID the chosen reason, and REFUND_METHOD the chosen REFUND_METHOD_ID (null
   * for a replacement). A product without a tracking row, seller or pickup address is not sent. On success the dialog
   * closes, a toast and the page confirm the request with the status the API gave it, that product is not offered
   * again, and the tracking details are read again (the order's status may have changed). On failure the dialog stays
   * open with the reason.
   */
  // CHANGED: sends the request (it only showed a notice).
  // CHANGED: the chosen return_dropdown product's ORDER_ID, PRODUCT_ID and VARIANT_ID, and REFUND_METHOD.
  protected submitReturnRequest(event: Event): void {
    event.preventDefault();
    if (this.submittingReturn()) return;
    const product = this.selectedReturn();
    const typeId = this.returnType();
    const reasonId = this.returnReason();
    const refund = this.isRefund();
    const refundMethodId = refund ? this.refundMethod() : null;
    this.returnProductError.set(product === null);
    this.returnTypeError.set(typeId === null);
    this.refundMethodError.set(refund && refundMethodId === null);
    this.returnReasonError.set(reasonId === null);
    const orderNumber = this.orderNumber();
    if (!product || typeId === null || (refund && refundMethodId === null) || reasonId === null || !orderNumber) return;
    const item = this.returnItem();
    if (!item || item.sellerId === undefined) {
      this.returnSubmitError.set('This product could not be identified, so it cannot be returned here. Please refresh the page and try again.');
      return;
    }
    // The product was delivered there, so it is picked up there.
    const pickupAddressId = item.deliveryAddressId;
    if (pickupAddressId === undefined) {
      this.returnSubmitError.set('The pickup address of this order could not be found, so it cannot be returned here.');
      return;
    }

    const typeLabel = shippingStatusLabel(this.returnTypes().find((type) => type.id === typeId)?.label ?? '');
    const reasonLabel = this.returnReasons().find((reason) => reason.REASON_ID === reasonId)?.REASON ?? '';
    const refundMethodLabel = this.refundMethods().find((method) => method.id === refundMethodId)?.label ?? '';
    this.submittingReturn.set(true);
    this.returnSubmitError.set('');
    this.orders
      .createReturnRequest({
        ORDER_NUMBER: this.shipment()?.orderId || orderNumber,
        ORDER_ID: product.orderId,
        REASON_ID: reasonId,
        RETURN_DESCRIPTION: this.returnDetails(),
        RETURN_OPTION: typeId,
        PRODUCT_ID: product.productId,
        VARIANT_ID: product.variantId,
        SELLER_ID: item.sellerId,
        PICKUP_ADDRESS_ID: pickupAddressId,
        REFUND_METHOD: refundMethodId,
      })
      .pipe(
        finalize(() => this.submittingReturn.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.requestedReturns.update((requested) => new Set(requested).add(`${orderNumber}|${productLineKey(product)}`));
          this.submittedReturn.set({ orderNumber, result, productName: product.name, typeLabel, reasonLabel, refundMethodLabel });
          this.toast.showSuccess(result.message);
          this.submittingReturn.set(false);
          this.closeReturnRequest();
          this.refreshTracking();
        },
        error: (error: unknown) => {
          const message = this.orders.returnRequestErrorMessage(error);
          this.returnSubmitError.set(message);
          this.toast.showError(message);
        },
      });
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
