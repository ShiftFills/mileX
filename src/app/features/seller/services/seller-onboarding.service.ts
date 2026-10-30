import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';

export interface SellerLookupOption {
  id: string;
  name: string;
}

export interface SellerOnboardingPayload {
  BUSINESS_NAME: string;
  SELLER_NAME: string;
  BUSINESS_TYPE: string;
  EMAIL: string;
  MOBILE_NUMBER: number;
  BUSINESS_ADDRESS: string;
  CITY: string;
  STATE: string;
  COUNTRY: string;
  PINCODE: string;
  GST_NUMBER: string;
  PAN_NUMBER: string;
  BUSINESS_REGISTRATION_NUMBER: string;
  CONTACT_PERSON_NAME: string;
  CONTACT_PERSON_MOBILE: number;
  CONTACT_PERSON_EMAIL: string;
  USER_NAME: string;
  USER_PASSWORD: string;
  CREATED_BY: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnvelope(response: unknown): readonly unknown[] {
  if (!isRecord(response)) {
    throw new Error('The seller lookup API returned an invalid response.');
  }

  const status = response['STATUS'] ?? response['status'];
  const message = response['MESSAGE'] ?? response['message'];
  if (typeof status !== 'string' || status.toUpperCase() !== 'SUCCESS') {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message
        : 'The seller lookup API could not load its options.',
    );
  }

  const data = response['DATA'] ?? response['data'];
  if (!Array.isArray(data)) {
    throw new Error('The seller lookup API returned an invalid option list.');
  }
  return data;
}

function mapOptions(response: unknown, idField: string, nameField: string): SellerLookupOption[] {
  const options = readEnvelope(response).map((entry) => {
    if (!isRecord(entry)) {
      throw new Error('The seller lookup API returned an invalid option.');
    }

    const id = entry[idField];
    const name = entry[nameField];
    if (
      (typeof id !== 'string' && typeof id !== 'number') ||
      !String(id).trim() ||
      typeof name !== 'string' ||
      !name.trim()
    ) {
      throw new Error('The seller lookup API returned an option with missing required fields.');
    }
    return { id: String(id), name: name.trim() };
  });
  return options;
}

@Injectable({ providedIn: 'root' })
export class SellerOnboardingService {
  private readonly api = inject(ApiService);

  getBusinessTypes(): Observable<SellerLookupOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerOnboarding.businessTypes, { BUSINESS_TYPE_ID: -1 })
      .pipe(map((response) => mapOptions(response, 'BUSINESS_TYPE_ID', 'BUSINESS_TYPE_NAME')));
  }

  getCountries(): Observable<SellerLookupOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerOnboarding.countries, { COUNTRY_ID: -1 })
      .pipe(map((response) => mapOptions(response, 'COUNTRY_ID', 'COUNTRY_NAME')));
  }

  getStates(countryId: string): Observable<SellerLookupOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerOnboarding.states, {
        STATE_ID: -1,
        COUNTRY_ID: countryId,
      })
      .pipe(map((response) => mapOptions(response, 'STATE_ID', 'STATE_NAME')));
  }

  submit(payload: SellerOnboardingPayload): Observable<void> {
    return this.api.post<unknown>(API_ENDPOINTS.sellerOnboarding.insert, payload).pipe(
      map((response) => {
        if (!isRecord(response)) {
          throw new Error('The seller onboarding API returned an invalid response.');
        }
        const status = response['STATUS'] ?? response['status'];
        const message = response['MESSAGE'] ?? response['message'];
        if (typeof status !== 'string' || status.toUpperCase() !== 'SUCCESS') {
          throw new Error(
            typeof message === 'string' && message.trim()
              ? message
              : 'The seller application could not be submitted.',
          );
        }
      }),
    );
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body)) {
        const message = body['MESSAGE'] ?? body['message'];
        if (typeof message === 'string' && message.trim()) return message;
      }
      return error.status
        ? `Seller onboarding request failed (HTTP ${error.status}).`
        : 'Seller onboarding request failed. Check your connection and try again.';
    }
    return error instanceof Error
      ? error.message
      : 'Seller onboarding request failed. Please try again.';
  }
}
