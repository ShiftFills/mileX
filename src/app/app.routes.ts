import { Routes } from '@angular/router';
import { authGuard } from '@core/guards/auth.guard';
import { guestGuard } from '@core/guards/guest.guard';
import { AccountLayout } from '@layouts/account-layout/account-layout';
import { AuthLayout } from '@layouts/auth-layout/auth-layout';
import { MainLayout } from '@layouts/main-layout/main-layout';

export const routes: Routes = [
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
        path: 'products',
        loadChildren: () =>
          import('@features/products/products.routes').then((m) => m.PRODUCT_ROUTES),
      },
      {
        path: 'cart',
        loadChildren: () => import('@features/cart/cart.routes').then((m) => m.CART_ROUTES),
      },
      {
        path: 'checkout',
        canActivate: [authGuard],
        loadChildren: () =>
          import('@features/checkout/checkout.routes').then((m) => m.CHECKOUT_ROUTES),
      },
      // Signed-in area with sidebar (account + orders)
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
          {
            path: 'orders',
            loadChildren: () => import('@features/orders/orders.routes').then((m) => m.ORDER_ROUTES),
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
