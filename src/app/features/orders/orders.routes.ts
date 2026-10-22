import { Routes } from '@angular/router';

export const ORDER_ROUTES: Routes = [
  {
    path: '',
    title: 'My orders',
    loadComponent: () => import('./pages/order-list/order-list').then((m) => m.OrderList),
  },
  {
    path: ':id',
    title: 'Order details',
    loadComponent: () => import('./pages/order-detail/order-detail').then((m) => m.OrderDetail),
  },
];
