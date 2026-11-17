import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { APP_ROUTES } from '../constants/app-routes';
import { AuthService } from '../services/auth.service';

/**
 * Admin-area pages a Seller may open: product management (list, add, edit, variants) and the
 * Return Request listing. Checked against the path without its leading `admin/`.
 */
// CHANGED: Sellers may open the product pages (list, add, edit, variants) and Return Request under /admin.
// Everything else stays Admin-only.
const SELLER_ADMIN_PATH = /^(products(\/(all|new|variants|[^/]+\/edit))?|returns)$/;

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