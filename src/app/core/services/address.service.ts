import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AddressType,
  CustomerAddressInsertPayload,
  CustomerAddressUpdatePayload,
  DeliveryAddress,
} from '@shared/models';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type AddressStatus = 'idle' | 'loading' | 'success' | 'error';

/** What the delivery address form hands to the service when saving. */
export interface AddressInput {
  /**
   * ADDRESS_TYPE value to send: HOME, WORK or OTHER, or the original backend value of an
   * existing address whose type the user did not change (for example 'pg').
   */
  addressType: string;
  fullName: string;
  mobile: string;
  pincode: string;
  /** Sent as ADDRESS_LINE_1 */
  house: string;
  /** Sent as ADDRESS_LINE_2 */
  street: string;
  landmark?: string;
  city: string;
  state: string;
  country: string;
  isDefault: boolean;
}

const NOT_A_CUSTOMER = 'Sign in as a customer to manage delivery addresses.';
const SUCCESS_STATUSES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];
const ACTION_FAILURE = /\b(?:failure|failed|error|could not|unable|invalid|not found)\b/i;

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

/** HOME and WORK map to themselves; every other backend value (for example 'pg') is shown as Other. */
function toAddressType(apiType: string): AddressType {
  switch (apiType.trim().toUpperCase()) {
    case 'HOME':
      return 'home';
    case 'WORK':
      return 'work';
    default:
      return 'other';
  }
}

function mapAddress(value: unknown, requestedCustomerId: number): DeliveryAddress {
  if (!isRecord(value)) {
    throw new Error('The customer address API returned an invalid address.');
  }
  const id = positiveId(value['ADDRESS_ID']);
  if (id === undefined) {
    throw new Error('The customer address API returned an address without a valid ADDRESS_ID.');
  }
  const rowCustomerId = positiveId(value['CUSTOMER_ID']);
  if (rowCustomerId === undefined) {
    throw new Error('The customer address API returned an address without a CUSTOMER_ID.');
  }
  // Same safety net as the shopping cart: never show an address that belongs to someone else.
  if (rowCustomerId !== requestedCustomerId) {
    throw new Error('The customer address API returned an address for a different customer.');
  }

  const apiType = text(value['ADDRESS_TYPE']) ?? '';
  const landmark = text(value['LANDMARK']);
  const defaultFlag = value['DEFAULT_ADDRESS'];
  return {
    id: String(id),
    type: toAddressType(apiType),
    apiType,
    fullName: text(value['FULL_NAME']) ?? '',
    mobile: text(value['MOBILE_NUMBER']) ?? '',
    pincode: text(value['PINCODE']) ?? '',
    house: text(value['ADDRESS_LINE_1']) ?? '',
    street: text(value['ADDRESS_LINE_2']) ?? '',
    ...(landmark ? { landmark } : {}),
    city: text(value['CITY']) ?? '',
    state: text(value['STATE']) ?? '',
    country: text(value['COUNTRY']) ?? '',
    isDefault: defaultFlag === 1 || defaultFlag === '1' || defaultFlag === true,
  };
}

/** Maps { status: "SUCCESS", message, total_records, data: [...] } from customer_address/get. */
function mapAddressesResponse(response: unknown, requestedCustomerId: number): DeliveryAddress[] {
  if (!isRecord(response)) {
    throw new Error('The customer address API returned an invalid response.');
  }
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  if (status === undefined && success === undefined) {
    throw new Error('The customer address API returned an invalid response.');
  }
  const message = text(response['message'] ?? response['MESSAGE']);
  if (
    (status !== undefined && !isSuccessValue(status)) ||
    (success !== undefined && !isSuccessValue(success))
  ) {
    throw new Error(message ?? 'Your saved addresses could not be loaded.');
  }

  const data = response['data'] ?? response['DATA'];
  // PROVISIONAL: an empty result is assumed to be `data: null` / missing / []. Confirm against
  // the real "customer with no addresses" response.
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error('The customer address API returned an invalid address list.');
  }
  return data.map((row) => mapAddress(row, requestedCustomerId));
}

/**
 * PROVISIONAL: the insert and update response bodies are not confirmed yet. This accepts plain
 * text or a JSON envelope and only fails when the body clearly reports a failure. A non-2xx HTTP
 * status already errors in HttpClient.
 */
