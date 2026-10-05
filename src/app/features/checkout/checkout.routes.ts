import { Routes } from '@angular/router';

export const CHECKOUT_ROUTES: Routes = [
  {
    path: '',
    title: 'Checkout',
    loadComponent: () => import('./pages/checkout/checkout').then((m) => m.Checkout),
  },
];
