import { formatCurrency, formatDate } from '@angular/common';
import { Injectable, LOCALE_ID, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { API_ENDPOINTS } from '@core/constants/api-endpoints';
import { ApiService } from '@core/services/api.service';
import { shippingStatusLabel } from '@features/orders/services/order.service';
import type { BadgeTone } from '@shared/components/badge/badge';
import { RefundDetail } from '@shared/models';
import { RefundStatement, drawRefundStatement } from './refund-statement-pdf';
// CHANGED: the demo refund (data/refunds.ts) is removed; the Refund screen reads GET refund (getRefunds).

const REFUND_SUCCESS_VALUES = ['SUCCESS', 'OK', '200', '201', 'TRUE', '1'];
const REFUNDS_DEFAULT_ERROR = 'Refund details could not be loaded.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Trimmed text of a string or number field; null when absent or empty. */
function text(value: unknown): string | null {
  return (typeof value === 'string' || typeof value === 'number') && String(value).trim() ? String(value).trim() : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveId(value: unknown): number | null {
  const id = optionalNumber(value);
  return id !== null && Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** A non-negative amount ("3000.00"), or null when the API leaves it out or sends something that is not one. */
function amount(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function validDate(value: unknown): string | null {
  const date = text(value);
  return date && Number.isFinite(Date.parse(date)) ? date : null;
}

/** True when the row does not send this ID, or sends this one. */
function sameIdWhenSent(value: unknown, wanted: number): boolean {
  return value === undefined || value === null || value === '' || positiveId(value) === wanted;
}

/**
 * One refund row, or null when it is not a refund of this order line for this customer. ORDER_NUMBER and ORDER_ID
 * are required and must be the ones asked for, so a refund of another order, or of another product of the same order,
 * is never shown. CUSTOMER_ID, when sent, must be the signed-in customer's. A row without a REFUND_ID or RETURN_ID
 * cannot be told apart from another refund, so it is left out too.
 */
function mapRefundRow(value: unknown, orderNumber: string, orderId: number, customerId: number): RefundDetail | null {
  if (!isRecord(value)) return null;
  if (text(value['ORDER_NUMBER']) !== orderNumber || positiveId(value['ORDER_ID']) !== orderId) return null;
  if (!sameIdWhenSent(value['CUSTOMER_ID'], customerId)) return null;
  const refundId = positiveId(value['REFUND_ID']);
  const returnId = positiveId(value['RETURN_ID']);
  if (refundId === null && returnId === null) return null;

  const returnStatusId = positiveId(value['RETURN_STATUS']);
  return {
    refundId,
    orderNumber,
    orderId,
    returnId,
    returnNumber: text(value['RETURN_NUMBER']),
    productId: positiveId(value['PRODUCT_ID']),
    productName: text(value['PRODUCT_NAME']),
    variantId: positiveId(value['VARIANT_ID']),
    variantName: text(value['VARIANT_NAME']),
    amount: amount(value['REFUND_AMOUNT']),
    methodId: positiveId(value['REFUND_METHOD']),
    methodName: text(value['REFUND_METHOD_NAME']),
    reference: text(value['REFUND_REFERENCE']),
    date: validDate(value['REFUND_DATE']),
    status: text(value['REFUND_STATUS']),
    returnStatusId,
    // RETURN_STATUS is an ID (24); an API that sends the name there instead still has it shown.
    returnStatusName: text(value['RETURN_STATUS_NAME']) ?? (returnStatusId === null ? text(value['RETURN_STATUS']) : null),
  };
}

/** Identifies one refund: its REFUND_ID, else its return request and the returned product and variant. */
export function refundKey(refund: RefundDetail): string {
  return refund.refundId !== null
    ? `refund:${refund.refundId}`
    : `return:${refund.returnId}|${refund.productId ?? ''}|${refund.variantId ?? ''}`;
}

/**
 * GET refund's `{ STATUS, MESSAGE, DATA }`: the refunds of this order line, in API order, each once. A failed STATUS
 * throws the API's MESSAGE; no DATA is no refund yet.
 */
function mapRefundsResponse(response: unknown, orderNumber: string, orderId: number, customerId: number): RefundDetail[] {
  if (!isRecord(response)) throw new Error('The refund API returned an invalid response.');
  const status = response['status'] ?? response['STATUS'];
  const success = response['success'] ?? response['SUCCESS'];
  const succeeded = (value: unknown): boolean =>
    value === undefined ||
    value === true ||
    value === 1 ||
    value === 200 ||
    (typeof value === 'string' && REFUND_SUCCESS_VALUES.includes(value.trim().toUpperCase()));
  if (status === undefined && success === undefined) throw new Error('The refund API returned an invalid response.');
  if (!succeeded(status) || !succeeded(success)) {
    throw new Error(text(response['message'] ?? response['MESSAGE']) ?? REFUNDS_DEFAULT_ERROR);
  }

  const data = response['data'] ?? response['DATA'];
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) throw new Error('The refund API returned an invalid refund list.');

  const seen = new Set<string>();
  const refunds: RefundDetail[] = [];
  for (const row of data) {
    const refund = mapRefundRow(row, orderNumber, orderId, customerId);
    if (!refund) continue;
    const key = refundKey(refund);
    if (seen.has(key)) continue;
    seen.add(key);
    refunds.push(refund);
  }
  return refunds;
}

/** A status as one key: "Refund Processed" / "refund_processed" -> " REFUND PROCESSED ". */
function statusWords(status: string): string {
  return ` ${status.toUpperCase().replace(/[^A-Z]+/g, ' ').trim()} `;
}

/** Where one status sits in REFUND_STEPS (see refundStage); undefined when it does not say. */
function statusStage(status: string | null): number | null | undefined {
  if (!status) return undefined;
  const key = statusWords(status);
  if (/ (REJECT\w*|FAIL\w*|CANCEL\w*|DECLIN\w*) /.test(key)) return null;
  if (/ (REFUNDED|CREDITED|COMPLETED?|SUCCESS\w*|PAID|SETTLED) /.test(key)) return 4;
  if (/ (PROCESS\w*|INITIATED|PROGRESS) /.test(key)) return 3;
  if (/ APPROVED? /.test(key)) return 2;
  if (/ (RECEIVED|PICKED|INSPECT\w*) /.test(key)) return 1;
  if (/ (PENDING|REQUEST\w*|NEW|RETURN) /.test(key)) return 0;
  return undefined;
}

/**
 * Where a refund is in the Refund screen's lifecycle: 0 return requested, 1 item received, 2 refund approved,
 * 3 refund processed, 4 amount credited. Read from REFUND_STATUS and RETURN_STATUS_NAME (the further of the two);
 * null when either says the refund ended without one (rejected, failed, cancelled). 0 when neither says.
 */
export function refundStage(refund: Pick<RefundDetail, 'status' | 'returnStatusName'>): number | null {
  const stages = [statusStage(refund.status), statusStage(refund.returnStatusName)];
  if (stages.includes(null)) return null;
  return Math.max(0, ...stages.filter((stage): stage is number => stage !== undefined));
}

/** The last lifecycle stage: the amount is credited. */
// CHANGED (new): shared by the Refund page and the statement.
export const REFUND_CREDITED_STAGE = 4;

/** A status for display ("REFUNDED" -> "Refunded"), '' when there is none. */
export function refundStatusLabel(status: string | null): string {
  return status ? shippingStatusLabel(status) : '';
}

/** The refund's colour: success once credited, danger when it ended without one, warning while in progress. */
// CHANGED (new): moved from the Refund page, so the page (a BadgeTone) and the statement agree.
export function refundTone(
  refund: Pick<RefundDetail, 'status' | 'returnStatusName'>,
): Extract<BadgeTone, 'success' | 'warning' | 'danger'> {
  const stage = refundStage(refund);
  return stage === null ? 'danger' : stage === REFUND_CREDITED_STAGE ? 'success' : 'warning';
}

/** A file-name-safe part ("ORD 0020/1" -> "ORD-0020-1"). */
function fileNamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

@Injectable({ providedIn: 'root' })
export class RefundService {
  private readonly api = inject(ApiService);
  private readonly locale = inject(LOCALE_ID);

  /**
   * The refunds of one product of an order: GET refund `?ORDER_NUMBER=…&ORDER_ID=…`, where ORDER_ID is that product's
   * order line (customer_orders/get ORDER_ID). The access token identifies the customer; customerId (the signed-in
   * customer) is used to leave out any row of another customer. Only rows of this ORDER_NUMBER and ORDER_ID are kept.
   */
  // CHANGED (new): replaces find() (demo data, by return number).
  getRefunds(orderNumber: string, orderId: number, customerId: number): Observable<RefundDetail[]> {
    const wanted = orderNumber.trim();
    if (!wanted) return throwError(() => new RangeError('Order number is required.'));
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return throwError(() => new RangeError('Order ID must be a positive safe integer.'));
    }
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      return throwError(() => new RangeError('Customer ID must be a positive safe integer.'));
    }
    return this.api
      .get<unknown>(API_ENDPOINTS.refunds.get, { ORDER_NUMBER: wanted, ORDER_ID: orderId })
      .pipe(map((response) => mapRefundsResponse(response, wanted, orderId, customerId)));
  }

  /**
   * What the refund statement shows, formatted: the order, the total of the credited refunds, and one record per
   * refund (order, return number, product, variant, amount, method, reference, date, status), in the page's order. A
   * value the API did not send is "Not available". Amounts are "INR 3,000.00" (the PDF's built-in font has no "₹").
   */
  // CHANGED: the content of the PDF statement, for every refund shown (it was the plain-text statement of one refund).
  statementFor(refunds: readonly RefundDetail[], generatedOn = new Date()): RefundStatement {
    const missing = 'Not available';
    const money = (value: number): string => formatCurrency(value, this.locale, 'INR ', 'INR', '1.2-2');
    const credited = refunds.filter((refund) => refund.amount !== null && refundStage(refund) === REFUND_CREDITED_STAGE);
    return {
      orderNumber: refunds[0]?.orderNumber ?? missing,
      generatedOn: formatDate(generatedOn, 'dd MMM y', this.locale),
      totalRefunded: money(credited.reduce((sum, refund) => sum + (refund.amount ?? 0), 0)),
      records: refunds.map((refund, index) => {
        const status = refundStatusLabel(refund.status);
        const tone = refundTone(refund);
        const position = refunds.length > 1 ? `Refund ${index + 1} of ${refunds.length}` : 'Refund';
        return {
          title: refund.returnNumber ? `${position} · Return ${refund.returnNumber}` : position,
          status,
          tone,
          rows: [
            { label: 'Order No.', value: refund.orderNumber },
            { label: 'Return No.', value: refund.returnNumber ?? missing },
            {
              label: 'Product',
              value: refund.productName ?? (refund.productId !== null ? `Product #${refund.productId}` : missing),
            },
            { label: 'Variant', value: refund.variantName ?? missing },
            { label: 'Refund Amount', value: refund.amount !== null ? money(refund.amount) : missing, strong: true },
            { label: 'Refund Method', value: refund.methodName ?? missing },
            { label: 'Refund Reference', value: refund.reference ?? missing },
            { label: 'Refund Date', value: refund.date ? formatDate(refund.date, 'dd MMM y', this.locale) : missing },
            { label: 'Refund Status', value: status || missing, ...(status ? { tone } : {}) },
          ],
        };
      }),
    };
  }

  /**
   * The refund statement as a PDF (A4) of these refunds. jsPDF is loaded on first use, so it is not part of the
   * page's own download.
   */
  // CHANGED (new): "Download Refund Statement" saves a PDF (it was a .txt file).
  async statementPdf(refunds: readonly RefundDetail[], generatedOn = new Date()): Promise<Blob> {
    if (!refunds.length) throw new RangeError('A refund statement needs at least one refund.');
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    drawRefundStatement(doc, this.statementFor(refunds, generatedOn));
    return doc.output('blob');
  }

  /** "refund-statement-RTN0025.pdf" for one refund; "refund-statement-ORD0020.pdf" for several (or no return number). */
  // CHANGED (new)
  statementFileName(refunds: readonly RefundDetail[]): string {
    const [first] = refunds;
    const name = refunds.length === 1 && first.returnNumber ? first.returnNumber : (first?.orderNumber ?? '');
    const part = fileNamePart(name);
    return part ? `refund-statement-${part}.pdf` : 'refund-statement.pdf';
  }
}
