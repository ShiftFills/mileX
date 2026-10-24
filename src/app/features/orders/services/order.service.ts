import { Injectable, inject } from '@angular/core';
import { ApiService } from '@core/services/api.service';
import { OrderSummary, ShipmentTracking } from '@shared/models';
import { DEMO_SHIPMENT, DEMO_TRACKING_ORDER_ID } from '../data/shipment-tracking';
import { ORDER_SUMMARIES } from '../data/order-summaries';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiService);

  /** Order history for the signed-in user (demo data until the API is wired). */
  readonly orders: readonly OrderSummary[] = ORDER_SUMMARIES;

  /** Shipment tracking for an order, or undefined when the order is unknown (demo data until the API is wired). */
  findTracking(orderId: string): ShipmentTracking | undefined {
    const known = orderId === DEMO_TRACKING_ORDER_ID || this.orders.some((order) => order.id === orderId);
    return known ? { ...DEMO_SHIPMENT, orderId } : undefined;
  }

  // Order detail / placement API calls will be added here.
}
