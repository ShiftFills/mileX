import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { APP_ROUTES } from '../constants/app-routes';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';

/**
 * Areas whose pages only make sense for a signed-in user. A 401 while the user is on one of
 * these sends them to Login; a 401 on a public page (Home, products, cart...) never does.
 */
// CHANGED (new): list of areas that require login; used below to decide whether a 401 should redirect to Login.
const PROTECTED_AREAS = ['/admin', '/seller', '/account', '/checkout', '/orders', '/refund'];

function isProtectedUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return PROTECTED_AREAS.some((area) => path === area || path.startsWith(`${area}/`));
}

/** Central place for cross-cutting HTTP error handling. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/${API_ENDPOINTS.user.login}`;

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // CHANGED: this used to clear the session and redirect to Login on EVERY 401 (which sent visitors from Home to Login).
      // Now an invalid session is still cleared, but only protected areas redirect to Login (with returnUrl).
      if (error.status === 401 && req.url !== loginUrl) {
        const currentUrl = router.url;

        // An expired or invalid session is always dropped, so the UI shows the signed-out state.
        if (auth.isAuthenticated()) auth.clearSession();

        // Only protected pages are redirected to Login (and the user returns to them afterwards).
        // Public pages such as Home stay where they are; the failed request just surfaces its
        // own error state instead of throwing the visitor to the Login screen.
        if (isProtectedUrl(currentUrl)) {
          void router.navigate([APP_ROUTES.login], { queryParams: { returnUrl: currentUrl } });
        }
      }
      return throwError(() => error);
    }),
  );
};