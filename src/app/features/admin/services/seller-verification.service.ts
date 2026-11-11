import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import type { StatusOption } from '@shared/models/api.model';

export type { StatusOption } from '@shared/models/api.model';

export type SellerVerificationStatus = 'Pending' | 'Approved' | 'Rejected';

export interface SellerVerificationDocument {
  name: string;
  fileName: string;
  url: string;
  required?: boolean;
  documentId?: number;
  proofType?: string;
  status?: SellerVerificationStatus;
  rejectionReason?: string;
}

export interface SellerVerificationRecord {
  id: number;
  sellerId: number;
  documentId?: number;
  bankDetailId?: number;
  sellerName: string;
  businessName: string;
  businessType: string;
  sellerCode: string;
  email: string;
  mobile: string;
  gstNumber: string;
  panNumber: string;
  status: SellerVerificationStatus;
  documentVerificationStatus: SellerVerificationStatus;
  remarks: string;
  documents: SellerVerificationDocument[];
}

export interface SellerVerificationPage {
  items: SellerVerificationRecord[];
  total?: number;
  hasNext: boolean;
}

export interface DocumentVerificationApprovePayload {
  DOCUMENT_ID: number;
  PROOF_TYPE: string;
  UPDATED_BY: number;
}

export interface DocumentVerificationRejectPayload extends DocumentVerificationApprovePayload {
  REJECTION_REASON: string;
}

export interface SellerDecisionPayload {
  SELLER_ID: number;
  DECISION: 'APPROVED' | 'REJECTED';
  UPDATED_BY: number;
}

export interface SellerSummary {
  total: number | null;
  pending: number | null;
  approved: number | null;
  rejected: number | null;
}

