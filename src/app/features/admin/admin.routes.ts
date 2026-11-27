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
        loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
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
      // CHANGED (new): Admin only. roleMatchGuard lets Sellers open product, order and return pages under /admin, not this.
      {
        path: 'categories',
        title: 'Category Management',
        loadComponent: () =>
          import('./pages/category-management/category-management').then((m) => m.CategoryManagement),
      },
      // CHANGED (new): Admin only (roleMatchGuard does not let Sellers open it).
      {
        path: 'brands',
        title: 'Brand Management',
        loadComponent: () => import('./pages/brand-management/brand-management').then((m) => m.BrandManagement),
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
      // CHANGED: My Orders is a customer screen (/orders), so Admins no longer have a route to it; an old link or
      // bookmark to /admin/my-orders opens Order Management instead. (The MyOrders component is kept.)
      { path: 'my-orders', pathMatch: 'full', redirectTo: 'orders' },
    ],
  },
];
