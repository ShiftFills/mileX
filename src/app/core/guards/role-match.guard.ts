import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { APP_ROUTES } from '../constants/app-routes';
import { AuthService } from '../services/auth.service';

/**
 * Admin-area pages a Seller may open: product management (list, add, edit, variants), the
 * Order Management screen and the Return Request listing. Checked against the path without its
 * leading `admin/`.
 */
// CHANGED: Sellers may open the product pages (list, add, edit, variants), Order Management and
// Return Request under /admin. Everything else stays Admin-only.
const SELLER_ADMIN_PATH = /^(products(\/(all|new|variants|[^/]+\/edit))?|orders|returns)$/;

function defaultRouteFor(userType: string | undefined): string {
  switch (userType?.trim().toUpperCase()) {
    case 'ADMIN':
      return APP_ROUTES.adminDashboard;
    case 'SELLER':
      return APP_ROUTES.sellerDashboard;
    default:
      return APP_ROUTES.home;
  }
}

/**
 * The storefront Home is for customers and visitors. A signed-in Admin opening it (the URL, a reload with a
 * saved session, or the logo in the Admin area) goes to the Admin landing page instead, the same page Login
 * sends Admins to. Customers, Sellers and visitors see Home as before.
 */
// CHANGED (new)
export const storefrontHomeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const userType = auth.user()?.userType;
  return auth.isAuthenticated() && userType?.trim().toUpperCase() === 'ADMIN'
    ? inject(Router).parseUrl(defaultRouteFor(userType))
    : true;
};

export const roleMatchGuard: CanMatchFn = (route, segments) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    const returnUrl = `/${segments.map((segment) => segment.path).join('/')}`;
    return router.createUrlTree([APP_ROUTES.login], {
      queryParams: { returnUrl },
    });
  }

  const expectedType = route.data?.['userType'];
  const actualType = auth.user()?.userType;
  // For the top-level `admin` route, Angular passes ALL remaining segments to canMatch, so the
  // path looks like `admin/products/new`. The leading `admin/` is stripped so the relative form
  // (if this guard is ever attached to a nested route) is handled the same way.
  // CHANGED: compares the FULL path (`admin/products/new`), because Angular passes every remaining segment to canMatch.
  // The old check compared against `products/all` only, so Sellers were bounced to /seller/dashboard and then onboarding.
  const requestedPath = segments
    .map((segment) => segment.path)
    .join('/')
    .replace(/^admin\//, '');
  const isSellerAllowedRoute =
    expectedType === 'ADMIN' &&
    actualType?.trim().toUpperCase() === 'SELLER' &&
    SELLER_ADMIN_PATH.test(requestedPath);
  if (isSellerAllowedRoute) return true;

  if (
    typeof expectedType !== 'string' ||
    typeof actualType !== 'string' ||
    actualType.trim().toUpperCase() !== expectedType.toUpperCase()
  ) {
    return router.parseUrl(defaultRouteFor(actualType));
  }

  return true;
};