import { Routes } from '@angular/router';

export const REFUND_ROUTES: Routes = [
  {
    path: '',
    title: 'Refund',
    loadComponent: () => import('./pages/refund/refund').then((m) => m.Refund),
  },
  {
    path: ':id',
    title: 'Refund',
    loadComponent: () => import('./pages/refund/refund').then((m) => m.Refund),
  },
];
