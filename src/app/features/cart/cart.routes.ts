import { Routes } from '@angular/router';

export const CART_ROUTES: Routes = [
  { path: '', title: 'Cart', loadComponent: () => import('./pages/cart/cart').then((m) => m.Cart) },
];
