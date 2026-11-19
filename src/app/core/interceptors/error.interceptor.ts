import { HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, of, switchMap, throwError } from 'rxjs';
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

/** The access token a request was sent with (added by the auth interceptor), if any. */
function sentAccessToken(req: HttpRequest<unknown>): string | undefined {
  return req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
}

/**
 * A refresh that failed because the backend could not be reached or failed itself (not because the
 * refresh session is invalid). The session is kept, so a later request can refresh again.
 */
function isTemporaryFailure(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}

/** Central place for cross-cutting HTTP error handling. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/${API_ENDPOINTS.user.login}`;
  const refreshUrl = `${baseUrl}/${API_ENDPOINTS.user.refresh}`;

  // CHANGED: this used to clear the session and redirect to Login on EVERY 401 (which sent visitors from Home to Login).
  // Now an invalid session is still cleared, but only protected areas redirect to Login (with returnUrl).
  // CHANGED: moved into a function; it now runs only once the session cannot be recovered by a token refresh.
  const endSession = (): void => {
    const currentUrl = router.url;

    // An expired or invalid session is always dropped, so the UI shows the signed-out state.
    if (auth.isAuthenticated()) auth.clearSession();

    // Only protected pages are redirected to Login (and the user returns to them afterwards).
    // Public pages such as Home stay where they are; the failed request just surfaces its
    // own error state instead of throwing the visitor to the Login screen.
    if (isProtectedUrl(currentUrl)) {
      void router.navigate([APP_ROUTES.login], { queryParams: { returnUrl: currentUrl } });
    }
  };

  /**
   * A signed-in request was rejected with 401 (normally an expired access token): get a new token and
   * send the request once more with it. Requests that fail together share one refresh. A request that
   * was sent with an older token than the current one (another request already refreshed it) is just
   * sent again with the current token.
   */
  // CHANGED (new): automatic access-token refresh.
  const refreshAndRetry = (error: HttpErrorResponse, sentToken: string): Observable<HttpEvent<unknown>> => {
    const currentToken = auth.token();
    const token$ = currentToken && currentToken !== sentToken ? of(currentToken) : auth.refreshAccessToken();

    return token$.pipe(
      catchError((refreshError: unknown) => {
        // Backend unreachable or failing: keep the session; this request fails with its own 401.
        // Otherwise (refresh 401, invalid response, another user) the refresh session is over.
        if (!isTemporaryFailure(refreshError)) endSession();
        return throwError(() => error);
      }),
      // The retry goes straight to the backend (it does not pass through this interceptor again),
      // so a request is retried at most once and a refresh can never loop.
      switchMap((token) =>
        next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
          catchError((retryError: unknown) => {
            // Still rejected with a brand-new token: the session is not valid.
            if (retryError instanceof HttpErrorResponse && retryError.status === 401) endSession();
            return throwError(() => retryError);
          }),
        ),
      ),
    );
  };

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // The refresh request reports its own failure to the request that started it (above).
      if (error.status !== 401 || req.url === loginUrl || req.url === refreshUrl) {
        return throwError(() => error);
      }

      const sentToken = sentAccessToken(req);
      if (sentToken && auth.isAuthenticated()) return refreshAndRetry(error, sentToken);

      endSession();
      return throwError(() => error);
    }),
  );
};
