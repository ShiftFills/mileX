import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ProductCatalogService, ProductDetails } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Alert } from '@shared/components/alert/alert';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { OrderCard } from '@shared/components/order-card/order-card';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { CustomerOrdersPage, OrderSummary } from '@shared/models';
import { Observable, Subscription, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { OrderService } from '../../services/order.service';

const PAGE_SIZE = 10;

type OrderListStatus = 'idle' | 'loading' | 'success' | 'error';

function productImageUrl(path: string | null | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  if (/^(?:https?:|blob:|data:)/i.test(path)) return path;
  return `/${path.replace(/^\/+/, '')}`;
}

@Component({
  selector: 'app-order-list',
  imports: [Alert, LoadingSpinner, OrderCard, PageHeading, Pagination, RouterLink],
  templateUrl: './order-list.html',
  styleUrl: './order-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderList {
  protected readonly routes = APP_ROUTES;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly page = signal(1);
  protected readonly totalRecords = signal(0);
  private readonly _orders = signal<readonly OrderSummary[]>([]);
  protected readonly orders = this._orders.asReadonly();
  protected readonly status = signal<OrderListStatus>('idle');
  protected readonly error = signal('');

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRecords() / this.pageSize)),
  );
  private readonly auth = inject(AuthService);
  private readonly orderService = inject(OrderService);
  private readonly products = inject(ProductCatalogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly productDetails = new Map<number, ProductDetails | null>();
  private request?: Subscription;

  constructor() {
    if (this.auth.customerId() === undefined) {
      const message = 'Sign in with a customer account to view your orders.';
      this.error.set(message);
      this.status.set('error');
      this.toast.showError(message);
      return;
    }

    this.loadOrders();
  }

  protected changePage(page: number): void {
    if (this.status() === 'loading' || page === this.page()) return;
    this.page.set(page);
    this.loadOrders();
  }

  protected retryLoad(): void {
    if (this.status() !== 'loading') this.loadOrders();
  }

  private loadOrders(): void {
    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      const message = 'Sign in with a customer account to view your orders.';
      this.error.set(message);
      this.status.set('error');
      this.toast.showError(message);
      return;
    }

    this.request?.unsubscribe();
    this.status.set('loading');
    this.error.set('');
    const offset = (this.page() - 1) * this.pageSize;
    this.request = this.orderService
      .getCustomerOrders(customerId, this.pageSize, offset)
      .pipe(
        switchMap((result) => this.loadProductDetails(result)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this._orders.set(result.orders);
          this.totalRecords.set(result.totalRecords);
          this.status.set('success');
        },
        error: (error: unknown) => {
          const message = this.errorMessage(error);
          this.error.set(message);
          this.status.set('error');
          this.toast.showError(message);
        },
      });
  }

  private loadProductDetails(page: CustomerOrdersPage): Observable<CustomerOrdersPage> {
    const productIds = [
      ...new Set(
        page.orders.flatMap((order) =>
          order.items.flatMap((item) => item.productId === undefined ? [] : [item.productId]),
        ),
      ),
    ];
    const missingIds = productIds.filter((id) => !this.productDetails.has(id));
    if (!missingIds.length) return of(this.attachProductDetails(page));

    const failedIds = new Set<number>();
    return forkJoin(
      missingIds.map((id) =>
        this.products.loadProductById(id).pipe(
          catchError(() => {
            failedIds.add(id);
            return of(null);
          }),
        ),
      ),
    ).pipe(
      map((details) => {
        details.forEach((detail, index) => this.productDetails.set(missingIds[index], detail));
        if (failedIds.size) {
          this.toast.showError('Some product details could not be loaded. Order totals are still available.');
        }
        return this.attachProductDetails(page);
      }),
    );
  }

  private attachProductDetails(page: CustomerOrdersPage): CustomerOrdersPage {
    return {
      ...page,
      orders: page.orders.map((order) => ({
        ...order,
        items: order.items.map((item) => {
          const details =
            item.productId === undefined ? null : this.productDetails.get(item.productId);
          return {
            ...item,
            ...(details?.PRODUCT_NAME.trim() ? { name: details.PRODUCT_NAME.trim() } : {}),
            ...(productImageUrl(details?.PRODUCT_IMAGE)
              ? { image: productImageUrl(details?.PRODUCT_IMAGE) }
              : {}),
          };
        }),
      })),
    };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'string' && body.trim()) return body.trim();
      if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
        const record = body as Record<string, unknown>;
        const message = record['message'] ?? record['MESSAGE'];
        if (typeof message === 'string' && message.trim()) return message.trim();
      }
      return error.status
        ? `Orders could not be loaded (HTTP ${error.status}).`
        : 'Orders could not be loaded. Check your connection and try again.';
    }
    return error instanceof Error && error.message
      ? error.message
      : 'Orders could not be loaded. Please try again.';
  }
}
