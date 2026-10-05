import { InjectionToken } from '@angular/core';
import { environment } from '@env/environment';

/** Base URL of the backend API. Override per-environment or in tests via DI. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});
