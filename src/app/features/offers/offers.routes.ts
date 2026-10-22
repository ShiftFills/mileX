import { Routes } from '@angular/router';

export const OFFER_ROUTES: Routes = [
  {
    path: '',
    title: 'Offers & Discounts',
    loadComponent: () => import('./pages/offers/offers').then((m) => m.Offers),
  },
];
