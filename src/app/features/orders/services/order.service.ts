import { Injectable, inject } from '@angular/core';
import { ApiService } from '@core/services/api.service';
import { OrderSummary } from '@shared/models';
import { ORDER_SUMMARIES } from '../data/order-summaries';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiService);

  /** Order history for the signed-in user (demo data until the API is wired). */
  readonly orders: readonly OrderSummary[] = ORDER_SUMMARIES;

  // Order detail / placement API calls will be added here.
}