export interface DateFilterOption {
  id: number; // DATE_FILTER_ID
  label: string; // FILTER_NAME
  days: number; // DAYS, sent to the seller verification API
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(record: Record<string, unknown>, key: string, fallback = '—'): string {
  const value = record[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim() || fallback
    : fallback;
}

function mapStatus(value: unknown): SellerVerificationStatus {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'APPROVED' || normalized === 'ACCEPTED') return 'Approved';
  if (normalized === 'REJECTED') return 'Rejected';
  return 'Pending';
}

function documentId(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  const parsed = Number(value['DOCUMENT_ID']);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function mapDocumentStatus(value: unknown): SellerVerificationStatus | undefined {
  if (!isRecord(value)) return undefined;
  const rawStatus =
    value['DOCUMENT_VERIFICATION_STATUS'] ?? value['VERIFICATION_STATUS'] ?? value['STATUS'];
  return rawStatus === undefined || rawStatus === null ? undefined : mapStatus(rawStatus);
}

function mapDocumentRejectionReason(value: Record<string, unknown>): string | undefined {
  const reason =
    value['REJECTION_REASON'] ??
    value['DOCUMENT_REJECTION_REASON'] ??
    value['VERIFICATION_REMARKS'] ??
    value['REMARKS'];
  return typeof reason === 'string' && reason.trim() ? reason.trim() : undefined;
}

function mapDocuments(value: unknown, fallbackDocumentId?: number): SellerVerificationDocument[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((document) => {
    const id = documentId(document) ?? fallbackDocumentId;
    const rawProofType =
      document['PROOF_TYPE'] ?? document['DOCUMENT_TYPE'] ?? document['DOCUMENT_TYPE_NAME'];
    const proofType = typeof rawProofType === 'string' ? rawProofType.trim().toUpperCase() : '';
    const status = mapDocumentStatus(document) ?? 'Pending';
    const requiredValue = document['IS_REQUIRED'] ?? document['REQUIRED'];
    const required =
      typeof requiredValue === 'boolean'
        ? requiredValue
        : requiredValue === 1 ||
            (typeof requiredValue === 'string' && requiredValue.toUpperCase() === 'TRUE')
          ? true
          : requiredValue === 0 ||
              (typeof requiredValue === 'string' && requiredValue.toUpperCase() === 'FALSE')
            ? false
            : REQUIRED_SELLER_DOCUMENT_TYPE_SET.has(proofType);
    const rejectionReason = mapDocumentRejectionReason(document);
    return {
      name: text(document, 'DOCUMENT_NAME', text(document, 'NAME', 'Submitted document')),
      fileName: text(document, 'FILE_NAME', text(document, 'DOCUMENT_FILE_NAME', '—')),
      url: text(document, 'FILE_URL', text(document, 'DOCUMENT_URL', '')),
      required,
      ...(id !== undefined ? { documentId: id } : {}),
      ...(proofType ? { proofType } : {}),
      ...(status ? { status } : {}),
      ...(rejectionReason ? { rejectionReason } : {}),
    };
  });
}

const SELLER_DOCUMENT_FIELDS = [
  {
    field: 'GST_CERTIFICATE',
    statusField: 'GST_CERTIFICATION_STATUS',
    name: 'GST Certificate',
    required: true,
  },
  { field: 'PAN_CARD', statusField: 'PAN_CARD_STATUS', name: 'PAN Card', required: true },
  {
    field: 'BUSINESS_REGISTRATION_CERTIFICATE',
    statusField: 'BUSINESS_REGISTRATION_CERTIFICATE_STATUS',
    name: 'Business Registration Certificate',
    required: true,
  },
  {
    field: 'ADDRESS_PROOF',
    statusField: 'ADDRESS_PROOF_STATUS',
    name: 'Address Proof',
    required: true,
  },
  {
    field: 'OWNER_DIRECTOR_ID_PROOF',
    statusField: 'OWNER_DIRECTOR_ID_PROOF_STATUS',
    name: 'Owner / Director ID Proof',
    required: true,
  },
  { field: 'BANK_PROOF', statusField: 'BANK_PROOF_STATUS', name: 'Bank Proof', required: true },
  {
    field: 'OTHER_SUPPORTING_DOCUMENT',
    statusField: 'OTHER_SUPPORTING_DOCUMENT_STATUS',
    name: 'Other Supporting Document',
    required: false,
  },
] as const;
export const REQUIRED_SELLER_DOCUMENT_TYPES = SELLER_DOCUMENT_FIELDS.filter(
  ({ required }) => required,
).map(({ field }) => field);
const REQUIRED_SELLER_DOCUMENT_TYPE_SET = new Set<string>(REQUIRED_SELLER_DOCUMENT_TYPES);

function documentUrl(fileName: string): string {
  if (/^https?:\/\//i.test(fileName)) return fileName;
  const path = fileName.replace(/^\/+/, '');
  const uploadPath = path.startsWith('uploads/') ? path : `uploads/${path}`;
  return `/${uploadPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

function mapSellerDocuments(
  value: Record<string, unknown>,
  recordDocumentId: number | undefined,
): SellerVerificationDocument[] {
  const hasDocumentFields = SELLER_DOCUMENT_FIELDS.some(({ field }) => field in value);
  if (!hasDocumentFields) return mapDocuments(value['SUBMITTED_DOCUMENTS'], recordDocumentId);

  return SELLER_DOCUMENT_FIELDS.map(({ field, statusField, name, required }) => {
    const rawFileName = value[field];
    const fileName = typeof rawFileName === 'string' ? rawFileName.trim() : '';
    const fieldStatus =
      value[statusField] ??
      value[`${field}_DOCUMENT_VERIFICATION_STATUS`] ??
      value[`${field}_VERIFICATION_STATUS`] ??
      value[`${field}_STATUS`];
    const fieldReason =
      value[`${field}_REJECTION_REASON`] ??
      value[`${field}_DOCUMENT_REJECTION_REASON`] ??
      value[`${field}_REMARKS`];
    const rejectionReason =
      typeof fieldReason === 'string' && fieldReason.trim()
        ? fieldReason.trim()
        : mapDocumentRejectionReason(value);
    const status =
      fieldStatus === undefined || fieldStatus === null
        ? !required && !fileName
          ? undefined
          : 'Pending'
        : mapStatus(fieldStatus);
    return {
      name,
      fileName: fileName || 'Not Available',
      url: fileName ? documentUrl(fileName) : '',
      required,
      ...(recordDocumentId !== undefined ? { documentId: recordDocumentId } : {}),
      proofType: field,
      ...(status ? { status } : {}),
      ...(rejectionReason ? { rejectionReason } : {}),
    };
  });
}

function mapSeller(value: unknown): SellerVerificationRecord {
  if (!isRecord(value)) throw new Error('The seller verification API returned an invalid seller.');
  const sellerId = Number(value['SELLER_ID']);
  const id = Number(value['VERIFICATION_ID'] ?? sellerId);
  if (!Number.isSafeInteger(sellerId) || sellerId <= 0) {
    throw new Error('The seller verification API returned a seller with an invalid SELLER_ID.');
  }
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new Error('The seller verification API returned a seller with an invalid ID.');
  }
  const documentId = Number(value['DOCUMENT_ID']);
  const bankDetailId = Number(value['BANK_DETAIL_ID']);
  const rawSellerStatus = value['SELLER_STATUS'];
  const verificationStatus = mapStatus(
    rawSellerStatus ??
      value['SELLER_APPROVAL_STATUS'] ??
      value['APPROVAL_STATUS'] ??
      value['SELLER_VERIFICATION_STATUS'] ??
      value['VERIFICATION_STATUS'] ??
      value['STATUS'],
  );
  const sellerStatus = rawSellerStatus === 'ACTIVE' ? 'Approved' : verificationStatus;
  const documentVerificationStatus = mapStatus(
    value['DOCUMENT_VERIFICATION_STATUS'] ?? value['DOCUMENT_STATUS'],
  );
  return {
    id,
    sellerId,
    ...(Number.isSafeInteger(documentId) && documentId > 0 ? { documentId } : {}),
    ...(Number.isSafeInteger(bankDetailId) && bankDetailId > 0 ? { bankDetailId } : {}),
    sellerName: text(value, 'SELLER_NAME'),
    businessName: text(value, 'BUSINESS_NAME'),
    businessType: text(value, 'BUSINESS_TYPE'),
    sellerCode: text(value, 'SELLER_CODE'),
    email: text(value, 'EMAIL'),
    mobile: text(value, 'MOBILE_NUMBER'),
    gstNumber: text(value, 'GST_NUMBER'),
    panNumber: text(value, 'PAN_NUMBER'),
    status: sellerStatus,
    documentVerificationStatus,
    remarks: text(value, 'VERIFICATION_REMARKS', ''),
    documents: mapSellerDocuments(
      value,
      Number.isSafeInteger(documentId) && documentId > 0 ? documentId : undefined,
    ),
  };
}

function mapActionResponse(
  response: unknown,
  entity: 'Document' | 'Seller',
  action: 'approval' | 'rejection',
): string {
  if (response === null || response === undefined) {
    return `${entity} ${action} completed successfully.`;
  }
  if (typeof response === 'string') {
    const normalized = response.trim().toUpperCase();
    if (['SUCCESS', 'OK', '200', '201'].includes(normalized)) {
      return `${entity} ${action} completed successfully.`;
    }
    throw new Error(response.trim() || `${entity} ${action} failed.`);
  }
  if (!isRecord(response)) {
    throw new Error(`The ${entity.toLowerCase()} ${action} API returned an invalid response.`);
  }

  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  const data = response['data'] ?? response['DATA'];
  const dataSuccess = isRecord(data) ? (data['SUCCESS'] ?? data['SUCCES']) : undefined;
  const successfulStatus =
    status === undefined ||
    status === true ||
    ((typeof status === 'string' || typeof status === 'number') &&
      ['SUCCESS', 'OK', '200', '201'].includes(String(status).trim().toUpperCase()));
  const failedData =
    dataSuccess !== undefined &&
    (dataSuccess === false ||
      (typeof dataSuccess === 'string' &&
        !['SUCCESS', 'SUCCES', 'TRUE', '1'].includes(dataSuccess.trim().toUpperCase())));
  if (
    !successfulStatus ||
    failedData ||
    response['success'] === false ||
    response['SUCCESS'] === false
  ) {
    throw new Error(
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `${entity} ${action} failed.`,
    );
  }
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : `${entity} ${action} completed successfully.`;
}

/** Accepts both `{ status: 'SUCCESS' }` and `{ success: true }` envelopes; throws the backend message otherwise. */
function assertSuccessfulEnvelope(response: Record<string, unknown>, fallback: string): void {
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
    throw new Error(typeof message === 'string' && message.trim() ? message.trim() : fallback);
  }
}

function mapResponse(response: unknown, limit: number, offset: number): SellerVerificationPage {
  if (!isRecord(response)) {
    throw new Error('The seller verification API returned an invalid response.');
  }
  assertSuccessfulEnvelope(response, 'Seller details could not be loaded.');
  const data = response['data'] ?? response['DATA'];
  if (!Array.isArray(data)) {
    throw new Error('The seller verification API returned an invalid response.');
  }
  const items = data.map(mapSeller);
  const metadataSources = [
    isRecord(response['pagination']) ? response['pagination'] : undefined,
    isRecord(response['meta']) ? response['meta'] : undefined,
    response,
  ].filter((source): source is Record<string, unknown> => source !== undefined);
  const totalKeys = [
    'total',
    'totalRecords',
    'total_records',
    'totalCount',
    'total_count',
    'totalItems',
    'total_items',
  ];
  let total: number | undefined;
  for (const source of metadataSources) {
    const rawTotal = totalKeys
      .map((key) => source[key])
      .find((value) => value !== undefined && value !== null);
    if (rawTotal !== undefined) {
      const parsed =
        typeof rawTotal === 'number' || typeof rawTotal === 'string' ? Number(rawTotal) : NaN;
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error('The seller verification API returned invalid pagination metadata.');
      }
      total = parsed;
      break;
    }
  }
  return {
    items,
    ...(total !== undefined ? { total } : {}),
    hasNext: total !== undefined ? offset + items.length < total : items.length === limit,
  };
}

function mapDetailResponse(response: unknown, sellerId: number): SellerVerificationRecord | null {
  if (!isRecord(response)) {
    throw new Error('The seller verification API returned an invalid response.');
  }
  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  if (
    status !== undefined &&
    status !== true &&
    !(
      typeof status === 'string' &&
      ['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase())
    )
  ) {
    throw new Error(typeof message === 'string' ? message : 'Seller details could not be loaded.');
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined || (Array.isArray(data) && data.length === 0))
    return null;
  const entries = Array.isArray(data) ? data : [data];
  const selected = entries.map(mapSeller).find((seller) => seller.sellerId === sellerId);
  return selected ?? null;
}

function toCount(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value.trim())
        : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function mapSummaryResponse(response: unknown): SellerSummary {
  if (!isRecord(response)) {
    throw new Error('The seller summary API returned an invalid response.');
  }
  const status = response['status'] ?? response['STATUS'];
  const message = response['message'] ?? response['MESSAGE'];
  if (
    status !== undefined &&
    status !== true &&
    !(
      typeof status === 'string' &&
      ['SUCCESS', 'OK', '200', '201'].includes(status.trim().toUpperCase())
    )
  ) {
    throw new Error(typeof message === 'string' ? message : 'Seller summary could not be loaded.');
  }
  const data = response['data'] ?? response['DATA'];
  if (!isRecord(data)) {
    throw new Error('The seller summary API returned an invalid response.');
  }
  return {
    total: toCount(data['TOTAL_SELLER']),
    pending: toCount(data['PENDING_VERIFICATION']),
    approved: toCount(data['APPROVED_SELLERS']),
    rejected: toCount(data['REJECTED_SELLERS']),
  };
}

function mapDateFilters(response: unknown): DateFilterOption[] {
  if (!isRecord(response)) {
    throw new Error('The date filter API returned an invalid response.');
  }
  assertSuccessfulEnvelope(response, 'Date filters could not be loaded.');
  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) {
    throw new Error('The date filter API returned an invalid response.');
  }
  const seen = new Set<number>();
  const options: DateFilterOption[] = [];
  for (const item of data) {
    if (!isRecord(item)) continue;
    const id = Number(item['DATE_FILTER_ID']);
    const days = Number(item['DAYS']);
    const label = text(item, 'FILTER_NAME', '');
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      !Number.isSafeInteger(days) ||
      days <= 0 ||
      !label ||
      seen.has(id)
    ) {
      continue;
    }
    seen.add(id);
    options.push({ id, label, days });
  }
  return options;
}

function requestErrorMessage(error: unknown, subject: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error;
    if (isRecord(body)) {
      const message = body['message'] ?? body['MESSAGE'] ?? body['error'] ?? body['ERROR'];
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
    return error.status
      ? `${subject} could not be loaded (HTTP ${error.status}).`
      : `${subject} could not be loaded. Check your connection and try again.`;
  }
  return error instanceof Error
    ? error.message
    : `${subject} could not be loaded. Please try again.`;
}

@Injectable({ providedIn: 'root' })
export class SellerVerificationService {
  private readonly api = inject(ApiService);

  approveDocument(payload: DocumentVerificationApprovePayload): Observable<string> {
    this.validateDocumentAction(payload);
    return this.api
      .put<unknown>(API_ENDPOINTS.documentVerification.approve, payload)
      .pipe(map((response) => mapActionResponse(response, 'Document', 'approval')));
  }

  rejectDocument(payload: DocumentVerificationRejectPayload): Observable<string> {
    this.validateDocumentAction(payload);
    if (!payload.REJECTION_REASON.trim()) {
      throw new RangeError('A rejection reason is required.');
    }
    return this.api
      .put<unknown>(API_ENDPOINTS.documentVerification.reject, {
        ...payload,
        REJECTION_REASON: payload.REJECTION_REASON.trim(),
      })
      .pipe(map((response) => mapActionResponse(response, 'Document', 'rejection')));
  }

  updateSellerDecision(payload: SellerDecisionPayload): Observable<string> {
    if (!Number.isSafeInteger(payload.SELLER_ID) || payload.SELLER_ID <= 0) {
      throw new RangeError('A valid seller ID is required.');
    }
    if (!['APPROVED', 'REJECTED'].includes(payload.DECISION)) {
      throw new RangeError('A valid seller decision is required.');
    }
    if (!Number.isSafeInteger(payload.UPDATED_BY) || payload.UPDATED_BY <= 0) {
      throw new RangeError('A valid updated-by ID is required.');
    }
    return this.api
      .put<unknown>(API_ENDPOINTS.sellerVerification.updateDecision, payload)
      .pipe(
        map((response) =>
          mapActionResponse(
            response,
            'Seller',
            payload.DECISION === 'APPROVED' ? 'approval' : 'rejection',
          ),
        ),
      );
  }

  private validateDocumentAction(payload: DocumentVerificationApprovePayload): void {
    if (!Number.isSafeInteger(payload.DOCUMENT_ID) || payload.DOCUMENT_ID <= 0) {
      throw new RangeError('A valid document ID is required.');
    }
    if (
      !payload.PROOF_TYPE.trim() ||
      !Number.isSafeInteger(payload.UPDATED_BY) ||
      payload.UPDATED_BY <= 0
    ) {
      throw new RangeError('A valid proof type and updated-by ID are required.');
    }
  }

  getSellers(
    page: number,
    limit: number,
    days?: number,
    businessTypeId = -1,
    documentVerificationStatus = 'PENDING',
  ): Observable<SellerVerificationPage> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError('Page and page size must be positive safe integers.');
    }
    if (days !== undefined && (!Number.isSafeInteger(days) || days < 1)) {
      throw new RangeError('The date filter must be a positive number of days.');
    }
    if (!Number.isSafeInteger(businessTypeId) || businessTypeId < -1) {
      throw new RangeError('The business type ID must be -1 or a positive safe integer.');
    }
    const status = documentVerificationStatus.trim().toUpperCase();
    if (!status) {
      throw new RangeError('A document verification status is required.');
    }
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset))
      throw new RangeError('The requested page offset is outside the supported range.');
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerVerification.get, {
        BUSINESS_TYPE_ID: businessTypeId,
        SELLER_ID: -1,
        DOCUMENT_VERIFICATION_STATUS: status,
        ...(days !== undefined ? { DAYS: days } : {}),
        LIMIT: limit,
        OFFSET: offset,
      })
      .pipe(map((response) => mapResponse(response, limit, offset)));
  }

  getSellerDetails(sellerId: number): Observable<SellerVerificationRecord | null> {
    if (!Number.isSafeInteger(sellerId) || sellerId <= 0) {
      throw new RangeError('Seller ID must be a positive safe integer.');
    }
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerVerification.get, { SELLER_ID: sellerId })
      .pipe(map((response) => mapDetailResponse(response, sellerId)));
  }

  getSummary(days: number): Observable<SellerSummary> {
    if (!Number.isSafeInteger(days) || days < 1) {
      throw new RangeError('The dashboard date filter must be a positive number of days.');
    }

    return this.api
      .get<unknown>(API_ENDPOINTS.sellerDashboard.summary, { DAYS: days })
      .pipe(map((response) => mapSummaryResponse(response)));
  }

  getDateFilters(): Observable<DateFilterOption[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.dateFilter.get, { DATE_FILTER_ID: -1 })
      .pipe(map((response) => mapDateFilters(response)));
  }

  getStatuses(): Observable<StatusOption[]> {
    return this.api.getStatuses();
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body)) {
        const message = body['message'] ?? body['MESSAGE'] ?? body['error'] ?? body['ERROR'];
        if (typeof message === 'string' && message.trim()) return message.trim();
      }
      return error.status
        ? `Seller details could not be loaded (HTTP ${error.status}).`
        : 'Seller details could not be loaded. Check your connection and try again.';
    }
    return error instanceof Error
      ? error.message
      : 'Seller details could not be loaded. Please try again.';
  }

  getSummaryErrorMessage(error: unknown): string {
    return requestErrorMessage(error, 'Seller summary');
  }

  getDateFilterErrorMessage(error: unknown): string {
    return requestErrorMessage(error, 'Date filters');
  }

  getStatusErrorMessage(error: unknown): string {
    return requestErrorMessage(error, 'Statuses');
  }

  getActionErrorMessage(
    error: unknown,
    action: 'approval' | 'rejection',
    entity: 'Document' | 'Seller' = 'Document',
  ): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body)) {
        const message = body['message'] ?? body['MESSAGE'] ?? body['error'] ?? body['ERROR'];
        if (typeof message === 'string' && message.trim()) return message.trim();
      }
      return error.status
        ? `${entity} ${action} failed (HTTP ${error.status}).`
        : `${entity} ${action} failed. Check your connection and try again.`;
    }
    return error instanceof Error ? error.message : `${entity} ${action} failed. Please try again.`;
  }
}
