import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', title: 'Sign in', loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  {
    path: 'register',
    title: 'Create account',
    loadComponent: () => import('./pages/register/register').then((m) => m.Register),
  },
];
