import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';

export type SellerVerificationStatus = 'Pending' | 'Approved' | 'Rejected';

export interface SellerVerificationDocument {
  name: string;
  fileName: string;
  url: string;
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
  remarks: string;
  documents: SellerVerificationDocument[];
}

export interface SellerVerificationPage {
  items: SellerVerificationRecord[];
  total?: number;
  hasNext: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(record: Record<string, unknown>, key: string, fallback = '—'): string {
  const value = record[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() || fallback : fallback;
}

function mapStatus(value: unknown): SellerVerificationStatus {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized === 'APPROVED') return 'Approved';
  if (normalized === 'REJECTED') return 'Rejected';
  return 'Pending';
}

function mapDocuments(value: unknown): SellerVerificationDocument[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((document) => ({
    name: text(document, 'DOCUMENT_NAME', text(document, 'NAME', 'Submitted document')),
    fileName: text(document, 'FILE_NAME', text(document, 'DOCUMENT_FILE_NAME', '—')),
    url: text(document, 'FILE_URL', text(document, 'DOCUMENT_URL', '')),
  }));
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
    status: mapStatus(value['VERIFICATION_STATUS']),
    remarks: text(value, 'VERIFICATION_REMARKS', ''),
    documents: mapDocuments(value['SUBMITTED_DOCUMENTS']),
  };
}

function mapResponse(response: unknown, limit: number, offset: number): SellerVerificationPage {
  if (!isRecord(response) || !Array.isArray(response['data'])) {
    throw new Error('The seller verification API returned an invalid response.');
  }
  if (typeof response['status'] === 'string' && response['status'].toUpperCase() !== 'SUCCESS') {
    throw new Error(typeof response['message'] === 'string' ? response['message'] : 'Seller details could not be loaded.');
  }
  const items = response['data'].map(mapSeller);
  const data = response['data'];
  const metadataSources = [
    isRecord(response['pagination']) ? response['pagination'] : undefined,
    isRecord(response['meta']) ? response['meta'] : undefined,
    response,
  ].filter((source): source is Record<string, unknown> => source !== undefined);
  const totalKeys = ['total', 'totalRecords', 'total_records', 'totalCount', 'total_count', 'totalItems', 'total_items'];
  let total: number | undefined;
  for (const source of metadataSources) {
    const rawTotal = totalKeys.map((key) => source[key]).find((value) => value !== undefined && value !== null);
    if (rawTotal !== undefined) {
      const parsed = typeof rawTotal === 'number' || typeof rawTotal === 'string' ? Number(rawTotal) : NaN;
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

@Injectable({ providedIn: 'root' })
export class SellerVerificationService {
  private readonly api = inject(ApiService);

  getSellers(page: number, limit: number): Observable<SellerVerificationPage> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError('Page and page size must be positive safe integers.');
    }
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(offset)) throw new RangeError('The requested page offset is outside the supported range.');
    return this.api
      .get<unknown>(API_ENDPOINTS.sellerVerification.get, { LIMIT: limit, OFFSET: offset })
      .pipe(map((response) => mapResponse(response, limit, offset)));
  }

  getErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body = error.error;
      if (isRecord(body) && typeof body['message'] === 'string') return body['message'];
      return error.status
        ? `Seller details could not be loaded (HTTP ${error.status}).`
        : 'Seller details could not be loaded. Check your connection and try again.';
    }
    return error instanceof Error ? error.message : 'Seller details could not be loaded. Please try again.';
  }
}
