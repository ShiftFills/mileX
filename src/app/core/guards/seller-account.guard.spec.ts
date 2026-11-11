import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import {
  SellerAccountRecord,
  SellerOnboardingService,
} from '@features/seller/services/seller-onboarding.service';
import { sellerDashboardGuard, sellerOnboardingGuard } from './seller-account.guard';

describe('seller account guards', () => {
  const seller: SellerAccountRecord = {
    userId: 8,
    sellerId: 42,
    documentId: 7,
    bankDetailId: 9,
  };
  const user = { id: '8', email: '', firstName: 'Seller', lastName: '', userType: 'SELLER' };
  const getSellerForUser = vi.fn<() => Observable<SellerAccountRecord | null>>();

  beforeEach(() => {
    getSellerForUser.mockReset().mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => true,
            user: () => user,
          },
        },
        {
          provide: SellerOnboardingService,
          useValue: { getSellerForUser },
        },
      ],
    });
  });

  function runGuard(
    guard: typeof sellerDashboardGuard | typeof sellerOnboardingGuard,
    url: string,
    queryParamMap?: ActivatedRouteSnapshot['queryParamMap'],
  ): Observable<boolean | UrlTree> {
    const route = { queryParamMap } as ActivatedRouteSnapshot;
    const state = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(
      () => guard(route, state) as Observable<boolean | UrlTree>,
    );
  }

  async function serializedGuardResult(
    guard: typeof sellerDashboardGuard | typeof sellerOnboardingGuard,
    url: string,
    queryParamMap?: ActivatedRouteSnapshot['queryParamMap'],
  ): Promise<boolean | string> {
    const result = await firstValueFrom(runGuard(guard, url, queryParamMap));
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  }

  it('allows an active seller into the dashboard and looks up the current USER_ID', async () => {
    getSellerForUser.mockReturnValue(of({ ...seller, sellerStatus: 'ACTIVE' }));

    expect(await serializedGuardResult(sellerDashboardGuard, '/seller/dashboard')).toBe(true);
    expect(getSellerForUser).toHaveBeenCalledWith(8);
  });

  it('routes a pending seller to the verification-pending screen', async () => {
    getSellerForUser.mockReturnValue(of({ ...seller, sellerStatus: 'PENDING' }));

    expect(await serializedGuardResult(sellerDashboardGuard, '/seller/dashboard')).toBe(
      '/seller/verification-pending',
    );
  });

  it('routes a rejected seller to the rejected screen with onboarding IDs', async () => {
    getSellerForUser.mockReturnValue(of({ ...seller, sellerStatus: 'REJECTED' }));

    const result = await serializedGuardResult(sellerDashboardGuard, '/seller/dashboard');
    expect(result).toContain('/seller/rejected?');
    expect(result).toContain('sellerId=42');
    expect(result).toContain('documentId=7');
    expect(result).toContain('bankDetailId=9');
  });

  it('routes a missing or incomplete seller record to onboarding', async () => {
    expect(await serializedGuardResult(sellerDashboardGuard, '/seller/dashboard')).toBe(
      '/seller/onboarding',
    );

    getSellerForUser.mockReturnValue(of(seller));
    const result = await serializedGuardResult(sellerDashboardGuard, '/seller/dashboard');
    expect(result).toContain('/seller/onboarding?');
    expect(result).toContain('sellerId=42');
  });

  it('does not treat a non-exact ACTIVE seller status as approved', async () => {
    getSellerForUser.mockReturnValue(of({ ...seller, sellerStatus: 'active' }));

    expect(await serializedGuardResult(sellerDashboardGuard, '/seller/dashboard')).toBe(
      '/seller/onboarding?sellerId=42&documentId=7&bankDetailId=9',
    );
  });

  it('does not open the onboarding editor for active or pending sellers', async () => {
    getSellerForUser.mockReturnValue(of({ ...seller, sellerStatus: 'ACTIVE' }));
    expect(await serializedGuardResult(sellerOnboardingGuard, '/seller/onboarding')).toBe(
      '/seller/dashboard',
    );

    getSellerForUser.mockReturnValue(of({ ...seller, sellerStatus: 'PENDING' }));
    expect(await serializedGuardResult(sellerOnboardingGuard, '/seller/onboarding')).toBe(
      '/seller/verification-pending',
    );
  });

  it('opens the rejected seller editor with the current seller IDs', async () => {
    getSellerForUser.mockReturnValue(of({ ...seller, sellerStatus: 'REJECTED' }));
    const result = await serializedGuardResult(sellerOnboardingGuard, '/seller/onboarding');

    expect(result).toContain('/seller/onboarding?');
    expect(result).toContain('sellerId=42');
  });

  it('does not redirect repeatedly when an incomplete seller is already on its edit URL', async () => {
    getSellerForUser.mockReturnValue(of(seller));
    const queryParamMap = {
      get: (name: string) => (name === 'sellerId' ? '42' : null),
    } as ActivatedRouteSnapshot['queryParamMap'];

    expect(
      await serializedGuardResult(sellerOnboardingGuard, '/seller/onboarding?sellerId=42', queryParamMap),
    ).toBe(true);
  });

  it('redirects an incomplete seller to the edit URL once when seller ID is missing from the URL', async () => {
    getSellerForUser.mockReturnValue(of(seller));

    const result = await serializedGuardResult(sellerOnboardingGuard, '/seller/onboarding');
    expect(result).toBe('/seller/onboarding?sellerId=42&documentId=7&bankDetailId=9');
  });

  it('shows a safe unavailable route instead of granting dashboard access when lookup fails', async () => {
    getSellerForUser.mockReturnValue(throwError(() => new Error('lookup failed')));

    expect(await serializedGuardResult(sellerDashboardGuard, '/seller/dashboard')).toBe(
      '/seller/status-unavailable',
    );
  });
});
