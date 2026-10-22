import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { guestGuard } from '@core/guards/guest.guard';
import { AccountLayout } from '@layouts/account-layout/account-layout';
import { AdminLayout } from '@layouts/admin-layout/admin-layout';
import { AuthLayout } from '@layouts/auth-layout/auth-layout';
import { MainLayout } from '@layouts/main-layout/main-layout';

export const routes: Routes = [
  {
    path: 'admin',
    loadChildren: () => import('@features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  {
    path: 'checkout',
    component: AdminLayout,
    loadChildren: () => import('@features/checkout/checkout.routes').then((m) => m.CHECKOUT_ROUTES),
  },
  {
    path: 'sell',
    title: 'Sell on MileX',
    loadComponent: () =>
      import('@features/seller/pages/seller-onboarding/seller-onboarding').then(
        (m) => m.SellerOnboarding,
      ),
  },
  { path: 'register', pathMatch: 'full', redirectTo: 'auth/register' },
  // Storefront shell (header + footer)
  {
    path: '',
    component: MainLayout,
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'MileX',
        loadChildren: () => import('@features/home/home.routes').then((m) => m.HOME_ROUTES),
      },
      {
        path: 'help',
        title: 'Help & Support',
        loadComponent: () =>
          import('@features/home/pages/storefront-info/storefront-info').then(
            (m) => m.StorefrontInfo,
          ),
        data: {
          heading: 'Help & Support',
          subtitle: 'Support information and help resources will be available here soon.',
        },
      },
      {
        path: 'products',
        loadChildren: () =>
          import('@features/products/products.routes').then((m) => m.PRODUCT_ROUTES),
      },
      {
        path: 'wishlist',
        title: 'Wishlist',
        loadComponent: () =>
          import('@features/products/pages/wishlist/wishlist').then((m) => m.Wishlist),
      },
      {
        path: 'offers',
        loadChildren: () => import('@features/offers/offers.routes').then((m) => m.OFFER_ROUTES),
      },
      {
        path: 'cart',
        loadChildren: () => import('@features/cart/cart.routes').then((m) => m.CART_ROUTES),
      },
      {
        path: 'refund',
        loadChildren: () => import('@features/refund/refund.routes').then((m) => m.REFUND_ROUTES),
      },
      // Full-width order history (no account sidebar).
      // TODO: add `canActivate: [authGuard]` once sign-in is wired; open for now so the design can be reviewed.
      {
        path: 'orders',
        loadChildren: () => import('@features/orders/orders.routes').then((m) => m.ORDER_ROUTES),
      },
      // Signed-in area with sidebar (account)
      {
        path: '',
        component: AccountLayout,
        canActivate: [authGuard],
        children: [
          {
            path: 'account',
            loadChildren: () =>
              import('@features/account/account.routes').then((m) => m.ACCOUNT_ROUTES),
          },
        ],
      },
    ],
  },

  // Auth shell (no header/footer)
  {
    path: 'auth',
    component: AuthLayout,
    canActivate: [guestGuard],
    loadChildren: () => import('@features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  {
    path: '**',
    title: 'Page not found',
    loadComponent: () =>
      import('@features/not-found/pages/not-found/not-found').then((m) => m.NotFound),
  },
];
