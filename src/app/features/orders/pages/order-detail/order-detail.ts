import { CurrencyPipe, DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { EMPTY, Observable, catchError, defer, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { PaymentMethodService } from '@core/services/payment-method.service';
import { ProductCatalogService, ProductDetails } from '@core/services/product-catalog.service';
import { ProductImageDisplayService, ProductImageSource } from '@core/services/product-image-display.service';
import { isS3ImageKey } from '@core/services/s3-image.service';
import { ToastService } from '@core/services/toast.service';
import { ProductVariant, ProductVariantService } from '@features/admin/services/product-variant.service';
import {
  variantImageSource,
  variantOptionsLabel,
  variantText,
} from '@features/products/components/product-variant-selector/product-variant-selector';
import { Alert } from '@shared/components/alert/alert';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Card } from '@shared/components/card/card';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { orderStatusKey, orderStatusTone } from '@shared/components/order-card/order-card';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper, StepperStep } from '@shared/components/stepper/stepper';
import { CustomerOrderDetail, CustomerOrderLine } from '@shared/models';
import { productImageUrl } from '@shared/utils/product-image-url';
import { OrderService } from '../../services/order.service';

type OrderDetailStatus = 'loading' | 'success' | 'not-found' | 'error';

/** One ordered product as the page shows it. */
interface OrderDetailItem {
  lineId: number;
  productId: number;
  /** PRODUCT_NAME, or null when the product lookup failed or found no product. */
  name: string | null;
  /** CHANGED: the image as ProductImageDisplayService reads it (S3 key or legacy URL); {} when there is none. */
  image: ProductImageSource;
  /** Variant options ("Black / M"), or '' when the line has no variant or it could not be loaded. */
  variant: string;
  quantity: number;
  /** The line's SUBTOTAL, or null when the API sent none. */
  amount: number | null;
  statusLabel: string;
  statusTone: BadgeTone;
}

interface LoadedOrder {
  detail: CustomerOrderDetail;
  items: OrderDetailItem[];
}

const SIGN_IN_MESSAGE = 'Sign in with a customer account to view this order.';
const PRODUCTS_INCOMPLETE = 'Some product details could not be loaded. Order totals are still available.';

/** Delivery stages in the progress tracker. */
const PROGRESS_STEPS: readonly StepperStep[] = [
  { label: 'Ordered' },
  { label: 'Processing' },
  { label: 'Shipped' },
  { label: 'Delivered' },
];

/**
 * Stage reached for each open STATUS (see orderStatusKey); DELIVERED marks every stage done.
 * Uses the same status vocabulary as the My Orders card. Other statuses show no tracker.
 */
const STATUS_STAGE: Readonly<Record<string, number>> = {
  PENDING: 0,
  ORDERED: 0,
  PROCESSING: 1,
  SHIPPED: 2,
  IN_TRANSIT: 2,
  DELIVERED: PROGRESS_STEPS.length,
};

/** Statuses that end an order before delivery, with the note shown instead of the tracker. */
const CLOSED_STATUS_NOTES: Readonly<Record<string, string>> = {
  CANCELLED: 'This order was cancelled.',
  FAILED: 'This order could not be completed.',
};

