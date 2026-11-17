import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { User } from '@shared/models';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';

export interface LoginPayload {
  USER_NAME: string;
  USER_PASSWORD: string;
}

interface LoginResult {
  user: User;
  token: string;
  message: string;
}

export interface CustomerRegistrationPayload {
  FIRST_NAME: string;
  LAST_NAME: string;
  EMAIL: string;
  MOBILE_NUMBER: string;
  USER_NAME: string;
  USER_PASSWORD: string;
  CONFIRM_PASSWORD: string;
  CREATED_BY?: number;
}

/**
 * JWT claim names for each ID. The access token is the single source of these values.
 * Role-specific IDs deliberately have no 'id' / 'sub' fallback: a missing CUSTOMER_ID,
 * SELLER_ID or ADMIN_ID claim stays undefined and never becomes the USER_ID.
 */
const USER_ID_CLAIMS = ['USER_ID', 'user_id', 'userId', 'id', 'sub'] as const;
const CUSTOMER_ID_CLAIMS = ['CUSTOMER_ID', 'customer_id', 'customerId'] as const;
const SELLER_ID_CLAIMS = ['SELLER_ID', 'seller_id', 'sellerId'] as const;
const ADMIN_ID_CLAIMS = ['ADMIN_ID', 'admin_id', 'adminId'] as const;

/** Login response fields that are compared with the matching access-token claim. */
const LOGIN_BODY_ID_CHECKS = [
  { field: 'USER_ID', claims: USER_ID_CLAIMS },
  { field: 'CUSTOMER_ID', claims: CUSTOMER_ID_CLAIMS },
  { field: 'SELLER_ID', claims: SELLER_ID_CLAIMS },
  { field: 'ADMIN_ID', claims: ADMIN_ID_CLAIMS },
] as const;

/** Browser storage that belongs to one signed-in person and must never reach the next account. */
const USER_DATA_KEYS = [
  STORAGE_KEYS.cart,
  STORAGE_KEYS.wishlist,
  STORAGE_KEYS.addresses,
  STORAGE_KEYS.selectedAddress,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseMessage(response: Record<string, unknown>): string | undefined {
  const message = response['MESSAGE'] ?? response['message'];
  if (typeof message === 'string' && message.trim()) return message.trim();
  const error = response['error'] ?? response['ERROR'];
  if (typeof error === 'string' && error.trim()) return error.trim();
  const errors = response['errors'] ?? response['ERRORS'];
  const messages = Array.isArray(errors)
    ? errors.filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
    : isRecord(errors)
      ? Object.values(errors)
          .flatMap((value) => Array.isArray(value) ? value : [value])
          .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
      : [];
  return messages.length ? messages.join(' ') : undefined;
}

function requiredText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A positive whole number, or undefined for null, missing, zero, negative or non-numeric values. */
function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function claimsFromToken(token: string | null): Record<string, unknown> | undefined {
  if (!token) return undefined;
  const payload = token.split('.')[1];
  if (!payload) return undefined;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isRecord(claims) ? claims : undefined;
  } catch {
    return undefined;
  }
}

