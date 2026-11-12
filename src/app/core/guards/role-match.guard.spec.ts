// CHANGED: Seller tests now use real paths (`/admin/products/new` etc.), allow all product routes, and check other admin routes stay blocked.
import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Router, Route, UrlSegment, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { roleMatchGuard } from './role-match.guard';

describe('roleMatchGuard', () => {
  let authenticated: boolean;
  let userType: string | undefined;

  beforeEach(() => {
    authenticated = true;
    userType = 'ADMIN';
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => authenticated,
            user: () => (userType ? { userType } : null),
          },
        },
      ],
    });
  });

  function runGuard(expectedType: string, path: string): ReturnType<CanMatchFn> {
    const route = { data: { userType: expectedType } } as Route;
    const segments = path
      .split('/')
      .filter(Boolean)
      .map((part) => new UrlSegment(part, {}));
    return TestBed.runInInjectionContext(() =>
      roleMatchGuard(route, segments, {} as Parameters<CanMatchFn>[2]),
    );
  }

  it('allows authenticated users with the required role', () => {
    expect(runGuard('ADMIN', '/admin/dashboard')).toBe(true);
  });

  it('sends an unauthenticated user to login with a return URL', () => {
    authenticated = false;
    const result = runGuard('ADMIN', '/admin/dashboard') as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe(
      '/auth/login?returnUrl=%2Fadmin%2Fdashboard',
    );
  });

  it('keeps a seller out of Admin routes and sends them to the seller area', () => {
    userType = 'SELLER';
    const result = runGuard('ADMIN', '/admin/dashboard') as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/seller/dashboard');
  });

  it('allows a seller to open the product management routes', () => {
    userType = 'SELLER';

    // The real router passes the full path (including `admin`) to canMatch on the admin route.
    for (const path of [
      '/admin/products',
      '/admin/products/all',
      '/admin/products/new',
      '/admin/products/variants',
      '/admin/products/42/edit',
      'products/all',
      'products/new',
    ]) {
      expect(runGuard('ADMIN', path), path).toBe(true);
    }
  });

  it('continues to block sellers from the other Admin routes', () => {
    userType = 'SELLER';

    for (const path of [
      '/admin',
      '/admin/dashboard',
      '/admin/orders',
      '/admin/returns',
      '/admin/sellers',
      '/admin/my-orders',
      '/admin/products/new/extra',
    ]) {
      const result = runGuard('ADMIN', path) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(result), path).toBe('/seller/dashboard');
    }
  });

  it('does not let an unauthenticated user reach product routes', () => {
    authenticated = false;
    const result = runGuard('ADMIN', '/admin/products/new') as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe(
      '/auth/login?returnUrl=%2Fadmin%2Fproducts%2Fnew',
    );
  });

  it('keeps an administrator out of seller-only routes', () => {
    const result = runGuard('SELLER', '/seller/dashboard') as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/admin/dashboard');
  });
});