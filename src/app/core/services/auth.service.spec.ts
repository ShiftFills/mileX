import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { STORAGE_KEYS } from '../constants/storage-keys';
import { API_BASE_URL } from '../config/api.config';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { ApiService } from './api.service';
import { AuthService, CustomerRegistrationPayload } from './auth.service';

describe('AuthService', () => {
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
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api' },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts dynamic login credentials, persists the returned session, and keeps login unauthenticated', () => {
    let message: string | undefined;
    service.setSession(
      { id: 'old-user', email: '', firstName: 'Old', lastName: '' },
      'old-token',
    );
    service.login('  dhiya_seller ', 'Seller@123').subscribe((result) => (message = result));

    const request = http.expectOne('https://api.example.test/api/user/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      USER_NAME: 'dhiya_seller',
      USER_PASSWORD: 'Seller@123',
    });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({
      status: 'SUCCESS',
      message: 'Login successful',
      data: {
        USER_ID: 8,
        USER_NAME: 'dhiya_seller',
        USER_TYPE: 'SELLER',
        USER_TYPE_ID: 1,
        ACCESSTOKEN: 'access-token-returned-by-api',
      },
    });

    expect(message).toBe('Login successful');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()).toMatchObject({
      id: '8',
      userName: 'dhiya_seller',
      userType: 'SELLER',
      userTypeId: 1,
    });
    expect(service.token()).toBe('access-token-returned-by-api');
    expect(localStorage.getItem(STORAGE_KEYS.user)).toContain('"id":"8"');
    expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBe(
      '"access-token-returned-by-api"',
    );
  });

  it('attaches the stored access token to all API HTTP methods', () => {
    service.setSession(
      { id: '8', email: '', firstName: 'dhiya_seller', lastName: '' },
      'access-token-returned-by-api',
    );
    const api = TestBed.inject(ApiService);
    api.get('/get').subscribe();
    api.post('/post', {}).subscribe();
    api.put('/put', {}).subscribe();
    api.delete('/delete').subscribe();

    for (const [url, method] of [
      ['https://api.example.test/api/get', 'GET'],
      ['https://api.example.test/api/post', 'POST'],
      ['https://api.example.test/api/put', 'PUT'],
      ['https://api.example.test/api/delete', 'DELETE'],
    ] as const) {
      const request = http.expectOne(url);
      expect(request.request.method).toBe(method);
      expect(request.request.headers.has('Authorization')).toBe(true);
      request.flush({});
    }
  });

  it('rejects unsuccessful or incomplete login responses without storing a session', () => {
    let failure: unknown;
    service.login('wrong-user', 'wrong-password').subscribe({
      error: (error: unknown) => (failure = error),
    });

    http
      .expectOne('https://api.example.test/api/user/login')
      .flush({ status: 'FAILURE', message: 'Invalid credentials.' });

    expect(failure).toEqual(new Error('Invalid credentials.'));
    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  it('clears persisted authentication data after a protected API request returns 401', () => {
    service.setSession(
      { id: '8', email: '', firstName: 'dhiya_seller', lastName: '' },
      'access-token-returned-by-api',
    );
    let failure: unknown;
    TestBed.inject(ApiService).get('/protected').subscribe({
      error: (error: unknown) => (failure = error),
    });

    const request = http.expectOne('https://api.example.test/api/protected');
    expect(request.request.headers.has('Authorization')).toBe(true);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
  });

  it('posts the typed customer payload to the registration endpoint', () => {
    let message: string | undefined;
    service.registerCustomer(payload).subscribe((result) => (message = result));

    const request = http.expectOne(
      'https://api.example.test/api/customer_registration/insert',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(payload);
    request.flush({ STATUS: 'SUCCESS', MESSAGE: 'Customer registered.' });

    expect(message).toBe('Customer registered.');
  });

  it('rejects backend-declared registration failures returned with HTTP success', () => {
    let error: unknown;
    service.registerCustomer(payload).subscribe({
      error: (result: unknown) => (error = result),
    });

    http
      .expectOne((request) => request.url.endsWith('/customer_registration/insert'))
      .flush({ STATUS: 'FAILURE', MESSAGE: 'Email is already registered.' });

    expect(error).toEqual(new Error('Email is already registered.'));
  });

  it('uses a fallback success message when the endpoint returns an empty success body', () => {
    let message: string | undefined;
    service.registerCustomer(payload).subscribe((result) => (message = result));
    http
      .expectOne((request) => request.url.endsWith('/customer_registration/insert'))
      .flush(null);

    expect(message).toBe('Your account was created successfully.');
  });

  it('extracts backend validation messages from HTTP error responses', () => {
    const error = new HttpErrorResponse({
      status: 409,
      error: {
        errors: {
          EMAIL: ['Email is already registered.'],
          USER_NAME: ['Username is taken.'],
        },
      },
    });

    expect(service.getErrorMessage(error)).toBe(
      'Email is already registered. Username is taken.',
    );
  });
});
