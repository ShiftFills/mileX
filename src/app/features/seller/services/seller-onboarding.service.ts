import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { AuthService } from '@core/services/auth.service';

export interface SellerLookupOption {
  id: string;
  name: string;
}

export interface SellerOnboardingPayload {
  BUSINESS_NAME: string;
  SELLER_NAME: string;
  BUSINESS_TYPE: number;
  EMAIL: string;
  MOBILE_NUMBER: number;
  BUSINESS_ADDRESS: string;
  CITY: string;
  STATE: number;
  COUNTRY: number;
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

export interface SellerOnboardingUpdatePayload {
  SELLER_ID: number;
  BUSINESS_NAME: string;
  SELLER_NAME: string;
  BUSINESS_TYPE: number;
  EMAIL: string;
  MOBILE_NUMBER: number;
  BUSINESS_ADDRESS: string;
  CITY: string;
  STATE: number;
  COUNTRY: number;
  PINCODE: string;
  GST_NUMBER: string;
  PAN_NUMBER: string;
  BUSINESS_REGISTRATION_NUMBER: string;
  CONTACT_PERSON_NAME: string;
  CONTACT_PERSON_MOBILE: number;
  CONTACT_PERSON_EMAIL: string;
  USER_ID: number;
  USER_NAME: string;
  USER_PASSWORD: string;
  UPDATED_BY: number;
}

export interface SellerOnboardingResult {
  sellerId: number;
  userId: number;
}

export interface SellerAccountRecord {
  userId: number;
  sellerId?: number;
  sellerStatus?: string;
  documentId?: number;
  bankDetailId?: number;
}

export interface SellerDocumentsResult {
  documentId: number;
  message: string;
}

export interface SellerBankDetailsResult {
  bankDetailId: number;
  message: string;
}

export interface SellerDocumentsPayload {
  GST_CERTIFICATE: string | null;
  PAN_CARD: string | null;
  BUSINESS_REGISTRATION_CERTIFICATE: string | null;
  ADDRESS_PROOF: string | null;
  OWNER_DIRECTOR_ID_PROOF: string | null;
  BANK_PROOF: string | null;
  OTHER_SUPPORTING_DOCUMENT: string | null;
  SELLER_ID: number;
  CREATED_BY: number;
}

export interface SellerBankDetails {
  ACCOUNT_HOLDER_NAME: string;
  BANK_NAME: string;
  BRANCH_NAME: string;
  ACCOUNT_NUMBER: string;
  CONFIRM_ACCOUNT_NUMBER: string;
  IFSC_CODE: string;
  ACCOUNT_TYPE: number;
}

export interface SellerDocumentsUpdatePayload extends Omit<SellerDocumentsPayload, 'CREATED_BY'> {
  DOCUMENT_ID: number;
  UPDATED_BY: number;
}

export interface SellerBankDetailsUpdatePayload extends SellerBankDetails {
  BANK_DETAIL_ID: number;
  SELLER_ID: number;
  UPDATED_BY: number;
}

const DOCUMENT_PAYLOAD_KEYS = {
  gstCertificate: 'GST_CERTIFICATE',
  panCard: 'PAN_CARD',
  registrationCertificate: 'BUSINESS_REGISTRATION_CERTIFICATE',
  addressProof: 'ADDRESS_PROOF',
  ownerIdProof: 'OWNER_DIRECTOR_ID_PROOF',
  bankProof: 'BANK_PROOF',
  supportingDocument: 'OTHER_SUPPORTING_DOCUMENT',
} as const satisfies Record<string, keyof SellerDocumentsPayload>;

export const SELLER_CREATED_BY = 1;

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

function numericId(value: unknown): number | undefined {
  const id = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function requireId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
  return value;
}

function readResourceRecord(response: unknown, resource: string): Record<string, unknown> {
  if (!isRecord(response)) throw new Error(`The ${resource} API returned an invalid response.`);

  const status = response['STATUS'] ?? response['status'];
  const message = response['MESSAGE'] ?? response['message'];
  if (
    typeof status === 'string' &&
    status.trim() !== '' &&
    !['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase())
  ) {
    throw new Error(typeof message === 'string' && message.trim() ? message : `The ${resource} could not be loaded.`);
  }

  const data = response['DATA'] ?? response['data'];
  const record = Array.isArray(data) ? data.find(isRecord) : isRecord(data) ? data : response;
  if (!record) throw new Error(`The ${resource} API returned no record.`);
  return record;
}

function mapSellerForUser(response: unknown, userId: number): SellerAccountRecord | null {
  if (!isRecord(response)) {
    throw new Error('The seller lookup API returned an invalid response.');
  }

  const status = response['STATUS'] ?? response['status'];
  const message = response['MESSAGE'] ?? response['message'];
  if (
    status !== undefined &&
    status !== true &&
    (typeof status !== 'string' ||
      !['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase()))
  ) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : 'Seller details could not be loaded.',
    );
  }

  const responseData = response['DATA'] ?? response['data'];
  const data =
    (responseData === null || responseData === undefined) &&
    numericId(response['USER_ID']) === userId
      ? response
      : responseData;
  if (data === null || data === undefined || (Array.isArray(data) && data.length === 0)) {
    return null;
  }

  const records = Array.isArray(data) ? data.filter(isRecord) : isRecord(data) ? [data] : [];
  if (records.length === 0) {
    throw new Error('The seller lookup API returned an invalid seller record.');
  }

  const matchingRecord = records.find((record) => numericId(record['USER_ID']) === userId);
  if (!matchingRecord) {
    const returnedUserId = numericId(records[0]['USER_ID']);
    if (returnedUserId === undefined) {
      throw new Error('The seller lookup API response is missing USER_ID.');
    }
    throw new Error(
      `The seller lookup API returned USER_ID ${returnedUserId} for the requested USER_ID ${userId}.`,
    );
  }

  const sellerId = numericId(matchingRecord['SELLER_ID']);
  const documentId = numericId(matchingRecord['DOCUMENT_ID']);
  const bankDetailId = numericId(matchingRecord['BANK_DETAIL_ID']);
  const sellerStatus =
    typeof matchingRecord['SELLER_STATUS'] === 'string'
      ? matchingRecord['SELLER_STATUS'].trim()
      : undefined;

  return {
    userId,
    ...(sellerId !== undefined ? { sellerId } : {}),
    ...(sellerStatus ? { sellerStatus } : {}),
    ...(documentId !== undefined ? { documentId } : {}),
    ...(bankDetailId !== undefined ? { bankDetailId } : {}),
  };
}

function assertRecordId(record: Record<string, unknown>, key: string, expectedId: number, resource: string): void {
  const actualId = numericId(record[key]);
  if (actualId === undefined) {
    throw new Error(`The ${resource} API response is missing ${key}; no matching record can be updated.`);
  }
  if (actualId !== expectedId) {
    throw new Error(
      `The ${resource} API returned ${key} ${actualId} for the requested ${key} ${expectedId}.`,
    );
  }
}

function assertOnboardingSuccess(response: unknown): asserts response is Record<string, unknown> {
  if (!isRecord(response)) throw new Error('The seller onboarding API returned an invalid response.');
  const status = response['STATUS'] ?? response['status'];
  const message = response['MESSAGE'] ?? response['message'];
  if (
    status !== true &&
    (typeof status !== 'string' || !['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase()))
  ) {
    throw new Error(
      typeof message === 'string' && message.trim() ? message : 'The seller application could not be submitted.',
    );
  }
}

function mapOnboardingResult(response: unknown): SellerOnboardingResult {
  assertOnboardingSuccess(response);

  const data = response['DATA'] ?? response['data'];
  const details = Array.isArray(data) ? data.find(isRecord) : isRecord(data) ? data : undefined;
  const sellerId = numericId(response['SELLER_ID'] ?? details?.['SELLER_ID']);
  if (sellerId === undefined) {
    throw new Error('The seller onboarding API did not return a valid SELLER_ID required for the next steps.');
  }
  const userId = numericId(response['USER_ID'] ?? details?.['USER_ID']);
  if (userId === undefined) {
    throw new Error('The seller onboarding API did not return a valid USER_ID required for updates.');
  }
  return { sellerId, userId };
}

function readSuccess(response: unknown, resource: string, fallback: string): string {
  if (!isRecord(response)) {
    if (response === false) throw new Error(fallback);
    if (typeof response === 'string') {
      const message = response.trim();
      if (/^(FAILURE|FAILED|ERROR)\b/i.test(message)) throw new Error(message);
      return message || fallback;
    }
    return fallback;
  }

  const status = response['STATUS'] ?? response['status'];
  const success = response['SUCCESS'] ?? response['success'];
  const message = response['MESSAGE'] ?? response['message'];
  const responseMessage = typeof message === 'string' && message.trim() ? message.trim() : fallback;

  if (
    status === false ||
    (typeof status === 'string' &&
      status.trim() !== '' &&
      !['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase())) ||
    success === false ||
    response['ERROR'] === true ||
    (typeof response['error'] === 'string' && response['error'].trim() !== '')
  ) {
    throw new Error(responseMessage);
  }
  return responseMessage;
}

function mapInsertResult(
  response: unknown,
  resource: string,
  idKey: string,
  fallback: string,
): { id: number; message: string } {
  const message = readSuccess(response, resource, fallback);
  const record = isRecord(response) ? response : {};
  const data = record['DATA'] ?? record['data'];
  const details = Array.isArray(data) ? data.find(isRecord) : isRecord(data) ? data : undefined;
  const id = numericId(record[idKey] ?? details?.[idKey]);
  if (id === undefined) throw new Error(`The ${resource} insert response did not return a valid ${idKey}.`);
  return { id, message };
}

@Injectable({ providedIn: 'root' })
export class SellerOnboardingService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private sellerLookupToken: string | null | undefined;
  private readonly sellerLookupCache = new Map<string, SellerAccountRecord | null>();
  private readonly sellerLookupRequests = new Map<string, Observable<SellerAccountRecord | null>>();

  getSellerForUser(userId: number): Observable<SellerAccountRecord | null> {
    const id = requireId(userId, 'USER_ID');
    const token = this.auth.token();
    if (this.sellerLookupToken !== token) {
      this.sellerLookupToken = token;
      this.sellerLookupCache.clear();
      this.sellerLookupRequests.clear();
    }

    const requestKey = `${token ?? ''}:${id}`;
    if (this.sellerLookupCache.has(requestKey)) {
      return of(this.sellerLookupCache.get(requestKey) ?? null);
    }

    const existingRequest = this.sellerLookupRequests.get(requestKey);
    if (existingRequest) return existingRequest;

    const request = this.api
      .get<unknown>(API_ENDPOINTS.sellerOnboarding.get, { USER_ID: id })
      .pipe(
        map((response) => mapSellerForUser(response, id)),
        tap((record) => this.sellerLookupCache.set(requestKey, record)),
        finalize(() => this.sellerLookupRequests.delete(requestKey)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.sellerLookupRequests.set(requestKey, request);
    return request;
  }

  getSeller(sellerId: number): Observable<Record<string, unknown>> {
    const id = requireId(sellerId, 'SELLER_ID');
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerOnboarding.get, { SELLER_ID: id })
      .pipe(map((response) => {
        const record = readResourceRecord(response, 'seller onboarding');
        assertRecordId(record, 'SELLER_ID', id, 'seller onboarding');
        return record;
      }));
  }

  getSellerDocuments(documentId: number, sellerId?: number): Observable<Record<string, unknown>> {
    const id = requireId(documentId, 'DOCUMENT_ID');
    const seller = sellerId === undefined ? undefined : requireId(sellerId, 'SELLER_ID');
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerDocuments.get, { DOCUMENT_ID: id })
      .pipe(map((response) => {
        const record = readResourceRecord(response, 'seller documents');
        assertRecordId(record, 'DOCUMENT_ID', id, 'seller documents');
        if (seller !== undefined) assertRecordId(record, 'SELLER_ID', seller, 'seller documents');
        return record;
      }));
  }

  getSellerDocumentsForSeller(sellerId: number, documentId?: number): Observable<Record<string, unknown>> {
    const seller = requireId(sellerId, 'SELLER_ID');
    if (documentId === undefined) {
      return throwError(() => new Error('The selected seller record does not provide a DOCUMENT_ID.'));
    }
    return this.getSellerDocuments(documentId, seller);
  }

  getSellerBankDetails(bankDetailId: number, sellerId: number): Observable<Record<string, unknown>> {
    const bankId = requireId(bankDetailId, 'BANK_DETAIL_ID');
    const seller = requireId(sellerId, 'SELLER_ID');
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerBankDetails.get, {
        BANK_DETAIL_ID: bankId,
        SELLER_ID: seller,
      })
      .pipe(map((response) => {
        const record = readResourceRecord(response, 'seller bank details');
        assertRecordId(record, 'BANK_DETAIL_ID', bankId, 'seller bank details');
        assertRecordId(record, 'SELLER_ID', seller, 'seller bank details');
        return record;
      }));
  }

  getSellerBankDetailsForSeller(sellerId: number, bankDetailId?: number): Observable<Record<string, unknown>> {
    const seller = requireId(sellerId, 'SELLER_ID');
    if (bankDetailId === undefined) {
      return throwError(() => new Error('The selected seller record does not provide a BANK_DETAIL_ID.'));
    }
    return this.getSellerBankDetails(bankDetailId, seller);
  }

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
        assertOnboardingSuccess(response);
      }),
    );
  }

