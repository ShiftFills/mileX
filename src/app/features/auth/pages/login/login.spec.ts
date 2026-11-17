import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { AuthService } from '@core/services/auth.service';
import { Login } from './login';

function tokenFor(userId: number): string {
  return `header.${btoa(JSON.stringify({ USER_ID: userId })).replace(/=/g, '')}.signature`;
}

@Component({ template: '' })
class HomePage {}

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([
          { path: '', component: HomePage },
          { path: 'seller/dashboard', component: HomePage },
          { path: 'admin/dashboard', component: HomePage },
          { path: 'admin/products/all', component: HomePage },
        ]),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('renders the login form with required username and password fields', () => {
    const userName = fixture.nativeElement.querySelector('#login-username') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;

    expect(userName.required).toBe(true);
    expect(userName.type).toBe('text');
    expect(userName.autocomplete).toBe('username');
    expect(password.required).toBe(true);
    expect(password.type).toBe('password');
  });

  it('toggles password visibility', () => {
    const toggle = fixture.nativeElement.querySelector('.login-password-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    expect(password.type).toBe('text');

    toggle.click();
    fixture.detectChanges();
    expect(password.type).toBe('password');
  });

  it('logs in with entered credentials, stores API session details, and navigates sellers to All Products', async () => {
    const userName = fixture.nativeElement.querySelector('#login-username') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    userName.value = 'dhiya_seller';
    userName.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'Seller@123';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    const request = http.expectOne('/api/user/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      USER_NAME: 'dhiya_seller',
      USER_PASSWORD: 'Seller@123',
    });
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({
      success: true,
      message: 'Login successful',
      USER_ID: 60,
      USER_NAME: 'rahul_ocean',
      USER_TYPE: 'SELLER',
      USER_TYPE_ID: 1,
      ACCESSTOKEN: tokenFor(60),
    });
    await fixture.whenStable();

    expect(TestBed.inject(AuthService).user()).toMatchObject({
      id: '60',
      userName: 'rahul_ocean',
      userType: 'SELLER',
      userTypeId: 1,
    });
    expect(TestBed.inject(AuthService).token()).toBe(tokenFor(60));
    expect(TestBed.inject(Router).url).toBe('/admin/products/all');
    expect(fixture.nativeElement.textContent).not.toContain('Login failed');
  });

  it('sends only one login request when the form is submitted again while the first is pending', () => {
    const userName = fixture.nativeElement.querySelector('#login-username') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    userName.value = 'dhiya_seller';
    userName.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'Seller@123';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));

    const request = http.expectOne('/api/user/login');
    expect(request.request.method).toBe('POST');
    http.expectNone('/api/user/login');
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
  });

  it('routes an administrator to the existing Admin dashboard after login', async () => {
    const userName = fixture.nativeElement.querySelector('#login-username') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    userName.value = 'admin_user';
    userName.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'admin-password';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    http.expectOne('/api/user/login').flush({
      status: 'SUCCESS',
      message: 'Login successful',
      data: {
        USER_ID: 19,
        USER_NAME: 'admin_user',
        USER_TYPE: 'ADMIN',
        USER_TYPE_ID: 2,
        ACCESSTOKEN: tokenFor(19),
      },
    });
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/admin/dashboard');
  });

  it('shows backend login errors and does not redirect or store a session', async () => {
    const userName = fixture.nativeElement.querySelector('#login-username') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    userName.value = 'unknown';
    userName.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'wrong';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    http.expectOne('/api/user/login').flush(
      { message: 'Invalid username or password.' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Invalid username or password.');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });
});

describe('Login entry points', () => {
  async function openLogin(url: string): Promise<RouterTestingHarness> {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'auth/login', component: Login },
          { path: 'auth/register', component: HomePage },
          { path: 'sell', component: HomePage },
        ]),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    return RouterTestingHarness.create(url);
  }

  afterEach(() => localStorage.clear());

  it('shows the seller variant with a Register link to Seller Onboarding when opened from Sell on MileX', async () => {
    const harness = await openLogin('/auth/login?audience=seller');
    const root = harness.routeNativeElement as HTMLElement;

    expect(root.querySelector('#login-title')?.textContent).toBe('Seller Login');
    const link = root.querySelector('.login-register-link a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Register');
    expect(link.getAttribute('href')).toBe('/sell');

    link.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/sell');
  });

  it('keeps the customer Sign Up link on the normal login page', async () => {
    const harness = await openLogin('/auth/login');
    const root = harness.routeNativeElement as HTMLElement;

    expect(root.querySelector('#login-title')?.textContent).toBe('Login to Your Account');
    const link = root.querySelector('.login-register-link a') as HTMLAnchorElement;
    expect(link.textContent?.trim()).toBe('Sign Up');
    expect(link.getAttribute('href')).toBe('/auth/register');
  });
});