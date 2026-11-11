import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { APP_ROUTES } from '../constants/app-routes';
import { AuthService } from '../services/auth.service';
import {
  SellerAccountRecord,
  SellerOnboardingService,
} from '@features/seller/services/seller-onboarding.service';

function positiveId(value: string | null | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function onboardingParams(record: SellerAccountRecord): Record<string, number> {
  return {
    ...(record.sellerId !== undefined ? { sellerId: record.sellerId } : {}),
    ...(record.documentId !== undefined ? { documentId: record.documentId } : {}),
    ...(record.bankDetailId !== undefined ? { bankDetailId: record.bankDetailId } : {}),
  };
}

function defaultRoleRoute(userType: string | undefined): string {
  switch (userType?.trim().toUpperCase()) {
    case 'ADMIN':
      return APP_ROUTES.adminDashboard;
    case 'SELLER':
      return APP_ROUTES.sellerDashboard;
    default:
      return APP_ROUTES.home;
  }
}

function sellerUserId(): number | undefined {
  const auth = inject(AuthService);
  const user = auth.user();
  if (user?.userType?.trim().toUpperCase() !== 'SELLER') return undefined;
  return positiveId(user.id);
}

function routeToRoleHome(router: Router): ReturnType<Router['parseUrl']> {
  const auth = inject(AuthService);
  return router.parseUrl(defaultRoleRoute(auth.user()?.userType));
}

function accountLookup() {
  const userId = sellerUserId();
  if (userId === undefined) return undefined;
  return inject(SellerOnboardingService).getSellerForUser(userId);
}

export const publicSellerOnboardingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return true;

  switch (auth.user()?.userType?.trim().toUpperCase()) {
    case 'ADMIN':
      return router.parseUrl(APP_ROUTES.adminDashboard);
    case 'SELLER':
      return router.parseUrl(APP_ROUTES.sellerOnboarding);
    default:
      return true;
  }
};

export const sellerDashboardGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree([APP_ROUTES.login], {
      queryParams: { returnUrl: state.url },
    });
  }
  if (auth.user()?.userType?.trim().toUpperCase() !== 'SELLER') {
    return routeToRoleHome(router);
  }

  const lookup = accountLookup();
  if (!lookup) return router.parseUrl(APP_ROUTES.sellerStatusUnavailable);

  return lookup.pipe(
    map((record) => {
      if (!record) return router.parseUrl(APP_ROUTES.sellerOnboarding);

      switch (record.sellerStatus) {
        case 'ACTIVE':
          return true;
        case 'PENDING':
          return router.parseUrl(APP_ROUTES.sellerVerificationPending);
        case 'REJECTED':
          return router.createUrlTree([APP_ROUTES.sellerRejected], {
            queryParams: onboardingParams(record),
          });
        default:
          return router.createUrlTree([APP_ROUTES.sellerOnboarding], {
            queryParams: onboardingParams(record),
          });
      }
    }),
    catchError(() => of(router.parseUrl(APP_ROUTES.sellerStatusUnavailable))),
  );
};

export const sellerOnboardingGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) return router.parseUrl(APP_ROUTES.login);
  if (auth.user()?.userType?.trim().toUpperCase() !== 'SELLER') {
    return routeToRoleHome(router);
  }

  const lookup = accountLookup();
  if (!lookup) return router.parseUrl(APP_ROUTES.sellerStatusUnavailable);

  return lookup.pipe(
    map((record) => {
      if (!record) return true;

      switch (record.sellerStatus) {
        case 'ACTIVE':
          return router.parseUrl(APP_ROUTES.sellerDashboard);
        case 'PENDING':
          return router.parseUrl(APP_ROUTES.sellerVerificationPending);
        case 'REJECTED': {
          if (record.sellerId === undefined) {
            return router.parseUrl(APP_ROUTES.sellerStatusUnavailable);
          }
          const currentSellerId = positiveId(route.queryParamMap?.get('sellerId'));
          if (currentSellerId !== record.sellerId) {
            return router.createUrlTree([APP_ROUTES.sellerOnboarding], {
              queryParams: onboardingParams(record),
            });
          }
          return true;
        }
        default:
          if (record.sellerId === undefined) return true;

          const currentSellerId = positiveId(route.queryParamMap?.get('sellerId'));
          if (currentSellerId === record.sellerId) return true;

          return router.createUrlTree([APP_ROUTES.sellerOnboarding], {
            queryParams: onboardingParams(record),
          });
      }
    }),
    catchError(() => of(router.parseUrl(APP_ROUTES.sellerStatusUnavailable))),
  );
};
