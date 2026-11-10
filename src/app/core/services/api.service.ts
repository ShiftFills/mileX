import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { StatusOption } from '../../shared/models/api.model';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { API_BASE_URL } from '../config/api.config';

type QueryParams = Record<string, string | number | boolean>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSuccessfulEnvelope(response: Record<string, unknown>): void {
  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  const failedStatus =
    status !== undefined &&
    status !== true &&
    !(
      typeof status === 'string' &&
      ['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase())
    );
  if (failedStatus || response['success'] === false || response['SUCCESS'] === false) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Statuses could not be loaded.',
    );
  }
}

function mapStatusOptions(response: unknown): StatusOption[] {
  if (!isRecord(response)) {
    throw new Error('The status API returned an invalid response.');
  }

  assertSuccessfulEnvelope(response);
  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error('The status API returned an invalid response.');
  }

  const seen = new Set<number>();
  const options: StatusOption[] = [];

  for (const item of data) {
    if (!isRecord(item)) continue;

    const rawId = item['STATUS_ID'];
    const rawLabel = item['STATUS_NAME'];
    const id =
      typeof rawId === 'number' || (typeof rawId === 'string' && rawId.trim())
        ? Number(rawId)
        : NaN;
    const label =
      typeof rawLabel === 'string' || typeof rawLabel === 'number'
        ? String(rawLabel).trim()
        : '';

    if (!Number.isSafeInteger(id) || id <= 0 || !label || seen.has(id)) continue;

    seen.add(id);
    options.push({ id, label });
  }

  return options;
}

/** Feature services talk to the backend through this, never through HttpClient directly. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private statusOptionsRequest?: Observable<StatusOption[]>;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params: new HttpParams({ fromObject: params }) });
  }

  getStatuses(): Observable<StatusOption[]> {
    if (!this.statusOptionsRequest) {
      this.statusOptionsRequest = this.get<unknown>(API_ENDPOINTS.status.get).pipe(
        map(mapStatusOptions),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.statusOptionsRequest;
  }

  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body);
  }

  postText(path: string, body: unknown): Observable<string> {
    return this.http.post(this.url(path), body, {
      responseType: 'text',
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  putText(path: string, body: unknown): Observable<string> {
    return this.http.put(this.url(path), body, {
      responseType: 'text',
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  delete<T>(path: string, body?: unknown): Observable<T> {
    return this.http.delete<T>(this.url(path), body === undefined ? {} : { body });
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }
}
