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

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

function tokenFor(userId: number): string {
  return tokenWithClaims({ USER_ID: userId });
}

function tokenWithSubject(userId: number): string {
  return tokenWithClaims({ sub: String(userId), role: 'CUSTOMER' });
}

const LOGIN_URL = 'https://api.example.test/api/user/login';

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
    CREATED_BY: 8,
  };

  function configure(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api' },
        { provide: Router, useValue: { url: '/admin/products/all', navigate: vi.fn() } },
      ],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  }

  /** Sends one login and returns what the caller would have received. */
  function loginWith(body: unknown): { message?: string; error?: unknown } {
    const outcome: { message?: string; error?: unknown } = {};
    service.login('user', 'password').subscribe({
      next: (message) => (outcome.message = message),
      error: (error: unknown) => (outcome.error = error),
    });
    http.expectOne(LOGIN_URL).flush(body);
    return outcome;
  }

  beforeEach(() => {
    localStorage.clear();
    configure();
  });

  afterEach(() => http.verify());

  it('posts dynamic login credentials, persists the returned session, and keeps login unauthenticated', () => {
    let message: string | undefined;
    service.setSession(
      { id: 'old-user', email: '', firstName: 'Old', lastName: '' },
      'old-token',
    );
    service.login('  dhiya_seller ', 'Seller@123').subscribe((result) => (message = result));

    const request = http.expectOne(LOGIN_URL);
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
        ACCESSTOKEN: tokenFor(8),
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
    expect(service.userId()).toBe(8);
    expect(service.token()).toBe(tokenFor(8));
    expect(localStorage.getItem(STORAGE_KEYS.user)).toContain('"id":"8"');
    expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBe(
      JSON.stringify(tokenFor(8)),
    );
  });

  it('maps and persists login details returned at the response root', () => {
    let message: string | undefined;
    service.login('rahul_ocean', 'password').subscribe((result) => (message = result));

    http.expectOne(LOGIN_URL).flush({
      success: true,
      message: 'Login successful',
      USER_ID: 60,
      USER_NAME: 'rahul_ocean',
      USER_TYPE: 'SELLER',
      USER_TYPE_ID: 1,
      ACCESSTOKEN: tokenFor(60),
    });

    expect(message).toBe('Login successful');
    expect(service.user()).toMatchObject({
      id: '60',
      userName: 'rahul_ocean',
      userType: 'SELLER',
      userTypeId: 1,
    });
    expect(service.userId()).toBe(60);
    expect(service.token()).toBe(tokenFor(60));
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.user)).toContain('"id":"60"');
    expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBe(JSON.stringify(tokenFor(60)));
  });

  describe('role-specific IDs', () => {
    it('exposes the customer sample login IDs: USER_ID 3, CUSTOMER_ID 1', () => {
      const token = tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 });
      const { message } = loginWith({
        success: true,
        message: 'Login successful',
        USER_ID: 3,
        USER_NAME: 'pooja123',
        USER_TYPE: 'CUSTOMER',
        USER_TYPE_ID: 2,
        CUSTOMER_ID: 1,
        SELLER_ID: null,
        ADMIN_ID: null,
        ACCESSTOKEN: token,
      });

      expect(message).toBe('Login successful');
      expect(service.userId()).toBe(3);
      expect(service.customerId()).toBe(1);
      expect(service.sellerId()).toBeUndefined();
      expect(service.adminId()).toBeUndefined();
      expect(service.userType()).toBe('CUSTOMER');
      expect(service.userTypeId()).toBe(2);
    });

    it('does not store any ID value besides the token-derived user id on the user object', () => {
      loginWith({
        success: true,
        USER_ID: 3,
        USER_NAME: 'pooja123',
        USER_TYPE: 'CUSTOMER',
        USER_TYPE_ID: 2,
        CUSTOMER_ID: 1,
        ACCESSTOKEN: tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 }),
      });

      expect(service.user()).toEqual({
        id: '3',
        email: '',
        firstName: 'pooja123',
        lastName: '',
        userName: 'pooja123',
        userType: 'CUSTOMER',
        userTypeId: 2,
      });
    });

    it('exposes SELLER_ID for a seller login', () => {
      loginWith({
        success: true,
        USER_ID: 8,
        USER_NAME: 'dhiya_seller',
        USER_TYPE: 'SELLER',
        USER_TYPE_ID: 1,
        CUSTOMER_ID: null,
        SELLER_ID: 5,
        ADMIN_ID: null,
        ACCESSTOKEN: tokenWithClaims({ USER_ID: 8, SELLER_ID: 5 }),
      });

      expect(service.userId()).toBe(8);
      expect(service.sellerId()).toBe(5);
      expect(service.customerId()).toBeUndefined();
      expect(service.adminId()).toBeUndefined();
    });

    it('exposes ADMIN_ID for an admin login', () => {
      loginWith({
        success: true,
        USER_ID: 1,
        USER_NAME: 'admin',
        USER_TYPE: 'ADMIN',
        USER_TYPE_ID: 3,
        CUSTOMER_ID: null,
        SELLER_ID: null,
        ADMIN_ID: 2,
        ACCESSTOKEN: tokenWithClaims({ USER_ID: 1, ADMIN_ID: 2 }),
      });

      expect(service.userId()).toBe(1);
      expect(service.adminId()).toBe(2);
      expect(service.customerId()).toBeUndefined();
      expect(service.sellerId()).toBeUndefined();
    });

    it('returns undefined for a role ID that is null, missing, zero or invalid', () => {
      for (const claim of [null, undefined, 0, -4, 'abc', '']) {
        service.setSession(
          { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
          tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: claim }),
        );
        expect(service.customerId()).toBeUndefined();
      }
    });

    it('never falls back to USER_ID or another role ID when the role ID is missing', () => {
      service.setSession(
        { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
        tokenWithClaims({ USER_ID: 3, SELLER_ID: 5, ADMIN_ID: 2 }),
      );
      expect(service.userId()).toBe(3);
      expect(service.customerId()).toBeUndefined();

      service.setSession(
        { id: '8', email: '', firstName: 'seller', lastName: '', userType: 'SELLER' },
        tokenWithClaims({ USER_ID: 8, CUSTOMER_ID: 1 }),
      );
      expect(service.sellerId()).toBeUndefined();

      service.setSession(
        { id: '1', email: '', firstName: 'admin', lastName: '', userType: 'ADMIN' },
        tokenWithClaims({ USER_ID: 1, SELLER_ID: 5 }),
      );
      expect(service.adminId()).toBeUndefined();
    });

    it('does not use the sub or id claim as a role-specific ID', () => {
      service.setSession(
        { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
        tokenWithSubject(3),
      );

      expect(service.userId()).toBe(3);
      expect(service.customerId()).toBeUndefined();
    });

    it('returns a role ID only for its own role', () => {
      const token = tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1, SELLER_ID: 5, ADMIN_ID: 2 });
      const user = { id: '3', email: '', firstName: 'multi', lastName: '' };

      service.setSession({ ...user, userType: 'CUSTOMER' }, token);
      expect([service.customerId(), service.sellerId(), service.adminId()]).toEqual([1, undefined, undefined]);

      service.setSession({ ...user, userType: 'SELLER' }, token);
      expect([service.customerId(), service.sellerId(), service.adminId()]).toEqual([undefined, 5, undefined]);

      service.setSession({ ...user, userType: 'ADMIN' }, token);
      expect([service.customerId(), service.sellerId(), service.adminId()]).toEqual([undefined, undefined, 2]);
    });

    it('keeps the correct IDs after a page refresh', () => {
      loginWith({
        success: true,
        USER_ID: 3,
        USER_NAME: 'pooja123',
        USER_TYPE: 'CUSTOMER',
        USER_TYPE_ID: 2,
        CUSTOMER_ID: 1,
        ACCESSTOKEN: tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 }),
      });

      http.verify();
      TestBed.resetTestingModule();
      configure();

      expect(service.isAuthenticated()).toBe(true);
      expect(service.userId()).toBe(3);
      expect(service.customerId()).toBe(1);
      expect(service.userType()).toBe('CUSTOMER');
      expect(service.userTypeId()).toBe(2);
    });
  });

  describe('login body and token validation', () => {
    it('rejects a login whose body CUSTOMER_ID disagrees with the token', () => {
      const { error, message } = loginWith({
        success: true,
        USER_ID: 3,
        USER_NAME: 'pooja123',
        USER_TYPE: 'CUSTOMER',
        USER_TYPE_ID: 2,
        CUSTOMER_ID: 9,
        ACCESSTOKEN: tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 }),
      });

      expect(message).toBeUndefined();
      expect(error).toEqual(
        new Error('Login was rejected: the CUSTOMER_ID in the response does not match the access token.'),
      );
      expect(service.isAuthenticated()).toBe(false);
      expect(service.user()).toBeNull();
      expect(service.token()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
    });

    it('rejects a login whose body USER_ID, SELLER_ID or ADMIN_ID disagrees with the token', () => {
      const cases = [
        { field: 'USER_ID', body: { USER_ID: 4 }, claims: { USER_ID: 3 }, type: 'CUSTOMER' },
        { field: 'SELLER_ID', body: { USER_ID: 8, SELLER_ID: 6 }, claims: { USER_ID: 8, SELLER_ID: 5 }, type: 'SELLER' },
        { field: 'ADMIN_ID', body: { USER_ID: 1, ADMIN_ID: 3 }, claims: { USER_ID: 1, ADMIN_ID: 2 }, type: 'ADMIN' },
      ];

      for (const { field, body, claims, type } of cases) {
        const { error } = loginWith({
          success: true,
          USER_NAME: 'user',
          USER_TYPE: type,
          USER_TYPE_ID: 1,
          ...body,
          ACCESSTOKEN: tokenWithClaims(claims),
        });

        expect(error).toEqual(
          new Error(`Login was rejected: the ${field} in the response does not match the access token.`),
        );
        expect(service.isAuthenticated()).toBe(false);
      }
    });

    it('accepts a login whose body IDs match the token', () => {
      const { error, message } = loginWith({
        success: true,
        message: 'Login successful',
        USER_ID: 3,
        USER_NAME: 'pooja123',
        USER_TYPE: 'CUSTOMER',
        USER_TYPE_ID: 2,
        CUSTOMER_ID: 1,
        SELLER_ID: null,
        ADMIN_ID: null,
        ACCESSTOKEN: tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 }),
      });

      expect(error).toBeUndefined();
      expect(message).toBe('Login successful');
    });

    it('does not use a body role ID when the token has no matching claim', () => {
      const { error } = loginWith({
        success: true,
        USER_ID: 3,
        USER_NAME: 'pooja123',
        USER_TYPE: 'CUSTOMER',
        USER_TYPE_ID: 2,
        CUSTOMER_ID: 1,
        ACCESSTOKEN: tokenFor(3),
      });

      expect(error).toBeUndefined();
      expect(service.isAuthenticated()).toBe(true);
      expect(service.userId()).toBe(3);
      expect(service.customerId()).toBeUndefined();
    });
  });

  it('does not trust a response USER_ID when the access token has no valid user claim', () => {
    let failure: unknown;
    service.login('seller', 'password').subscribe({
      error: (error: unknown) => (failure = error),
    });

    http.expectOne(LOGIN_URL).flush({
      success: true,
      USER_ID: 60,
      USER_NAME: 'seller',
      USER_TYPE: 'SELLER',
      USER_TYPE_ID: 1,
      ACCESSTOKEN: 'not-a-jwt',
    });

    expect(failure).toEqual(
      new Error('The login API returned incomplete user details or access token.'),
    );
    expect(service.user()).toBeNull();
    expect(service.userId()).toBeUndefined();
  });

  it('attaches the stored access token to all API HTTP methods', () => {
    service.setSession(
      { id: '8', email: '', firstName: 'dhiya_seller', lastName: '' },
      tokenFor(8),
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
      .expectOne(LOGIN_URL)
      .flush({ status: 'FAILURE', message: 'Invalid credentials.' });

    expect(failure).toEqual(new Error('Invalid credentials.'));
    expect(service.isAuthenticated()).toBe(false);
    expect(service.token()).toBeNull();
  });

  describe('session cleanup', () => {
    function storePersonalData(): void {
      localStorage.setItem(STORAGE_KEYS.cart, '[{"product":{"id":"1"}}]');
      localStorage.setItem(STORAGE_KEYS.wishlist, '["1"]');
      localStorage.setItem(STORAGE_KEYS.addresses, '[]');
      localStorage.setItem(STORAGE_KEYS.selectedAddress, '"4"');
    }

    function personalDataKeys(): (string | null)[] {
      return [
        localStorage.getItem(STORAGE_KEYS.cart),
        localStorage.getItem(STORAGE_KEYS.wishlist),
        localStorage.getItem(STORAGE_KEYS.addresses),
        localStorage.getItem(STORAGE_KEYS.selectedAddress),
      ];
    }

    it('clears the session, every ID and the stored cart and wishlist on logout', () => {
      service.setSession(
        { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER', userTypeId: 2 },
        tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 }),
      );
      storePersonalData();

      service.clearSession();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.user()).toBeNull();
      expect(service.token()).toBeNull();
      expect(service.userId()).toBeUndefined();
      expect(service.customerId()).toBeUndefined();
      expect(service.sellerId()).toBeUndefined();
      expect(service.adminId()).toBeUndefined();
      expect(service.userType()).toBeUndefined();
      expect(service.userTypeId()).toBeUndefined();
      expect(localStorage.getItem(STORAGE_KEYS.user)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
      expect(personalDataKeys()).toEqual([null, null, null, null]);
    });

    it('clears the previous person’s stored data when a different account signs in', () => {
      service.setSession(
        { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
        tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 }),
      );
      storePersonalData();

      service.setSession(
        { id: '9', email: '', firstName: 'ravi', lastName: '', userType: 'CUSTOMER' },
        tokenWithClaims({ USER_ID: 9, CUSTOMER_ID: 4 }),
      );

      expect(service.userId()).toBe(9);
      expect(service.customerId()).toBe(4);
      expect(personalDataKeys()).toEqual([null, null, null, null]);
    });

    it('keeps the stored data when the same account signs in again', () => {
      service.setSession(
        { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
        tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1 }),
      );
      storePersonalData();

      service.setSession(
        { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
        tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 1, iat: 2 }),
      );

      expect(personalDataKeys()).not.toContain(null);
    });

    it('clears persisted authentication data after a protected API request returns 401', () => {
      service.setSession(
        { id: '8', email: '', firstName: 'dhiya_seller', lastName: '' },
        tokenFor(8),
      );
      localStorage.setItem(STORAGE_KEYS.cart, '[]');
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
      expect(localStorage.getItem(STORAGE_KEYS.cart)).toBeNull();
    });
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