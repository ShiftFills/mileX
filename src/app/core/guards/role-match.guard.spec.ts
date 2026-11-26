// CHANGED: Seller tests now use real paths (`/admin/products/new` etc.), allow all product routes, and check other admin routes stay blocked.
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot, CanMatchFn, Router, RouterStateSnapshot, Route, UrlSegment, UrlTree, provideRouter,
} from '@angular/router';
import { routes } from '../../app.routes';
import { AuthService } from '../services/auth.service';
import { roleMatchGuard, storefrontHomeGuard } from './role-match.guard';

// CHANGED (new): a signed-in Admin never sees the storefront Home.
describe('storefrontHomeGuard', () => {
  let authenticated: boolean;
  let userType: string | undefined;

  beforeEach(() => {
    authenticated = true;
    userType = 'ADMIN';
    TestBed.configureTestingModule({
      providers: [
        // The app's real route table, so the navigations below use the actual Home and Admin routes.
        provideRouter(routes),
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

  const runGuard = () =>
    TestBed.runInInjectionContext(() =>
      storefrontHomeGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  it('sends a signed-in Admin to the Admin dashboard', () => {
    expect(TestBed.inject(Router).serializeUrl(runGuard() as UrlTree)).toBe('/admin/dashboard');
  });

  it('lets Customers, Sellers and visitors see Home', () => {
    for (const role of ['CUSTOMER', 'SELLER', 'customer']) {
      userType = role;
      expect(runGuard()).toBe(true);
    }
    authenticated = false;
    userType = undefined;
    expect(runGuard()).toBe(true);
  });

  it('opens the Admin dashboard when a signed-in Admin navigates to Home', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/admin/dashboard');
  });

  it('keeps Home for a Customer, a Seller and a visitor', async () => {
    const router = TestBed.inject(Router);
    for (const [signedIn, role] of [[true, 'CUSTOMER'], [true, 'SELLER'], [false, undefined]] as const) {
      authenticated = signedIn;
      userType = role;
      await router.navigateByUrl('/help');
      await router.navigateByUrl('/');
      expect(router.url).toBe('/');
    }
  });
});

// CHANGED (new): My Orders (/orders and its order details / tracking pages) is for customer logins only.
describe('My Orders access (app routes)', () => {
  let authenticated: boolean;
  let userType: string | undefined;

  beforeEach(() => {
    authenticated = true;
    userType = 'CUSTOMER';
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
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

  async function navigate(url: string): Promise<string> {
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    return router.url;
  }

  it('opens My Orders, an order and its tracking for a customer', async () => {
    expect(await navigate('/orders')).toBe('/orders');
    expect(await navigate('/orders/ORD0006')).toBe('/orders/ORD0006');
    expect(await navigate('/orders/ORD0006/tracking')).toBe('/orders/ORD0006/tracking');
  });

  it('sends an Admin to the Admin dashboard, also from an order link', async () => {
    userType = 'ADMIN';
    expect(await navigate('/orders')).toBe('/admin/dashboard');
    expect(await navigate('/orders/ORD0006/tracking')).toBe('/admin/dashboard');
  });

  it('sends a visitor to Login, back to the requested page afterwards', async () => {
    authenticated = false;
    userType = undefined;
    expect(await navigate('/orders/ORD0006')).toBe('/auth/login?returnUrl=%2Forders%2FORD0006');
  });

  it('has no Admin My Orders page: /admin/my-orders opens Order Management', async () => {
    userType = 'ADMIN';
    expect(await navigate('/admin/my-orders')).toBe('/admin/orders');
  });
});

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

  // CHANGED (new): Sellers can open the Return Request listing.
  it('allows a seller to open the return request listing', () => {
    userType = 'SELLER';

    expect(runGuard('ADMIN', '/admin/returns')).toBe(true);
    expect(runGuard('ADMIN', 'returns')).toBe(true);
  });

  // CHANGED (new): Sellers can open the Order Management screen.
  it('allows a seller to open the order management screen', () => {
    userType = 'SELLER';

    expect(runGuard('ADMIN', '/admin/orders')).toBe(true);
    expect(runGuard('ADMIN', 'orders')).toBe(true);
  });

  // CHANGED: `/admin/orders` and `/admin/returns` moved to the allowed lists above; deeper paths stay blocked.
  it('continues to block sellers from the other Admin routes', () => {
    userType = 'SELLER';

    for (const path of [
      '/admin',
      '/admin/dashboard',
      '/admin/orders/42',
      '/admin/returns/42',
      '/admin/sellers',
      '/admin/my-orders',
      '/admin/products/new/extra',
      // CHANGED (new): Category Management is Admin only.
      '/admin/categories',
    ]) {
      const result = runGuard('ADMIN', path) as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(result), path).toBe('/seller/dashboard');
    }
  });

  // CHANGED (new): the customer-only My Orders route (data.userType CUSTOMER).
  it('lets only customers match the My Orders route', () => {
    userType = 'CUSTOMER';
    expect(runGuard('CUSTOMER', '/orders')).toBe(true);

    for (const [role, home] of [['ADMIN', '/admin/dashboard'], ['SELLER', '/seller/dashboard']]) {
      userType = role;
      const result = runGuard('CUSTOMER', '/orders/ORD0006') as UrlTree;
      expect(TestBed.inject(Router).serializeUrl(result), role).toBe(home);
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