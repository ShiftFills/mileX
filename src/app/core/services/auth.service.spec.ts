import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../config/api.config';
import { CustomerRegistrationPayload, AuthService } from './auth.service';

describe('AuthService customer registration', () => {
  let service: AuthService;
  let http: HttpTestingController;

  const payload: CustomerRegistrationPayload = {
    FIRST_NAME: 'John',
    LAST_NAME: 'David',
    EMAIL: 'john@gmail.com',
    MOBILE_NUMBER: '8248557413',
    USER_NAME: 'john123',
    USER_PASSWORD: 'John@123',
    CONFIRM_PASSWORD: 'John@123',
    CREATED_BY: 1,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api' },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the typed customer payload to the registration endpoint', () => {
    let message: string | undefined;
    service.registerCustomer(payload).subscribe((result) => (message = result));

    const request = http.expectOne('https://api.example.test/api/customer_registration/insert');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ STATUS: 'SUCCESS', MESSAGE: 'Customer registered.' });

    expect(message).toBe('Customer registered.');
  });

  it('rejects backend-declared registration failures returned with HTTP success', () => {
    let error: unknown;
    service.registerCustomer(payload).subscribe({ error: (result: unknown) => (error = result) });

    http.expectOne((request) => request.url.endsWith('/customer_registration/insert'))
      .flush({ STATUS: 'FAILURE', MESSAGE: 'Email is already registered.' });

    expect(error).toEqual(new Error('Email is already registered.'));
  });

  it('uses a fallback success message when the endpoint returns an empty success body', () => {
    let message: string | undefined;
    service.registerCustomer(payload).subscribe((result) => (message = result));
    http.expectOne((request) => request.url.endsWith('/customer_registration/insert')).flush(null);

    expect(message).toBe('Your account was created successfully.');
  });

  it('extracts backend validation messages from HTTP error responses', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: { errors: { EMAIL: ['Email is already registered.'], USER_NAME: ['Username is taken.'] } },
    });

    expect(service.getErrorMessage(error)).toBe('Email is already registered. Username is taken.');
  });
});
