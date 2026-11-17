import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { PaymentMethod } from '@shared/models';
import { Observable, map } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { ApiService } from './api.service';

export type PaymentMethodStatus = 'idle' | 'loading' | 'success' | 'error';

const LOAD_FAILED = 'Payment methods could not be loaded.';
const SUCCESS_STATUSES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) {
    return undefined;
  }
  return String(value).trim();
}

function positiveId(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isSuccessValue(value: unknown): boolean {
  return (
    value === true ||
    value === 1 ||
    value === 200 ||
    value === 201 ||
    (typeof value === 'string' && SUCCESS_STATUSES.includes(value.trim().toUpperCase()))
  );
}

/**
 * Maps { success: true, message, data: [...] } from payment_method/get. A { status: "SUCCESS" }
 * envelope is accepted too, like the other lookup APIs. Rows without a valid PAYMENT_METHOD_ID
 * or PAYMENT_METHOD_NAME are skipped, and a repeated PAYMENT_METHOD_ID is kept only once.
 */
function mapPaymentMethodsResponse(response: unknown): PaymentMethod[] {
  if (!isRecord(response)) {
    throw new Error('The payment method API returned an invalid response.');
  }
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  if (status === undefined && success === undefined) {
    throw new Error('The payment method API returned an invalid response.');
  }
  const message = text(response['message'] ?? response['MESSAGE']);
  if (
    (status !== undefined && !isSuccessValue(status)) ||
    (success !== undefined && !isSuccessValue(success))
  ) {
    throw new Error(message ?? LOAD_FAILED);
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error('The payment method API returned an invalid payment method list.');
  }

  const seen = new Set<number>();
  const methods: PaymentMethod[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;
    const id = positiveId(row['PAYMENT_METHOD_ID']);
    const name = text(row['PAYMENT_METHOD_NAME']);
    if (id === undefined || !name || seen.has(id)) continue;
    seen.add(id);
    methods.push({ PAYMENT_METHOD_ID: id, PAYMENT_METHOD_NAME: name });
  }
  return methods;
}

/** The payment methods offered at checkout (payment_method API), in the order the API returns them. */
@Injectable({ providedIn: 'root' })
export class PaymentMethodService {
  private readonly api = inject(ApiService);

  private readonly _methods = signal<readonly PaymentMethod[]>([]);
  private readonly _status = signal<PaymentMethodStatus>('idle');
  private readonly _error = signal('');

  readonly methods = this._methods.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Loads the payment methods (GET payment_method/get?PAYMENT_METHOD_ID=-1). An empty list is a
   * successful load, so the page can tell "nothing available" apart from "failed". Calling this
   * again retries after an error and is ignored while a request is already running.
   */
  load(): void {
    if (this._status() === 'loading') return;
    this._status.set('loading');
    this._error.set('');
    this.fetch().subscribe({
      next: (methods) => {
        this._methods.set(methods);
        this._status.set('success');
      },
      error: (error: unknown) => {
        this._methods.set([]);
        this._error.set(this.errorMessage(error));
        this._status.set('error');
      },
    });
  }

  private fetch(): Observable<PaymentMethod[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.paymentMethod.get, { PAYMENT_METHOD_ID: -1 })
      .pipe(map(mapPaymentMethodsResponse));
  }

  /** A readable message for a failed payment method API call. */
   /** A readable message for a failed payment method API call. */
  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const raw: unknown = error.error;
      let body: unknown = raw;
      if (typeof raw === 'string' && raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          if (raw.trim().length <= 200 && !raw.includes('<')) return raw.trim();
        }
      }
      if (isRecord(body)) {
        const message = text(body['message'] ?? body['MESSAGE'] ?? body['error'] ?? body['ERROR']);
        if (message) return message;
      }
      return error.status ? `${LOAD_FAILED} (HTTP ${error.status})` : LOAD_FAILED;
    }
    return error instanceof Error && error.message ? error.message : LOAD_FAILED;
  }
}