  submitWithResult(payload: SellerOnboardingPayload): Observable<SellerOnboardingResult> {
    return this.api.post<unknown>(API_ENDPOINTS.sellerOnboarding.insert, payload).pipe(map(mapOnboardingResult));
  }

  updateSeller(payload: SellerOnboardingUpdatePayload): Observable<string> {
    requireId(payload.SELLER_ID, 'SELLER_ID');
    requireId(payload.USER_ID, 'USER_ID');
    return this.api
      .put<unknown>(API_ENDPOINTS.sellerOnboarding.update, payload)
      .pipe(map((response) => readSuccess(response, 'seller onboarding', 'Seller details updated successfully.')));
  }

  uploadDocuments(
    files: Readonly<Record<string, File>>,
    sellerId: number,
  ): Observable<SellerDocumentsResult> {
    const payload: Omit<SellerDocumentsPayload, 'SELLER_ID' | 'CREATED_BY'> = {
      GST_CERTIFICATE: files['gstCertificate']?.name ?? null,
      PAN_CARD: files['panCard']?.name ?? null,
      BUSINESS_REGISTRATION_CERTIFICATE: files['registrationCertificate']?.name ?? null,
      ADDRESS_PROOF: files['addressProof']?.name ?? null,
      OWNER_DIRECTOR_ID_PROOF: files['ownerIdProof']?.name ?? null,
      BANK_PROOF: files['bankProof']?.name ?? null,
      OTHER_SUPPORTING_DOCUMENT: files['supportingDocument']?.name ?? null,
    };
    const request: SellerDocumentsPayload = {
      ...payload,
      SELLER_ID: sellerId,
      CREATED_BY: SELLER_CREATED_BY,
    };
    return this.api
      .post<unknown>(API_ENDPOINTS.sellerDocuments.insert, request)
      .pipe(map((response) => {
        const result = mapInsertResult(
          response,
          'seller documents',
          'DOCUMENT_ID',
          'Seller documents uploaded successfully.',
        );
        return { documentId: result.id, message: result.message };
      }));
  }

