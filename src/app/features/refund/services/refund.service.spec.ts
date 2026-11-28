import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '@core/config/api.config';
import { RefundDetail } from '@shared/models';
import { RefundService, refundStage } from './refund.service';

const REFUND_URL = '/api/refund?ORDER_NUMBER=ORD0020&ORDER_ID=37';
const CUSTOMER_ID = 1;

/** The sample row of the refund API documentation. */
const SAMPLE_ROW = {
  REFUND_ID: 12,
  ORDER_NUMBER: 'ORD0020',
  ORDER_ID: 37,
  RETURN_ID: 25,
  RETURN_NUMBER: 'RTN0025',
  PRODUCT_ID: 16,
  PRODUCT_NAME: 'Lenovo IdeaPad Slim 57',
  VARIANT_ID: 24,
  VARIANT_NAME: 'Blue Mouse',
  REFUND_AMOUNT: '3000.00',
  REFUND_METHOD: 2,
  REFUND_METHOD_NAME: 'UPI',
  REFUND_REFERENCE: 'REF0012',
  REFUND_DATE: '2026-11-27T11:30:34.000Z',
  REFUND_STATUS: 'REFUNDED',
  RETURN_STATUS: 24,
  RETURN_STATUS_NAME: 'REFUNDED',
  CUSTOMER_ID: 1,
  SELLER_ID: 49,
};

const SAMPLE_REFUND: RefundDetail = {
  refundId: 12,
  orderNumber: 'ORD0020',
  orderId: 37,
  returnId: 25,
  returnNumber: 'RTN0025',
  productId: 16,
  productName: 'Lenovo IdeaPad Slim 57',
  variantId: 24,
  variantName: 'Blue Mouse',
  amount: 3000,
  methodId: 2,
  methodName: 'UPI',
  reference: 'REF0012',
  date: '2026-11-27T11:30:34.000Z',
  status: 'REFUNDED',
  returnStatusId: 24,
  returnStatusName: 'REFUNDED',
};

function refundResponse(data: unknown): Record<string, unknown> {
  return { STATUS: 'SUCCESS', MESSAGE: 'Refund requests fetched successfully', DATA: data };
}

