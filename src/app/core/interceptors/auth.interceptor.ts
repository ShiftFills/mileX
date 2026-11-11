import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { API_BASE_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';

/** Attaches the bearer token to requests that go to our own API, except login. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/${API_ENDPOINTS.user.login}`;
  const isApiCall = req.url === baseUrl || req.url.startsWith(`${baseUrl}/`);

  return token && isApiCall && req.url !== loginUrl
    ? next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
    : next(req);
};