function assertActionSucceeded(response: string, defaultError: string): void {
  const body = response.trim();
  if (!body) return;

  if (body.startsWith('{') || body.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = undefined;
    }
    if (parsed !== undefined) {
      if (!isRecord(parsed)) return;
      const status = parsed['status'] ?? parsed['STATUS'];
      const success = parsed['success'] ?? parsed['SUCCESS'];
      const error = parsed['error'] ?? parsed['ERROR'];
      const message = text(parsed['message'] ?? parsed['MESSAGE'] ?? error);
      const failedStatus = status !== undefined && status !== null && !isSuccessValue(status);
      const failedFlag = success !== undefined && success !== null && !isSuccessValue(success);
      const reportedError = error === true || (typeof error === 'string' && error.trim() !== '');
      if (failedStatus || failedFlag || reportedError) throw new Error(message ?? defaultError);
      return;
    }
  }

  if (ACTION_FAILURE.test(body)) throw new Error(body);
}

function toPayloadFields(input: AddressInput): Omit<CustomerAddressInsertPayload, 'CUSTOMER_ID'> {
  return {
    ADDRESS_TYPE: input.addressType.trim(),
    FULL_NAME: input.fullName.trim(),
    MOBILE_NUMBER: input.mobile.trim(),
    ADDRESS_LINE_1: input.house.trim(),
    ADDRESS_LINE_2: input.street.trim(),
    LANDMARK: (input.landmark ?? '').trim(),
    CITY: input.city.trim(),
    STATE: input.state.trim(),
    COUNTRY: input.country.trim(),
    PINCODE: input.pincode.trim(),
    DEFAULT_ADDRESS: input.isDefault ? 1 : 0,
  };
}

