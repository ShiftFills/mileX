import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { StorefrontHeader } from './storefront-header';

describe('StorefrontHeader account menu', () => {
  let fixture: ComponentFixture<StorefrontHeader>;
  let root: HTMLElement;
  let auth: AuthService;

  async function openMenu(): Promise<void> {
    (root.querySelector('.store-header__account-trigger') as HTMLButtonElement).click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [StorefrontHeader],
      providers: [provideRouter([{ path: 'checkout/address', children: [] }])],
    }).compileComponents();
    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(StorefrontHeader);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => localStorage.clear());

  it('offers login and register to guests', async () => {
    await openMenu();
    const links = Array.from(root.querySelectorAll('#account-menu a')).map((a) => a.textContent?.trim());
    expect(links).toEqual(['Login', 'Register']);
  });

  describe('when signed in', () => {
    beforeEach(async () => {
      auth.setSession({ id: '1', email: 'sujansaha@gmail.com', firstName: 'Sujan', lastName: 'saha' }, 'token');
      await openMenu();
    });

    it('shows the profile summary and account links', () => {
      expect(root.querySelector('.store-header__profile strong')?.textContent).toBe('Sujan saha');
      expect(root.querySelector('.store-header__profile small')?.textContent).toBe('sujansaha@gmail.com');
      const links = Array.from(root.querySelectorAll('#account-menu a')).map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
      expect(links).toEqual([
        ['My Orders', '/orders'],
        ['My Addresses', '/checkout/address'],
        ['Offers / Discounts', '/offers'],
        ['My Account', '/account'],
        ['Help & Support', '/help'],
      ]);
    });

    it('navigates to the delivery address screen when My Addresses is clicked', async () => {
      (root.querySelector('#account-menu a[href="/checkout/address"]') as HTMLAnchorElement).click();
      await fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/checkout/address');
    });

    it('logs out, closes the menu and returns home', async () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      (root.querySelector('#account-menu button[role="menuitem"]') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(auth.isAuthenticated()).toBe(false);
      expect(root.querySelector('#account-menu')).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/');
    });

    it('closes when clicking outside', async () => {
      document.body.click();
      await fixture.whenStable();
      expect(root.querySelector('#account-menu')).toBeNull();
    });
  });
});
