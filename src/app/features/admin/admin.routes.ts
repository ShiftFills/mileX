import { Routes } from '@angular/router';
import { AdminLayout } from '@layouts/admin-layout/admin-layout';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'products/new' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./pages/admin-section/admin-section').then((m) => m.AdminSection),
        data: { heading: 'Dashboard' },
      },
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
        path: 'products/:id/edit',
        title: 'Edit Product',
        loadComponent: () => import('./pages/edit-product/edit-product').then((m) => m.EditProduct),
      },
      {
        path: 'products/variants',
        title: 'Variants',
        loadComponent: () => import('./pages/product-variants/product-variants').then((m) => m.ProductVariants),
      },
      {
        path: 'orders',
        title: 'Order Management',
        loadComponent: () => import('./pages/order-management/order-management').then((m) => m.OrderManagement),
      },
      {
        path: 'returns',
        title: 'Return Request',
        loadComponent: () => import('./pages/return-request/return-request').then((m) => m.ReturnRequest),
      },
      {
        path: 'sellers',
        title: 'Seller Verification',
        loadComponent: () => import('./pages/seller-verification/seller-verification').then((m) => m.SellerVerification),
      },
      {
        path: 'my-orders',
        title: 'My Orders',
        loadComponent: () => import('./pages/my-orders/my-orders').then((m) => m.MyOrders),
      },
    ],
  },
];
