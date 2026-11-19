import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the bearer token to requests that go to our own API, except login and the token refresh
 * (which is authenticated by the refresh-token cookie, not by the expired access token).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/${API_ENDPOINTS.user.login}`;
  // CHANGED (new): the refresh request gets no Authorization header.
  const refreshUrl = `${baseUrl}/${API_ENDPOINTS.user.refresh}`;
  const isApiCall = req.url === baseUrl || req.url.startsWith(`${baseUrl}/`);

  return token && isApiCall && req.url !== loginUrl && req.url !== refreshUrl
    ? next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
    : next(req);
};