/** "IN_TRANSIT" -> "In Transit". */
function statusLabel(status: string): string {
  return status
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** CHANGED (new): the variant's own image when it has one, else the product's (S3 key or legacy URL). */
function productImageSource(variant: ProductVariant | undefined, product: ProductDetails | null): ProductImageSource {
  if (variant) {
    const source = variantImageSource(variant);
    if (source.imageKey || source.imageUrl) return source;
  }
  const productImage = product?.PRODUCT_IMAGE?.trim() ?? '';
  if (isS3ImageKey(productImage)) return { imageKey: productImage };
  const url = productImageUrl(productImage);
  return url ? { imageUrl: url } : {};
}

function orderItem(
  line: CustomerOrderLine,
  product: ProductDetails | null,
  variants: readonly ProductVariant[],
): OrderDetailItem {
  const variant =
    line.productVariantId === null
      ? undefined
      : variants.find((candidate) => candidate.id.trim() === String(line.productVariantId));
  return {
    lineId: line.orderId,
    productId: line.productId,
    name: product?.PRODUCT_NAME.trim() || null,
    // The variant's own image shows the colour/style that was ordered; else the product image.
    // CHANGED: S3 keys (VARIANT_IMAGE / PRODUCT_IMAGE) are kept as keys and shown as signed URLs; before, an S3
    // PRODUCT_IMAGE became the broken relative URL "/products/<file>".
    image: productImageSource(variant, product),
    variant: variant ? variantOptionsLabel(variant) || variantText(variant.name) : '',
    quantity: line.quantity,
    amount: line.subtotal,
    statusLabel: statusLabel(line.status),
    statusTone: orderStatusTone(line.status),
  };
}

/** Sum of one amount over every line, or null when any line is missing it. */
function sumLines(lines: readonly CustomerOrderLine[], pick: (line: CustomerOrderLine) => number | null): number | null {
  let total = 0;
  for (const line of lines) {
    const value = pick(line);
    if (value === null) return null;
    total += value;
  }
  return total;
}

/**
 * Order Details (`/orders/:id`, where :id is the ORDER_NUMBER). Opened from "View Details" and the
 * arrow on a My Orders card. Shows only what the APIs return: the order rows from customer_orders/get,
 * product names/images from products/get, variant options from product_variant/get and the payment
 * method name from payment_method/get.
 */
@Component({
  selector: 'app-order-detail',
  imports: [Alert, Badge, Card, CurrencyPipe, DatePipe, LoadingSpinner, PageHeading, RouterLink, Stepper],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // CHANGED (new): each item shows its own image (signed S3 URL).
  providers: [ProductImageDisplayService],
})
export class OrderDetail {
  // CHANGED (new)
  protected readonly productImages = inject(ProductImageDisplayService);
  /** Route param: the ORDER_NUMBER the My Orders card links to. */
  readonly id = input.required<string>();

  protected readonly routes = APP_ROUTES;
  protected readonly status = signal<OrderDetailStatus>('loading');
  protected readonly error = signal('');
  /** False when trying again cannot help (no customer session). */
  protected readonly canRetry = signal(true);

  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);
  private readonly products = inject(ProductCatalogService);
  private readonly variants = inject(ProductVariantService);
  private readonly paymentMethods = inject(PaymentMethodService);
  private readonly toast = inject(ToastService);
  private readonly locale = inject(LOCALE_ID);
  private readonly loaded = signal<LoadedOrder | null>(null);
  private readonly retry = signal(0);

  private readonly lines = computed(() => this.loaded()?.detail.lines ?? []);
  protected readonly items = computed(() => this.loaded()?.items ?? []);
  protected readonly orderNumber = computed(() => this.loaded()?.detail.orderNumber ?? this.id().trim());
  /** Earliest ORDER_DATE of the order's rows. */
  protected readonly placedOn = computed(() =>
    this.lines().reduce<string>(
      (earliest, line) => (!earliest || Date.parse(line.orderDate) < Date.parse(earliest) ? line.orderDate : earliest),
      '',
    ),
  );
  protected readonly itemCount = computed(() => this.lines().reduce((count, line) => count + line.quantity, 0));

  /** The order's STATUS when every row shares it; null when its items have different statuses. */
  private readonly orderStatus = computed(() => {
    const statuses = new Set(this.lines().map((line) => line.status));
    return statuses.size === 1 ? [...statuses][0] : null;
  });
  protected readonly mixedStatus = computed(() => this.lines().length > 0 && this.orderStatus() === null);
  protected readonly statusLabel = computed(() => {
    const status = this.orderStatus();
    return status === null ? 'Multiple statuses' : statusLabel(status);
  });
  protected readonly statusTone = computed<BadgeTone>(() => {
    const status = this.orderStatus();
    return status === null ? 'neutral' : orderStatusTone(status);
  });
  /** Tracker stage for an open order, or undefined when the status has no stage. */
  protected readonly stage = computed(() => {
    const status = this.orderStatus();
    return status === null ? undefined : STATUS_STAGE[orderStatusKey(status)];
  });
  protected readonly closedNote = computed(() => {
    const status = this.orderStatus();
    return status === null ? undefined : CLOSED_STATUS_NOTES[orderStatusKey(status)];
  });
  protected readonly progressSteps = computed<StepperStep[]>(() => {
    const placedOn = this.placedOn();
    return PROGRESS_STEPS.map((step, index) =>
      index === 0 && placedOn ? { ...step, caption: formatDate(placedOn, 'd MMM y', this.locale) } : step,
    );
  });

  protected readonly pricing = computed(() => {
    const lines = this.lines();
    return {
      subtotal: sumLines(lines, (line) => line.subtotal),
      discount: sumLines(lines, (line) => line.discount),
      tax: sumLines(lines, (line) => line.tax),
      shipping: sumLines(lines, (line) => line.shippingCharges),
      total: lines.reduce((sum, line) => sum + line.total, 0),
    };
  });

  private readonly paymentMethodId = computed(
    () => this.lines().find((line) => line.paymentMethodId !== null)?.paymentMethodId ?? null,
  );
  protected readonly paymentMethodName = computed(() => {
    const id = this.paymentMethodId();
    return id === null
      ? null
      : (this.paymentMethods.methods().find((method) => method.PAYMENT_METHOD_ID === id)?.PAYMENT_METHOD_NAME ?? null);
  });
  protected readonly paymentMethodLoading = computed(
    () => this.paymentMethodId() !== null && this.paymentMethods.status() === 'loading',
  );

  constructor() {
    // Loads again for another order number (same component instance) and on "Try again".
    toObservable(computed(() => ({ orderNumber: this.id(), retry: this.retry() })))
      .pipe(
        switchMap(({ orderNumber }) => this.load(orderNumber)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected retryLoad(): void {
    if (this.status() !== 'loading') this.retry.update((count) => count + 1);
  }

  private load(orderNumber: string): Observable<unknown> {
    this.loaded.set(null);
    this.error.set('');

    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      this.fail(SIGN_IN_MESSAGE, false);
      return EMPTY;
    }
    if (!orderNumber.trim()) {
      this.status.set('not-found');
      return EMPTY;
    }

    this.status.set('loading');
    return defer(() => this.orders.getCustomerOrderDetail(customerId, orderNumber)).pipe(
      switchMap((detail) => (detail ? this.withProductDetails(detail) : of(null))),
      tap((order) => {
        this.loaded.set(order);
        // CHANGED (new): loads the signed URLs of the items' S3 images (cached URLs make no request).
        if (order) this.productImages.show(order.items.map((item) => item.image));
        this.status.set(order ? 'success' : 'not-found');
        if (order && this.paymentMethodId() !== null && this.paymentMethods.status() !== 'success') {
          this.paymentMethods.load();
        }
      }),
      catchError((error: unknown) => {
        this.fail(this.orders.customerOrdersErrorMessage(error, 'Order details'), true);
        return EMPTY;
      }),
    );
  }

  /**
   * Adds product names/images and variant options. A failed lookup never fails the page: that item
   * keeps its product ID, quantity and amount, and one toast says some details are missing.
   */
  private withProductDetails(detail: CustomerOrderDetail): Observable<LoadedOrder> {
    const productIds = [...new Set(detail.lines.map((line) => line.productId))];
    const variantProductIds = [
      ...new Set(detail.lines.filter((line) => line.productVariantId !== null).map((line) => line.productId)),
    ];
    let incomplete = false;
    const products$ = forkJoin(
      productIds.map((id) =>
        this.products.loadProductById(id).pipe(
          catchError(() => {
            incomplete = true;
            return of(null);
          }),
        ),
      ),
    );
    const variants$ = variantProductIds.length
      ? forkJoin(
          variantProductIds.map((id) =>
            this.variants.loadProductVariants(id).pipe(
              catchError(() => {
                incomplete = true;
                return of<ProductVariant[]>([]);
              }),
            ),
          ),
        )
      : of<ProductVariant[][]>([]);

    return forkJoin([products$, variants$]).pipe(
      map(([products, variantLists]) => {
        if (incomplete) this.toast.showError(PRODUCTS_INCOMPLETE);
        const productById = new Map(productIds.map((id, index) => [id, products[index]]));
        const variantsByProduct = new Map(variantProductIds.map((id, index) => [id, variantLists[index]]));
        return {
          detail,
          items: detail.lines.map((line) =>
            orderItem(line, productById.get(line.productId) ?? null, variantsByProduct.get(line.productId) ?? []),
          ),
        };
      }),
    );
  }

  private fail(message: string, canRetry: boolean): void {
    this.error.set(message);
    this.canRetry.set(canRetry);
    this.status.set('error');
    this.toast.showError(message);
  }
}