  updateDocuments(payload: SellerDocumentsUpdatePayload): Observable<string> {
    requireId(payload.DOCUMENT_ID, 'DOCUMENT_ID');
    requireId(payload.SELLER_ID, 'SELLER_ID');
    return this.api
      .put<unknown>(API_ENDPOINTS.sellerDocuments.update, payload)
      .pipe(map((response) => readSuccess(response, 'seller documents', 'Seller documents updated successfully.')));
  }

  saveBankDetails(
    details: SellerBankDetails,
    sellerId: number,
  ): Observable<SellerBankDetailsResult> {
    const payload = { ...details, SELLER_ID: sellerId, CREATED_BY: SELLER_CREATED_BY };
    return this.api.post<unknown>(API_ENDPOINTS.sellerBankDetails.insert, payload).pipe(
      map((response) => {
        const result = mapInsertResult(
          response,
          'seller bank details',
          'BANK_DETAIL_ID',
          'Bank details saved successfully.',
        );
        return { bankDetailId: result.id, message: result.message };
      }),
    );
  }

  updateBankDetails(payload: SellerBankDetailsUpdatePayload): Observable<string> {
    requireId(payload.BANK_DETAIL_ID, 'BANK_DETAIL_ID');
    requireId(payload.SELLER_ID, 'SELLER_ID');
    return this.api
      .put<unknown>(API_ENDPOINTS.sellerBankDetails.update, payload)
      .pipe(map((response) => readSuccess(response, 'seller bank details', 'Bank details updated successfully.')));
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body)) {
        const message = body['MESSAGE'] ?? body['message'];
        if (typeof message === 'string' && message.trim()) return message;
      }
      return error.status
        ? `Seller request failed (HTTP ${error.status}).`
        : 'Seller request failed. Check your connection and try again.';
    }
    return error instanceof Error
      ? error.message
      : 'Seller request failed. Please try again.';
  }
}
