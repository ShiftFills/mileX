import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { APP_ROUTES } from '../constants/app-routes';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';

/** Central place for cross-cutting HTTP error handling. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/${API_ENDPOINTS.user.login}`;

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && req.url !== loginUrl) {
        auth.clearSession();
        router.navigate([APP_ROUTES.login]);
      }
      return throwError(() => error);
    }),
  );
};
