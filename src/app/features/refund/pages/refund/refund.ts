import { CurrencyPipe, DOCUMENT, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, defer, switchMap, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { OrderService } from '@features/orders/services/order.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper, StepperStep } from '@shared/components/stepper/stepper';
import { RefundDetail } from '@shared/models';
import {
  REFUND_CREDITED_STAGE,
  RefundService,
  refundKey,
  refundStage,
  refundStatusLabel,
  refundTone,
} from '../../services/refund.service';

const WALLET_ICON =
  'M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2ZM16 13.5h.01';

/** Lifecycle shown on the refund page; refundStage indexes into this list. */
const REFUND_STEPS: readonly StepperStep[] = [
  { label: 'Return Requested', caption: 'Initiated by buyer' },
  { label: 'Item Received', caption: 'Inspected at hub' },
  { label: 'Refund Approved', caption: 'Verified by merchant' },
  { label: 'Refund Processed', caption: 'Gateway transfer' },
  { label: 'Amount Credited', caption: 'Refund to account', icon: WALLET_ICON },
];
const SIGN_IN_MESSAGE = 'Sign in with a customer account to view this refund.';
// CHANGED (new)
const STATEMENT_ERROR = 'The refund statement could not be created. Please try again.';

// CHANGED (new): the states of the refund API request ('missing': the route names no order line to ask for).
type RefundPageStatus = 'loading' | 'success' | 'missing' | 'error';

/** One refund as the page shows it. */
// CHANGED (new)
interface RefundView {
  key: string;
  refund: RefundDetail;
  /** The product's name, or "Product #<PRODUCT_ID>" when the API sends none. */
  productLabel: string;
  /** The REFUND_STEPS index, or null for a refund that ended without one (rejected, failed, cancelled). */
  stage: number | null;
  /** REFUND_STATUS and RETURN_STATUS_NAME for display ('' when not sent). */
  statusLabel: string;
  returnStatusLabel: string;
  tone: BadgeTone;
}

/** The route's ORDER_ID as a positive whole number, or null. */
function routeOrderId(value: string | undefined): number | null {
  const id = value?.trim() ?? '';
  return /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0 ? Number(id) : null;
}

function refundView(refund: RefundDetail): RefundView {
  return {
    key: refundKey(refund),
    refund,
    productLabel: refund.productName ?? (refund.productId !== null ? `Product #${refund.productId}` : 'Product'),
    stage: refundStage(refund),
    statusLabel: refundStatusLabel(refund.status),
    returnStatusLabel: refundStatusLabel(refund.returnStatusName),
    // CHANGED: RefundService's rule (shared with the statement).
    tone: refundTone(refund),
  };
}

/**
 * Refund (`/refund/:orderNumber/:orderId`): the refunds of one product of the signed-in customer's order, from GET
 * refund by the ORDER_NUMBER and that product's ORDER_ID (OrderService's order line, as Order Details links to it).
 * Only refunds of that order line are shown, one block per refund (return request), each with its return number,
 * product, variant, amount, method, reference, date and status.
 */
// CHANGED: reads the refund API by order number and order line (it showed a demo refund by return number).
@Component({
  selector: 'app-refund',
  imports: [Alert, Badge, Button, Card, CurrencyPipe, DatePipe, LoadingSpinner, PageHeading, RouterLink, Stepper],
  templateUrl: './refund.html',
  styleUrl: './refund.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Refund {
  /** Route params: the ORDER_NUMBER and the returned product's ORDER_ID (its order line). */
  // CHANGED: they replace `id` (a return number).
  readonly orderNumber = input<string>();
  readonly orderId = input<string>();

  private readonly refunds = inject(RefundService);
  private readonly orders = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly routes = APP_ROUTES;
  protected readonly steps = REFUND_STEPS;
  protected readonly creditedStage = REFUND_CREDITED_STAGE;
  /** True while the PDF statement is being made (its button shows a spinner). */
  // CHANGED (new)
  protected readonly downloading = signal(false);
  /** The reference last copied ('' when none, or after 2 s). */
  // CHANGED: by reference, as the page may show several refunds (it was one flag).
  protected readonly copied = signal('');

  // ---- CHANGED (new): the refund API request ----

  protected readonly status = signal<RefundPageStatus>('loading');
  protected readonly error = signal('');
  /** False when trying again cannot help (no customer session). */
  protected readonly canRetry = signal(true);
  private readonly retry = signal(0);
  private readonly loaded = signal<readonly RefundDetail[]>([]);
  protected readonly views = computed(() => this.loaded().map(refundView));

  /** The order line the route names, or null when it names none (or an invalid ORDER_ID). */
  private readonly target = computed(() => {
    const orderNumber = this.orderNumber()?.trim() ?? '';
    const orderId = routeOrderId(this.orderId());
    return orderNumber && orderId !== null ? { orderNumber, orderId } : null;
  });
  protected readonly orderNo = computed(() => this.target()?.orderNumber ?? '');
  protected readonly subtitle = computed(() => {
    const orderNumber = this.orderNo();
    if (!orderNumber) return 'Refund details of your returned products';
    const product = this.status() === 'success' ? this.views()[0]?.productLabel : undefined;
    return product ? `Order #${orderNumber} · ${product}` : `Order #${orderNumber}`;
  });

  constructor() {
    // Loads again for another order line (same component instance) and on "Try again".
    toObservable(computed(() => ({ target: this.target(), retry: this.retry() })))
      .pipe(
        switchMap(({ target }) => this.load(target)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected retryLoad(): void {
    if (this.status() !== 'loading') this.retry.update((count) => count + 1);
  }

  private load(target: { orderNumber: string; orderId: number } | null): Observable<unknown> {
    this.loaded.set([]);
    this.error.set('');
    if (!target) {
      this.status.set('missing');
      return EMPTY;
    }
    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      this.fail(SIGN_IN_MESSAGE, false);
      return EMPTY;
    }

    this.status.set('loading');
    return defer(() => this.refunds.getRefunds(target.orderNumber, target.orderId, customerId)).pipe(
      tap((refunds) => {
        this.loaded.set(refunds);
        this.status.set('success');
      }),
      catchError((error: unknown) => {
        this.fail(this.orders.customerOrdersErrorMessage(error, 'Refund details'), true);
        return EMPTY;
      }),
    );
  }

  private fail(message: string, canRetry: boolean): void {
    this.error.set(message);
    this.canRetry.set(canRetry);
    this.status.set('error');
    this.toast.showError(message);
  }

  protected async copyReference(reference: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      return; // Clipboard blocked (insecure context / permissions): leave the text selectable.
    }
    this.copied.set(reference);
    const timer = setTimeout(() => this.copied.update((copied) => (copied === reference ? '' : copied)), 2000);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  /**
   * "Download Refund Statement": saves one PDF with every refund shown (each return request of this product), made in
   * the browser by RefundService.statementPdf. A failure (e.g. the PDF library could not be loaded) is a toast.
   */
  // CHANGED: a PDF of every refund on the page (it was a .txt file of one refund).
  protected async downloadStatement(): Promise<void> {
    const refunds = this.loaded();
    if (!refunds.length || this.downloading()) return;
    this.downloading.set(true);
    try {
      const pdf = await this.refunds.statementPdf(refunds);
      const url = URL.createObjectURL(pdf);
      const link = this.document.createElement('a');
      link.href = url;
      link.download = this.refunds.statementFileName(refunds);
      link.rel = 'noopener';
      this.document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoked once the browser has started the download (revoking at once can cancel it in some browsers).
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.toast.showError(STATEMENT_ERROR);
    } finally {
      this.downloading.set(false);
    }
  }

  protected contactSupport(): void {
    void this.router.navigate([this.routes.support]);
  }
}
