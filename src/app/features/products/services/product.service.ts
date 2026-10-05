import { Injectable, inject } from '@angular/core';
import { ApiService } from '@core/services/api.service';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly api = inject(ApiService);

  // Catalog API calls (list, detail, search) will be added here.
}
