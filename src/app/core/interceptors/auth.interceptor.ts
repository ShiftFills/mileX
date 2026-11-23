import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { API_BASE_URL, S3_API_BASE_URL } from '../config/api.config';
import { AuthService } from '../services/auth.service';

/**
 * Attaches the bearer token to requests that go to our own API, except login, the token refresh
 * (which is authenticated by the refresh-token cookie, not by the expired access token) and the S3 file API.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token();
  const baseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const loginUrl = `${baseUrl}/${API_ENDPOINTS.user.login}`;
  // CHANGED (new): the refresh request gets no Authorization header.
  const refreshUrl = `${baseUrl}/${API_ENDPOINTS.user.refresh}`;
  const isApiCall = req.url === baseUrl || req.url.startsWith(`${baseUrl}/`);
  // CHANGED (new): S3 requests (s3/upload, s3/images/...) stay without the token now that the S3 API base can be
  // the main API base (both are "/api" in development).
  const s3BaseUrl = inject(S3_API_BASE_URL).replace(/\/+$/, '');
  const isS3Call = [API_ENDPOINTS.s3Images.upload, API_ENDPOINTS.s3Images.image]
    .map((path) => `${s3BaseUrl}/${path}`)
    .some((url) => req.url === url || req.url.startsWith(`${url}/`));

  return token && isApiCall && !isS3Call && req.url !== loginUrl && req.url !== refreshUrl
    ? next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
    : next(req);
};
