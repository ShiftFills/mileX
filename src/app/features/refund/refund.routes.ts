import { Routes } from '@angular/router';

/**
 * The customer Refund screen. `/refund/:orderNumber/:orderId` shows the refunds of one product of an order: the
 * ORDER_NUMBER and that product's ORDER_ID (its order line), as GET refund needs them. Opened from the product's
 * "Refund status" link on Order Details. `/refund` alone has no order to show and says so.
 */
// CHANGED: `:orderNumber/:orderId` (it was `:id`, a return number the refund API cannot be asked by).
export const REFUND_ROUTES: Routes = [
  {
    path: '',
    title: 'Refund',
    loadComponent: () => import('./pages/refund/refund').then((m) => m.Refund),
  },
  {
    path: ':orderNumber/:orderId',
    title: 'Refund',
    loadComponent: () => import('./pages/refund/refund').then((m) => m.Refund),
  },
];
