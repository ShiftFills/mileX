import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { PaymentMethodService } from '@core/services/payment-method.service';


const URL = 'https://api.example.test/api/payment_method/get';

const AUDIT = {
  CREATED_AT: '2026-11-13T02:32:29.000Z',
  CREATED_BY: null,
  UPDATED_AT: '2026-11-13T02:32:29.000Z',
  UPDATED_BY: null,
};

const SAMPLE_RESPONSE = {
  success: true,
  message: 'Payment methods fetched successfully',
  data: [
    { PAYMENT_METHOD_ID: 6, PAYMENT_METHOD_NAME: 'Wallet', ...AUDIT },
    { PAYMENT_METHOD_ID: 5, PAYMENT_METHOD_NAME: 'Net Banking', ...AUDIT },
    { PAYMENT_METHOD_ID: 4, PAYMENT_METHOD_NAME: 'Debit Card', ...AUDIT },
    { PAYMENT_METHOD_ID: 3, PAYMENT_METHOD_NAME: 'Credit Card', ...AUDIT },
    { PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: 'UPI', ...AUDIT },
    { PAYMENT_METHOD_ID: 1, PAYMENT_METHOD_NAME: 'Cash on Delivery', ...AUDIT },
  ],
};

describe('PaymentMethodService', () => {
  let service: PaymentMethodService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api' },
      ],
    });
    service = TestBed.inject(PaymentMethodService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** The one expected payment_method/get request: GET with PAYMENT_METHOD_ID=-1. */
  const expectRequest = () => {
    const request = http.expectOne(
      (candidate) => candidate.url === URL && candidate.params.get('PAYMENT_METHOD_ID') === '-1',
    );
    expect(request.request.method).toBe('GET');
    return request;
  };

  it('starts idle with no methods', () => {
    expect(service.status()).toBe('idle');
    expect(service.methods()).toEqual([]);
    expect(service.error()).toBe('');
  });

  it('calls payment_method/get with PAYMENT_METHOD_ID=-1 and shows loading until it answers', () => {
    service.load();
    expect(service.status()).toBe('loading');

    expectRequest().flush(SAMPLE_RESPONSE);

    expect(service.status()).toBe('success');
  });

  it('maps the API rows to the ids and names, in the order the API returned them', () => {
    service.load();
    expectRequest().flush(SAMPLE_RESPONSE);

    expect(service.methods()).toEqual([
      { PAYMENT_METHOD_ID: 6, PAYMENT_METHOD_NAME: 'Wallet' },
      { PAYMENT_METHOD_ID: 5, PAYMENT_METHOD_NAME: 'Net Banking' },
      { PAYMENT_METHOD_ID: 4, PAYMENT_METHOD_NAME: 'Debit Card' },
      { PAYMENT_METHOD_ID: 3, PAYMENT_METHOD_NAME: 'Credit Card' },
      { PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: 'UPI' },
      { PAYMENT_METHOD_ID: 1, PAYMENT_METHOD_NAME: 'Cash on Delivery' },
    ]);
    expect(service.error()).toBe('');
  });

  it('accepts a { status: "SUCCESS" } envelope too', () => {
    service.load();
    expectRequest().flush({
      status: 'SUCCESS',
      data: [{ PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: 'UPI' }],
    });

    expect(service.status()).toBe('success');
    expect(service.methods()).toEqual([{ PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: 'UPI' }]);
  });

  it('treats an empty list as a successful load with no methods', () => {
    service.load();
    expectRequest().flush({ success: true, message: 'No payment methods', data: [] });

    expect(service.status()).toBe('success');
    expect(service.methods()).toEqual([]);
    expect(service.error()).toBe('');
  });

  it('treats null data as a successful load with no methods', () => {
    service.load();
    expectRequest().flush({ success: true, data: null });

    expect(service.status()).toBe('success');
    expect(service.methods()).toEqual([]);
  });

  it('skips rows without a valid id or name and keeps a repeated id only once', () => {
    service.load();
    expectRequest().flush({
      success: true,
      data: [
        { PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: ' UPI ' },
        { PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: 'UPI again' },
        { PAYMENT_METHOD_ID: '3', PAYMENT_METHOD_NAME: 'Credit Card' },
        { PAYMENT_METHOD_ID: 0, PAYMENT_METHOD_NAME: 'Zero id' },
        { PAYMENT_METHOD_ID: -1, PAYMENT_METHOD_NAME: 'Negative id' },
        { PAYMENT_METHOD_ID: 'abc', PAYMENT_METHOD_NAME: 'Not a number' },
        { PAYMENT_METHOD_ID: 4, PAYMENT_METHOD_NAME: '   ' },
        { PAYMENT_METHOD_ID: 5 },
        'not a row',
        null,
      ],
    });

    expect(service.status()).toBe('success');
    expect(service.methods()).toEqual([
      { PAYMENT_METHOD_ID: 2, PAYMENT_METHOD_NAME: 'UPI' },
      { PAYMENT_METHOD_ID: 3, PAYMENT_METHOD_NAME: 'Credit Card' },
    ]);
  });

  it('reports the API message when the response says it failed', () => {
    service.load();
    expectRequest().flush({ success: false, message: 'Payment methods are unavailable.', data: [] });

    expect(service.status()).toBe('error');
    expect(service.error()).toBe('Payment methods are unavailable.');
    expect(service.methods()).toEqual([]);
  });

  it('uses a default message when a failed response has none', () => {
    service.load();
    expectRequest().flush({ success: false });

    expect(service.status()).toBe('error');
    expect(service.error()).toBe('Payment methods could not be loaded.');
  });

  it('rejects a response that is not a { success | status, data } envelope', () => {
    service.load();
    expectRequest().flush({ data: [{ PAYMENT_METHOD_ID: 1, PAYMENT_METHOD_NAME: 'Cash on Delivery' }] });

    expect(service.status()).toBe('error');
    expect(service.error()).toBe('The payment method API returned an invalid response.');
    expect(service.methods()).toEqual([]);
  });

  it('rejects data that is not a list', () => {
    service.load();
    expectRequest().flush({ success: true, data: { PAYMENT_METHOD_ID: 1 } });

    expect(service.status()).toBe('error');
    expect(service.error()).toBe('The payment method API returned an invalid payment method list.');
  });

  it('reports an HTTP error with the status code', () => {
    service.load();
    expectRequest().flush(null, { status: 500, statusText: 'Server Error' });

    expect(service.status()).toBe('error');
    expect(service.error()).toBe('Payment methods could not be loaded. (HTTP 500)');
    expect(service.methods()).toEqual([]);
  });

  it('reports the message from an HTTP error body', () => {
    service.load();
    expectRequest().flush(
      { message: 'Database unavailable.' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(service.status()).toBe('error');
    expect(service.error()).toBe('Database unavailable.');
  });

  it('ignores load() while a request is already running', () => {
    service.load();
    service.load();

    expectRequest().flush(SAMPLE_RESPONSE);

    expect(service.status()).toBe('success');
    expect(service.methods().length).toBe(6);
  });

  it('retries after an error and clears the error once it succeeds', () => {
    service.load();
    expectRequest().flush(null, { status: 500, statusText: 'Server Error' });
    expect(service.status()).toBe('error');

    service.load();
    expect(service.status()).toBe('loading');
    expect(service.error()).toBe('');
    expectRequest().flush(SAMPLE_RESPONSE);

    expect(service.status()).toBe('success');
    expect(service.methods().length).toBe(6);
    expect(service.error()).toBe('');
  });
});