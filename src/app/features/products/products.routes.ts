import { Routes } from '@angular/router';

export const PRODUCT_ROUTES: Routes = [
  {
    path: '',
    title: 'Products',
    loadComponent: () => import('./pages/product-list/product-list').then((m) => m.ProductList),
  },
  {
    path: ':id',
    title: 'Product details',
    loadComponent: () => import('./pages/product-detail/product-detail').then((m) => m.ProductDetail),
  },
];
