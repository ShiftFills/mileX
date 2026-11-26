import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductImageDisplayService, ProductImageSource } from '@core/services/product-image-display.service';
import { OrderSummary } from '@shared/models';
import { Badge, BadgeTone } from '../badge/badge';

const STATUS_TONES: Record<string, BadgeTone> = {
  DELIVERED: 'success',
  SHIPPED: 'purple',
  IN_TRANSIT: 'purple',
  ORDERED: 'warning',
  PROCESSING: 'warning',
  PENDING: 'warning',
  CANCELLED: 'danger',
  FAILED: 'danger',
};

/** An order STATUS as a lookup key: "In Transit" / "in-transit" / "IN_TRANSIT" -> "IN_TRANSIT". */
export function orderStatusKey(status: string): string {
  return status.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** Badge colour for an order STATUS; unknown statuses are neutral. */
export function orderStatusTone(status: string): BadgeTone {
  return STATUS_TONES[orderStatusKey(status)] ?? 'neutral';
}

/**
 * One order in an order-history list: summary, items and delivery status.
 * Size it with `--order-card-scale` (1 = admin density); it adapts to its own width.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Badge, CurrencyPipe, DatePipe, RouterLink],
  selector: 'app-order-card',
  styleUrl: './order-card.scss',
  templateUrl: './order-card.html',
  // CHANGED (new): item images from S3 (signed URLs). Cards on one page share the app-wide URL cache, so a key
  // used by several orders is requested once.
  providers: [ProductImageDisplayService],
})
export class OrderCard {
  readonly order = input.required<OrderSummary>();

  // CHANGED (new)
  protected readonly productImages = inject(ProductImageDisplayService);
  /** Each item with its image as ProductImageDisplayService reads it (S3 key, else the image URL). */
  protected readonly items = computed(() =>
    this.order().items.map((item) => ({
      item,
      image: { imageKey: item.imageKey, imageUrl: item.image } satisfies ProductImageSource,
    })),
  );

  constructor() {
    // CHANGED (new): loads the signed URLs of the items' S3 images (cached URLs make no request).
    effect(() => {
      const images = this.items().map((entry) => entry.image);
      untracked(() => this.productImages.show(images));
    });
  }

  protected readonly detailsLink = computed(() => [APP_ROUTES.orders, this.order().id]);
  protected readonly trackingLink = computed(() => [APP_ROUTES.orders, this.order().id, 'tracking']);
  protected readonly statusTone = computed(() => orderStatusTone(this.order().status));
  /** "Track Order": for every order but a cancelled or failed one (the statuses with the danger badge). */
  // CHANGED (new): the order STATUS does not follow the shipment yet, so the tracking page says when it has not shipped.
  protected readonly canTrack = computed(() => this.statusTone() !== 'danger');
  protected readonly itemCount = computed(() =>
    this.order().items.reduce((count, item) => count + item.quantity, 0),
  );
}
