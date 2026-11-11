import { Routes } from '@angular/router';
import { sellerDashboardGuard, sellerOnboardingGuard } from '@core/guards/seller-account.guard';
import { SellerLayout } from '@layouts/seller-layout/seller-layout';

export const SELLER_ROUTES: Routes = [
  {
    path: '',
    component: SellerLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Seller Dashboard',
        canActivate: [sellerDashboardGuard],
        loadComponent: () =>
          import('./pages/seller-dashboard/seller-dashboard').then((m) => m.SellerDashboard),
      },
      {
        path: 'verification-pending',
        title: 'Verification Pending',
        data: { sellerStatus: 'PENDING' },
        loadComponent: () =>
          import('./pages/seller-status/seller-status').then((m) => m.SellerStatusPage),
      },
      {
        path: 'rejected',
        title: 'Seller Application Rejected',
        data: { sellerStatus: 'REJECTED' },
        loadComponent: () =>
          import('./pages/seller-status/seller-status').then((m) => m.SellerStatusPage),
      },
      {
        path: 'onboarding',
        title: 'Seller Onboarding',
        canActivate: [sellerOnboardingGuard],
        loadComponent: () =>
          import('./pages/seller-onboarding/seller-onboarding').then((m) => m.SellerOnboarding),
      },
      {
        path: 'status-unavailable',
        title: 'Seller Status Unavailable',
        data: { sellerStatus: 'UNAVAILABLE' },
        loadComponent: () =>
          import('./pages/seller-status/seller-status').then((m) => m.SellerStatusPage),
      },
    ],
  },
];
