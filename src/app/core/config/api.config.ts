import { InjectionToken } from '@angular/core';
import { environment } from '@env/environment';

/** Base URL of the backend API. Override per-environment or in tests via DI. */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.apiUrl,
});

/**
 * Base URL of the AWS S3 file API (`s3/upload`, `s3/images/...`), used only by S3ImageService. Every other API keeps
 * API_BASE_URL. In development both are "/api" and the dev-server proxy sends "/api/s3/**" to the S3 server.
 * S3 requests get no Authorization header (the S3 API needs none, and the access token is not sent to another
 * server; see authInterceptor).
 */
// CHANGED (new)
export const S3_API_BASE_URL = new InjectionToken<string>('S3_API_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.s3ApiUrl,
});
