import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { APP_ROUTES, SELLER_LOGIN_QUERY } from '../constants/app-routes';
import { AuthService } from '../services/auth.service';

/** True only for `/auth/login?audience=seller`, the URL behind the "Sell on MileX" link. */
function isSellerLoginRequest(
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
  router: Router,
): boolean {
  const segments = router.parseUrl(state.url).root.children['primary']?.segments ?? [];
  const path = `/${segments.map((segment) => segment.path).join('/')}`;
  return (
    path === APP_ROUTES.login &&
    route.queryParamMap.get('audience') === SELLER_LOGIN_QUERY.audience
  );
}

/** Keeps signed-in users away from login/register. */
export const guestGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return true;

  switch (auth.user()?.userType?.trim().toUpperCase()) {
    case 'ADMIN':
      return router.parseUrl(APP_ROUTES.adminDashboard);
    case 'SELLER':
      // CHANGED: a signed-in Seller opening the login page now goes to All Products (was the Seller Dashboard, which led to onboarding).
      return router.parseUrl(APP_ROUTES.allProducts);
    case 'CUSTOMER':
      // A signed-in Customer may open Seller Login from "Sell on MileX" (to sign in with a seller
      // account or go on to Register). Every other login/register URL still redirects home.
      if (isSellerLoginRequest(route, state, router)) return true;
      return router.parseUrl(APP_ROUTES.home);
    default:
      return router.parseUrl(APP_ROUTES.home);
  }
};