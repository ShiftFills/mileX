import { Routes } from '@angular/router';
import { AdminLayout } from '@layouts/admin-layout/admin-layout';
import { AdminSection } from './pages/admin-section/admin-section';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'products/new' },
      { path: 'dashboard', title: 'Dashboard', component: AdminSection, data: { heading: 'Dashboard' } },
      { path: 'products', pathMatch: 'full', redirectTo: 'products/all' },
      {
        path: 'products/all',
        title: 'All Products',
        loadComponent: () => import('./pages/all-products/all-products').then((m) => m.AllProducts),
      },
      {
        path: 'products/new',
        title: 'Add Product',
        loadComponent: () => import('./pages/add-product/add-product').then((m) => m.AddProduct),
      },
      {
        path: 'products/variants',
        title: 'Variants',
        loadComponent: () => import('./pages/product-variants/product-variants').then((m) => m.ProductVariants),
      },
    ],
  },
];
