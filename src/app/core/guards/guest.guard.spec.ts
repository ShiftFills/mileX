
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { guestGuard } from './guest.guard';

describe('guestGuard', () => {
  let authenticated: boolean;
  let userType: string | undefined;

  beforeEach(() => {
    authenticated = true;
    userType = 'CUSTOMER';
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => authenticated,
            user: () => (userType ? { userType } : null),
          },
        },
      ],
    });
  });

  function runGuard(url: string): ReturnType<CanActivateFn> {
    const router = TestBed.inject(Router);
    const route = {
      queryParamMap: convertToParamMap(router.parseUrl(url).queryParams),
    } as ActivatedRouteSnapshot;
    const state = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => guestGuard(route, state));
  }

  function redirectTarget(url: string): string {
    return TestBed.inject(Router).serializeUrl(runGuard(url) as UrlTree);
  }

  it('lets guests open login and register', () => {
    authenticated = false;
    expect(runGuard('/auth/login')).toBe(true);
    expect(runGuard('/auth/login?audience=seller')).toBe(true);
    expect(runGuard('/auth/register')).toBe(true);
  });

  it('lets a signed-in Customer open Seller Login', () => {
    expect(runGuard('/auth/login?audience=seller')).toBe(true);
  });

  it('still sends a signed-in Customer home from the normal login and register pages', () => {
    expect(redirectTarget('/auth/login')).toBe('/');
    expect(redirectTarget('/auth/register')).toBe('/');
    expect(redirectTarget('/auth/register?audience=seller')).toBe('/');
    expect(redirectTarget('/auth/login?audience=other')).toBe('/');
  });

  it('keeps the existing role redirects for Admin and Seller, even on Seller Login', () => {
    userType = 'ADMIN';
    expect(redirectTarget('/auth/login?audience=seller')).toBe('/admin/dashboard');
    expect(redirectTarget('/auth/login')).toBe('/admin/dashboard');

    userType = 'SELLER';
    expect(redirectTarget('/auth/login?audience=seller')).toBe('/admin/products/all');
    expect(redirectTarget('/auth/login')).toBe('/admin/products/all');
  });
});