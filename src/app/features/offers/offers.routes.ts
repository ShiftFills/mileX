import { Routes } from '@angular/router';

export const OFFER_ROUTES: Routes = [
  {
    path: '',
    title: 'Offers & Discounts',
    loadComponent: () => import('./pages/offers/offers').then((m) => m.Offers),
  },
  // CHANGED (new): one offer's products as product cards (the offer card's arrow opens it). `:id` is the OFFER_ID.
  {
    path: ':id',
    title: 'Offer products',
    loadComponent: () => import('./pages/offer-products/offer-products').then((m) => m.OfferProducts),
  },
];