function idFromClaims(
  claims: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | undefined {
  if (!claims) return undefined;
  for (const key of keys) {
    const id = positiveInteger(claims[key]);
    if (id !== undefined) return id;
  }
  return undefined;
}

function hasRole(userType: string | undefined, role: string): boolean {
  return userType?.trim().toUpperCase() === role;
}

/**
 * When the login response body and the access token both carry the same ID, they must agree.
 * A disagreement rejects the login instead of silently trusting one of them.
 */
function assertBodyMatchesToken(
  data: Record<string, unknown>,
  claims: Record<string, unknown> | undefined,
): void {
  for (const { field, claims: keys } of LOGIN_BODY_ID_CHECKS) {
    const bodyId = positiveInteger(data[field]);
    const tokenId = idFromClaims(claims, keys);
    if (bodyId !== undefined && tokenId !== undefined && bodyId !== tokenId) {
      throw new Error(
        `Login was rejected: the ${field} in the response does not match the access token.`,
      );
    }
  }
}

function mapLoginResponse(response: unknown): LoginResult {
  if (!isRecord(response)) {
    throw new Error('The login API returned an invalid response.');
  }

  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  const message = responseMessage(response);
  const normalizedStatus =
    typeof status === 'string' ? status.trim().toUpperCase() : undefined;
  const hasSuccessfulStatus =
    normalizedStatus !== undefined && ['SUCCESS', 'OK', '200', '201'].includes(normalizedStatus);
  const hasSuccessFlag =
    success === true ||
    success === 1 ||
    (typeof success === 'string' &&
      ['TRUE', '1', 'SUCCESS'].includes(success.trim().toUpperCase()));
  if (
    (status !== undefined && status !== null && !hasSuccessfulStatus) ||
    success === false ||
    success === 0 ||
    (success !== undefined && !hasSuccessFlag) ||
    (!hasSuccessfulStatus && !hasSuccessFlag)
  ) {
    throw new Error(message ?? 'Login failed. Check your username and password.');
  }

  const responseData = response['data'] ?? response['DATA'];
  if (responseData !== undefined && responseData !== null && !isRecord(responseData)) {
    throw new Error('The login API returned incomplete user details.');
  }
  const data = isRecord(responseData) ? responseData : response;

  const userName = requiredText(data['USER_NAME']);
  const userType = requiredText(data['USER_TYPE']);
  const userTypeId = positiveInteger(data['USER_TYPE_ID']);
  const token = requiredText(data['ACCESSTOKEN']);
  const claims = token ? claimsFromToken(token) : undefined;
  const userId = idFromClaims(claims, USER_ID_CLAIMS);
  if (!userId || !userName || !userType || !userTypeId || !token) {
    throw new Error('The login API returned incomplete user details or access token.');
  }
  assertBodyMatchesToken(data, claims);

  return {
    user: {
      id: String(userId),
      email: '',
      firstName: userName,
      lastName: '',
      userName,
      userType,
      userTypeId,
    },
    token,
    message: message ?? 'Login successful.',
  };
}

function validateRegistrationResponse(response: unknown): string {
  if (!isRecord(response)) {
    if (typeof response === 'string' && /^(FAILURE|FAILED|ERROR)\b/i.test(response.trim())) {
      throw new Error(response.trim());
    }
    return typeof response === 'string' && response.trim()
      ? response.trim()
      : 'Your account was created successfully.';
  }

  const status = response['STATUS'] ?? response['status'];
  const normalizedStatus =
    typeof status === 'string' || typeof status === 'number'
      ? String(status).trim().toUpperCase()
      : undefined;
  const message = responseMessage(response);
  if (
    (status !== undefined &&
      status !== null &&
      !['SUCCESS', 'OK', '200', '201'].includes(normalizedStatus ?? '')) ||
    response['SUCCESS'] === false ||
    response['success'] === false ||
    response['ERROR'] === true ||
    (typeof response['error'] === 'string' && response['error'].trim() !== '')
  ) {
    throw new Error(message ?? 'Registration could not be completed.');
  }
  return message ?? 'Your account was created successfully.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly storage = inject(StorageService);
  private readonly api = inject(ApiService);

  private readonly _user = signal<User | null>(this.storage.get<User>(STORAGE_KEYS.user));
  private readonly _token = signal<string | null>(
    this.storage.get<string>(STORAGE_KEYS.accessToken),
  );
  /** The access token's claims, decoded once per token. The single source of every ID below. */
  private readonly claims = computed(() => claimsFromToken(this._token()));

  readonly user = this._user.asReadonly();
  readonly token = this._token.asReadonly();
  readonly userType = computed(() => this._user()?.userType?.trim() || undefined);
  readonly userTypeId = computed(() => this._user()?.userTypeId);
  /** USER_ID: the actual user. Use it for audit fields such as CREATED_BY and UPDATED_BY. */
  readonly userId = computed(() => idFromClaims(this.claims(), USER_ID_CLAIMS));
  /** CUSTOMER_ID: only for CUSTOMER sessions. Undefined when missing; never falls back to USER_ID. */
  readonly customerId = computed(() =>
    hasRole(this.userType(), 'CUSTOMER') ? idFromClaims(this.claims(), CUSTOMER_ID_CLAIMS) : undefined,
  );
  /** SELLER_ID: only for SELLER sessions. Undefined for a seller who has no seller record yet. */
  readonly sellerId = computed(() =>
    hasRole(this.userType(), 'SELLER') ? idFromClaims(this.claims(), SELLER_ID_CLAIMS) : undefined,
  );
  /** ADMIN_ID: only for ADMIN sessions. */
  readonly adminId = computed(() =>
    hasRole(this.userType(), 'ADMIN') ? idFromClaims(this.claims(), ADMIN_ID_CLAIMS) : undefined,
  );
  readonly isAuthenticated = computed(() => !!this._token() && !!this._user());

  login(userName: string, password: string): Observable<string> {
    const payload: LoginPayload = {
      USER_NAME: userName.trim(),
      USER_PASSWORD: password,
    };
    if (!payload.USER_NAME || !payload.USER_PASSWORD) {
      throw new RangeError('Username and password are required.');
    }

    return this.api
      .post<unknown>(API_ENDPOINTS.user.login, payload)
      .pipe(
        map(mapLoginResponse),
        map((result) => {
          this.setSession(result.user, result.token);
          return result.message;
        }),
      );
  }

  registerCustomer(payload: CustomerRegistrationPayload): Observable<string> {
    return this.api
      .post<unknown>(API_ENDPOINTS.customerRegistration.insert, payload)
      .pipe(map(validateRegistrationResponse));
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body)) {
        const message = responseMessage(body);
        if (message) return message;
      } else if (typeof body === 'string' && body.trim()) {
        return body.trim();
      }
      return error.status
        ? `Registration failed (HTTP ${error.status}).`
        : 'Registration failed. Check your connection and try again.';
    }
    return error instanceof Error ? error.message : 'Registration failed. Please try again.';
  }

  getLoginErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body)) {
        const message = responseMessage(body);
        if (message) return message;
      } else if (typeof body === 'string' && body.trim()) {
        return body.trim();
      }
      return error.status
        ? `Login failed (HTTP ${error.status}).`
        : 'Login failed. Check your connection and try again.';
    }
    return error instanceof Error ? error.message : 'Login failed. Please try again.';
  }

  setSession(user: User, token: string): void {
    // A different person is signing in: drop the previous person's cart, wishlist and addresses.
    const previousUserId = this.userId();
    const nextUserId = idFromClaims(claimsFromToken(token), USER_ID_CLAIMS);
    if (previousUserId !== undefined && previousUserId !== nextUserId) {
      this.clearUserData();
    }

    this._user.set(user);
    this._token.set(token);
    this.storage.set(STORAGE_KEYS.user, user);
    this.storage.set(STORAGE_KEYS.accessToken, token);
  }

  clearSession(): void {
    this._user.set(null);
    this._token.set(null);
    this.storage.remove(STORAGE_KEYS.user);
    this.storage.remove(STORAGE_KEYS.accessToken);
    this.clearUserData();
  }

  private clearUserData(): void {
    for (const key of USER_DATA_KEYS) this.storage.remove(key);
  }
}