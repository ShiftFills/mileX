import { Injectable, inject } from '@angular/core';
import { ApiService } from '@core/services/api.service';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly api = inject(ApiService);

  // Order history / detail / placement API calls will be added here.
}