describe('RefundService', () => {
  let service: RefundService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: '/api' }],
    });
    service = TestBed.inject(RefundService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function load(data: unknown, response = refundResponse(data)): Promise<RefundDetail[]> {
    const result = firstValueFrom(service.getRefunds('ORD0020', 37, CUSTOMER_ID));
    http.expectOne(REFUND_URL).flush(response);
    return result;
  }

  it('asks GET refund by the order number and the order line, and maps every field of a refund', async () => {
    const result = firstValueFrom(service.getRefunds('  ORD0020 ', 37, CUSTOMER_ID));
    const request = http.expectOne(REFUND_URL);
    expect(request.request.method).toBe('GET');
    request.flush(refundResponse([SAMPLE_ROW]));

    expect(await result).toEqual([SAMPLE_REFUND]);
  });

  it('keeps only refunds of this order number, order line and customer', async () => {
    const refunds = await load([
      SAMPLE_ROW,
      { ...SAMPLE_ROW, REFUND_ID: 13, ORDER_NUMBER: 'ORD0021' },
      { ...SAMPLE_ROW, REFUND_ID: 14, ORDER_ID: 38, PRODUCT_ID: 17 },
      { ...SAMPLE_ROW, REFUND_ID: 15, ORDER_ID: undefined },
      { ...SAMPLE_ROW, REFUND_ID: 16, ORDER_NUMBER: null },
      { ...SAMPLE_ROW, REFUND_ID: 17, CUSTOMER_ID: 2 },
      'not a row',
    ]);

    expect(refunds.map((refund) => refund.refundId)).toEqual([12]);
  });

  it('keeps every return request of the product once, in API order', async () => {
    const refunds = await load([
      { ...SAMPLE_ROW, REFUND_ID: 20, RETURN_ID: 30, RETURN_NUMBER: 'RTN0030', REFUND_STATUS: 'PENDING' },
      SAMPLE_ROW,
      { ...SAMPLE_ROW, REFUND_AMOUNT: '1.00' },
      // No REFUND_ID yet: identified by its return request.
      { ...SAMPLE_ROW, REFUND_ID: null, RETURN_ID: 31, RETURN_NUMBER: 'RTN0031' },
      { ...SAMPLE_ROW, REFUND_ID: null, RETURN_ID: null },
      // A row that does not send CUSTOMER_ID is the signed-in customer's (the access token identifies them).
      { ...SAMPLE_ROW, REFUND_ID: 21, CUSTOMER_ID: undefined },
    ]);

    expect(refunds.map((refund) => [refund.refundId, refund.returnNumber])).toEqual([
      [20, 'RTN0030'],
      [12, 'RTN0025'],
      [null, 'RTN0031'],
      [21, 'RTN0025'],
    ]);
    expect(refunds[1].amount).toBe(3000);
  });

  it('leaves out what the API does not send (no amount is null, never 0)', async () => {
    const [refund] = await load([
      {
        REFUND_ID: 12, ORDER_NUMBER: 'ORD0020', ORDER_ID: '37', REFUND_AMOUNT: '', REFUND_DATE: '2026-11-31x',
        VARIANT_ID: null, RETURN_STATUS: 'PENDING',
      },
    ]);

    expect(refund).toEqual({
      ...SAMPLE_REFUND,
      returnId: null, returnNumber: null, productId: null, productName: null, variantId: null, variantName: null,
      amount: null, methodId: null, methodName: null, reference: null, date: null, status: null,
      returnStatusId: null, returnStatusName: 'PENDING',
    });
  });

  it('has no refunds when the API sends no DATA', async () => {
    expect(await load(null)).toEqual([]);
    expect(await load(undefined, { STATUS: 'SUCCESS', MESSAGE: 'No refunds' })).toEqual([]);
  });

  it("fails with the API's message when it reports a failure", async () => {
    await expect(load(null, { STATUS: 'FAILURE', MESSAGE: 'Invalid order' })).rejects.toThrow('Invalid order');
    await expect(load(null, { DATA: [] })).rejects.toThrow('The refund API returned an invalid response.');
    await expect(load({ REFUND_ID: 1 })).rejects.toThrow('The refund API returned an invalid refund list.');
  });

  it('sends no request without a valid order number, order ID or customer', async () => {
    await expect(firstValueFrom(service.getRefunds(' ', 37, CUSTOMER_ID))).rejects.toThrow('Order number is required.');
    await expect(firstValueFrom(service.getRefunds('ORD0020', 0, CUSTOMER_ID))).rejects.toThrow(RangeError);
    await expect(firstValueFrom(service.getRefunds('ORD0020', 37.5, CUSTOMER_ID))).rejects.toThrow(RangeError);
    await expect(firstValueFrom(service.getRefunds('ORD0020', 37, 0))).rejects.toThrow(RangeError);
  });

  // CHANGED: the statement is a PDF of every refund shown (it was the plain text of one refund).
  describe('refund statement', () => {
    const GENERATED_ON = new Date('2026-11-28T06:30:00.000Z');
    const second: RefundDetail = {
      ...SAMPLE_REFUND, refundId: 13, returnId: 26, returnNumber: 'RTN0026', amount: 500, reference: null,
      date: null, status: 'PROCESSING', returnStatusName: 'APPROVED',
    };

    /** The PDF's text as it is written in its (uncompressed) content streams. */
    async function pdfText(blob: Blob): Promise<string> {
      return new TextDecoder('latin1').decode(await blob.arrayBuffer());
    }

    it('formats every field of each refund, and totals the credited ones', () => {
      const statement = service.statementFor([SAMPLE_REFUND, second], GENERATED_ON);

      expect(statement.orderNumber).toBe('ORD0020');
      expect(statement.generatedOn).toBe('28 Nov 2026');
      // Only the credited refund counts: the second one is still being processed.
      expect(statement.totalRefunded).toBe('INR 3,000.00');
      expect(statement.records.map((record) => [record.title, record.status, record.tone])).toEqual([
        ['Refund 1 of 2 · Return RTN0025', 'Refunded', 'success'],
        ['Refund 2 of 2 · Return RTN0026', 'Processing', 'warning'],
      ]);
      expect(statement.records[0].rows).toEqual([
        { label: 'Order No.', value: 'ORD0020' },
        { label: 'Return No.', value: 'RTN0025' },
        { label: 'Product', value: 'Lenovo IdeaPad Slim 57' },
        { label: 'Variant', value: 'Blue Mouse' },
        { label: 'Refund Amount', value: 'INR 3,000.00', strong: true },
        { label: 'Refund Method', value: 'UPI' },
        { label: 'Refund Reference', value: 'REF0012' },
        { label: 'Refund Date', value: '27 Nov 2026' },
        { label: 'Refund Status', value: 'Refunded', tone: 'success' },
      ]);
      expect(statement.records[1].rows.filter((row) => /Reference|Date/.test(row.label))).toEqual([
        { label: 'Refund Reference', value: 'Not available' },
        { label: 'Refund Date', value: 'Not available' },
      ]);
    });

    it('titles a single refund without a count, and says what the API did not send', () => {
      const statement = service.statementFor(
        [{ ...SAMPLE_REFUND, returnNumber: null, productName: null, variantName: null, amount: null, status: null }],
        GENERATED_ON,
      );

      expect(statement.records[0].title).toBe('Refund');
      expect(statement.totalRefunded).toBe('INR 0.00');
      expect(statement.records[0].rows).toEqual(expect.arrayContaining([
        { label: 'Return No.', value: 'Not available' },
        { label: 'Product', value: 'Product #16' },
        { label: 'Variant', value: 'Not available' },
        { label: 'Refund Amount', value: 'Not available', strong: true },
        { label: 'Refund Status', value: 'Not available' },
      ]));
    });

    it('makes an A4 PDF with every refund record and its details', async () => {
      const pdf = await service.statementPdf([SAMPLE_REFUND, second], GENERATED_ON);

      expect(pdf.type).toBe('application/pdf');
      const content = await pdfText(pdf);
      expect(content.startsWith('%PDF-')).toBe(true);
      // A4 in points (jsPDF writes 595.28 × 841.89 at full precision).
      expect(content).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
      for (const text of [
        'MileX', 'Refund Statement', 'Generated on 28 Nov 2026', 'Total refunded', 'INR 3,000.00',
        'Refund 1 of 2 \xB7 Return RTN0025', 'Refund 2 of 2 \xB7 Return RTN0026', 'Lenovo IdeaPad Slim 57',
        'Blue Mouse', 'INR 500.00', 'UPI', 'REF0012', '27 Nov 2026', 'Refunded', 'Processing', 'Not available',
        'Page 1 of 1',
      ]) {
        expect(content).toContain(`(${text}) Tj`);
      }
      expect(content).toContain('/Title (MileX Refund Statement - Order ORD0020)');
    });

    it('starts a new page instead of splitting a refund, and numbers every page', async () => {
      const refunds = Array.from({ length: 5 }, (_, index) => ({
        ...SAMPLE_REFUND, refundId: 100 + index, returnNumber: `RTN01${index}`,
      }));
      const content = await pdfText(await service.statementPdf(refunds, GENERATED_ON));

      expect(content.match(/\/Type \/Page\b/g)).toHaveLength(3);
      expect(content).toContain('(Page 3 of 3) Tj');
      expect(content).toContain('(Order No. ORD0020 \\(continued\\)) Tj');
      expect(content).toContain('(Refund 5 of 5 \xB7 Return RTN014) Tj');
    });

    it('makes no statement without a refund', async () => {
      await expect(service.statementPdf([])).rejects.toThrow(RangeError);
    });

    it('names the file after the return number, or the order for several refunds', () => {
      expect(service.statementFileName([SAMPLE_REFUND])).toBe('refund-statement-RTN0025.pdf');
      expect(service.statementFileName([SAMPLE_REFUND, second])).toBe('refund-statement-ORD0020.pdf');
      expect(service.statementFileName([{ ...SAMPLE_REFUND, returnNumber: null, orderNumber: 'ORD 20/1' }]))
        .toBe('refund-statement-ORD-20-1.pdf');
    });
  });

  describe('refundStage', () => {
    const cases: [string | null, string | null, number | null][] = [
      ['REFUNDED', 'REFUNDED', 4],
      ['COMPLETED', null, 4],
      ['PROCESSING', 'APPROVED', 3],
      [null, 'APPROVED', 2],
      ['PENDING', 'RECEIVED', 1],
      ['PENDING', 'RETURN/REFUND', 0],
      [null, null, 0],
      ['SOMETHING ELSE', null, 0],
      ['PENDING', 'REJECTED', null],
      ['FAILED', 'APPROVED', null],
    ];
    for (const [status, returnStatusName, stage] of cases) {
      it(`is ${stage} for refund ${status} / return ${returnStatusName}`, () => {
        expect(refundStage({ status, returnStatusName })).toBe(stage);
      });
    }
  });
});
