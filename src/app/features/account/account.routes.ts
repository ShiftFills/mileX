import { Routes } from '@angular/router';

export const ACCOUNT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'profile' },
  {
    path: 'profile',
    title: 'Profile',
    loadComponent: () => import('./pages/profile/profile').then((m) => m.Profile),
  },
  {
    path: 'addresses',
    title: 'Addresses',
    loadComponent: () => import('./pages/addresses/addresses').then((m) => m.Addresses),
  },
];