/** The customer's saved delivery addresses (customer_address API) and the one chosen for delivery. */
@Injectable({ providedIn: 'root' })
export class AddressService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  private readonly _addresses = signal<DeliveryAddress[]>([]);
  private readonly _status = signal<AddressStatus>('idle');
  private readonly _error = signal('');
  private readonly selectedId = signal<string | null>(null);
  /** The customer whose addresses are held, so another login never sees the previous list. */
  private loadedFor: number | undefined;

  readonly addresses = this._addresses.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly selected = computed(() => {
    const id = this.selectedId();
    return this._addresses().find((address) => address.id === id) ?? null;
  });

  /**
   * Loads the logged-in customer's addresses (GET customer_address/get?CUSTOMER_ID=).
   * Selects the default address, or the first one when there is no default. An address the
   * customer already picked earlier in this session stays selected.
   */
  load(): void {
    if (this._status() === 'loading') return;
    const customerId = this.auth.customerId();
    if (customerId === undefined) {
      this._status.set('error');
      this._error.set(NOT_A_CUSTOMER);
      return;
    }
    if (this.loadedFor !== customerId) {
      this._addresses.set([]);
      this.selectedId.set(null);
      this.loadedFor = customerId;
    }

    this._status.set('loading');
    this._error.set('');
    this.fetch(customerId).subscribe({
      next: (list) => {
        this.applyList(list, null);
        this._status.set('success');
      },
      error: (error: unknown) => {
        this._error.set(this.errorMessage(error, 'Your saved addresses could not be loaded.'));
        this._status.set('error');
      },
    });
  }

  select(id: string): void {
    if (this._addresses().some((address) => address.id === id)) this.selectedId.set(id);
  }

  /** POST customer_address/insert, then reloads the list and selects the new address. */
  add(input: AddressInput): Observable<void> {
    const customerId = this.auth.customerId();
    if (customerId === undefined) return throwError(() => new Error(NOT_A_CUSTOMER));
    if (!input.addressType.trim()) {
      return throwError(() => new RangeError('Choose an address type.'));
    }

    const knownIds = new Set(this._addresses().map((address) => address.id));
    const payload: CustomerAddressInsertPayload = { ...toPayloadFields(input), CUSTOMER_ID: customerId };
    return this.api.postText(API_ENDPOINTS.customerAddress.insert, payload).pipe(
      map((response) => assertActionSucceeded(response, 'The address could not be saved.')),
      // The insert response is not confirmed, so the new address is found as the id that was not
      // in the list before.
      switchMap(() => this.reloadAfterSave(customerId, (list) => this.newestUnknownId(list, knownIds))),
    );
  }

  /** PUT customer_address/update for a saved address, then reloads the list and selects it. */
  update(id: string, input: AddressInput): Observable<void> {
    return this.sendUpdate(id, input, id);
  }

  /**
   * Makes a saved address the default. PROVISIONAL: there is no confirmed set-default API, so
   * this sends the full update payload with DEFAULT_ADDRESS = 1 and the address's original type.
   * The current selection is not changed.
   */
  setDefault(address: DeliveryAddress): Observable<void> {
    return this.sendUpdate(
      address.id,
      {
        addressType: address.apiType.trim() || address.type.toUpperCase(),
        fullName: address.fullName,
        mobile: address.mobile,
        pincode: address.pincode,
        house: address.house,
        street: address.street,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        country: address.country,
        isDefault: true,
      },
      null,
    );
  }

  /** A readable message for a failed address API call. */
  errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'string' && body.trim()) {
        try {
          const parsed: unknown = JSON.parse(body);
          if (isRecord(parsed)) {
            const message = text(parsed['message'] ?? parsed['MESSAGE'] ?? parsed['error'] ?? parsed['ERROR']);
            if (message) return message;
          }
        } catch {
          if (body.trim().length <= 200 && !body.includes('<')) return body.trim();
        }
      } else if (isRecord(body)) {
        const message = text(body['message'] ?? body['MESSAGE'] ?? body['error'] ?? body['ERROR']);
        if (message) return message;
      }
      return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }

   private sendUpdate(id: string, input: AddressInput, preferredId: string | null): Observable<void> {
    // CUSTOMER_ID comes from AuthService (CUSTOMER sessions only). It is never hardcoded and is
    // not the seller/admin USER_ID: customerId() is undefined for any non-customer session.
    const customerId = this.auth.customerId();
    if (customerId === undefined) return throwError(() => new Error(NOT_A_CUSTOMER));
    const addressId = Number(id);
    if (!Number.isSafeInteger(addressId) || addressId <= 0) {
      return throwError(() => new RangeError('Address ID must be a positive whole number.'));
    }
    // Only allow ids from this customer's own loaded list (every row was checked against
    // CUSTOMER_ID when it was loaded).
    if (!this._addresses().some((address) => address.id === id)) {
      return throwError(() => new Error('This address was not found in your saved addresses.'));
    }
    if (!input.addressType.trim()) {
      return throwError(() => new RangeError('Choose an address type.'));
    }

    const payload: CustomerAddressUpdatePayload = {
      ADDRESS_ID: addressId,
      ...toPayloadFields(input),
      CUSTOMER_ID: customerId,
    };
    return this.api.putText(API_ENDPOINTS.customerAddress.update, payload).pipe(
      map((response) => assertActionSucceeded(response, 'The address could not be updated.')),
      switchMap(() => this.reloadAfterSave(customerId, () => preferredId)),
    );
  }

  private fetch(customerId: number): Observable<DeliveryAddress[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.customerAddress.get, { CUSTOMER_ID: customerId })
      .pipe(map((response) => mapAddressesResponse(response, customerId)));
  }

  /**
   * Refreshes the list after a successful save. A failed refresh does not turn the save into an
   * error; the page shows a "could not refresh" state with a retry instead.
   */
  private reloadAfterSave(
    customerId: number,
    preferredId: (list: DeliveryAddress[]) => string | null,
  ): Observable<void> {
    return this.fetch(customerId).pipe(
      tap((list) => {
        this.applyList(list, preferredId(list));
        this._status.set('success');
        this._error.set('');
      }),
      map(() => undefined),
      catchError(() => {
        this._error.set('Your changes were saved, but the address list could not be refreshed.');
        this._status.set('error');
        return of(undefined);
      }),
    );
  }

  /** Stores the list and picks the selection: preferred, then current, then default, then first. */
  private applyList(list: DeliveryAddress[], preferredId: string | null): void {
    this._addresses.set(list);
    const exists = (id: string | null): id is string => id !== null && list.some((a) => a.id === id);
    const current = this.selectedId();
    const next = exists(preferredId)
      ? preferredId
      : exists(current)
        ? current
        : ((list.find((address) => address.isDefault) ?? list[0])?.id ?? null);
    this.selectedId.set(next);
  }

  private newestUnknownId(list: DeliveryAddress[], knownIds: ReadonlySet<string>): string | null {
    const added = list.filter((address) => !knownIds.has(address.id));
    if (!added.length) return null;
    return added.reduce((newest, address) => (Number(address.id) > Number(newest.id) ? address : newest)).id;
  }
}