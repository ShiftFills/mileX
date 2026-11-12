import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { APP_ROUTES } from '../constants/app-routes';
import { AuthService } from '../services/auth.service';

/** Keeps signed-in users away from login/register. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return true;

  switch (auth.user()?.userType?.trim().toUpperCase()) {
    case 'ADMIN':
      return router.parseUrl(APP_ROUTES.adminDashboard);
    case 'SELLER':
      // CHANGED: a signed-in Seller opening the login page now goes to All Products (was the Seller Dashboard, which led to onboarding).
      return router.parseUrl(APP_ROUTES.allProducts);
    default:
      return router.parseUrl(APP_ROUTES.home);
  }
};