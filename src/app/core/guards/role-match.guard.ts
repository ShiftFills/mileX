import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { APP_ROUTES } from '../constants/app-routes';
import { AuthService } from '../services/auth.service';

/**
 * Admin-area pages a Seller may open: product management only (list, add, edit, variants).
 * Checked against the path without its leading `admin/`.
 */
const SELLER_ADMIN_PRODUCT_PATH = /^products(\/(all|new|variants|[^/]+\/edit))?$/;

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
  const requestedPath = segments
    .map((segment) => segment.path)
    .join('/')
    .replace(/^admin\//, '');
  const isSellerProductRoute =
    expectedType === 'ADMIN' &&
    actualType?.trim().toUpperCase() === 'SELLER' &&
    SELLER_ADMIN_PRODUCT_PATH.test(requestedPath);
  if (isSellerProductRoute) return true;

  if (
    typeof expectedType !== 'string' ||
    typeof actualType !== 'string' ||
    actualType.trim().toUpperCase() !== expectedType.toUpperCase()
  ) {
    return router.parseUrl(defaultRouteFor(actualType));
  }

  return true;
};