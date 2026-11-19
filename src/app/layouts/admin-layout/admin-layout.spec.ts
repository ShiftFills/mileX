// CHANGED (new): toolbar account details, account menu and Log Out for Admin and Seller logins.
import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { AdminLayout } from './admin-layout';

/** Access token whose claims carry the given USER_ID (decoded by AuthService.userId()). */
function tokenFor(userId: number): string {
  return `header.${btoa(JSON.stringify({ USER_ID: userId })).replace(/=/g, '')}.signature`;
}

describe('AdminLayout toolbar', () => {
  let fixture: ComponentFixture<AdminLayout>;
  let root: HTMLElement;
  let auth: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => auth.clearSession());

  /** Signs in the way the login API maps a user (USER_NAME becomes the display name). */
  function signIn(userName: string, userType: string, userId = 60): void {
    auth.setSession(
      { id: String(userId), email: '', firstName: userName, lastName: '', userName, userType, userTypeId: 1 },
      tokenFor(userId),
    );
  }

  function render(): void {
    fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  }

  function userButton(): HTMLButtonElement {
    return root.querySelector<HTMLButtonElement>('.admin-user')!;
  }

  function openMenu(): void {
    userButton().click();
    fixture.detectChanges();
  }

  it('shows the signed-in Admin\'s name, initials and role with the full Admin menu', () => {
    signIn('Sujan Saha', 'ADMIN');
    render();

    expect(root.querySelector('.admin-user__avatar')?.textContent?.trim()).toBe('SS');
    expect(root.querySelector('.admin-user__name')?.textContent).toContain('Sujan Saha');
    expect(root.querySelector('.admin-user__name small')?.textContent?.trim()).toBe('Admin');
    expect(userButton().getAttribute('aria-label')).toBe('Account menu for Sujan Saha, Admin');
    expect(root.querySelector('.admin-search input')?.getAttribute('placeholder')).toBe(
      'Search orders, products, sellers, customers...',
    );
    expect(root.querySelector('.admin-icon-button[aria-label="Notifications"]')).toBeTruthy();
    expect(root.querySelector('.admin-sidebar')?.textContent).toContain('Seller Verification');
  });

  it('shows the signed-in Seller\'s own name and role with the Seller menu', () => {
    signIn('Ravi Kumar', 'SELLER', 61);
    render();

    expect(root.querySelector('.admin-user__avatar')?.textContent?.trim()).toBe('RK');
    expect(root.querySelector('.admin-user__name')?.textContent).toContain('Ravi Kumar');
    expect(root.querySelector('.admin-user__name small')?.textContent?.trim()).toBe('Seller');
    expect(root.textContent).not.toContain('Sujan Saha');
    const sidebar = root.querySelector('.admin-sidebar')?.textContent ?? '';
    expect(sidebar).toContain('Order Management');
    expect(sidebar).not.toContain('Seller Verification');
  });

  it('derives initials from user names that are not two plain words', () => {
    signIn('sujan.saha@milex.in', 'ADMIN');
    render();
    expect(root.querySelector('.admin-user__avatar')?.textContent?.trim()).toBe('SS');

    fixture.destroy();
    signIn('admin', 'ADMIN', 62);
    render();
    expect(root.querySelector('.admin-user__avatar')?.textContent?.trim()).toBe('A');
  });

  it('opens an account menu with the user details and a Log Out action', () => {
    signIn('Sujan Saha', 'ADMIN');
    render();

    expect(root.querySelector('#admin-account-menu')).toBeNull();
    expect(userButton().getAttribute('aria-expanded')).toBe('false');
    openMenu();

    const menu = root.querySelector('#admin-account-menu')!;
    expect(userButton().getAttribute('aria-expanded')).toBe('true');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.textContent).toContain('Sujan Saha');
    expect(menu.textContent).toContain('Admin');
    expect(menu.querySelector('[role="menuitem"]')?.textContent?.trim()).toBe('Log Out');
  });

  for (const userType of ['ADMIN', 'SELLER']) {
    it(`logs out a ${userType} by clearing the session and opening the login screen`, () => {
      signIn('Sujan Saha', userType);
      render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      openMenu();

      root.querySelector<HTMLButtonElement>('#admin-account-menu [role="menuitem"]')!.click();
      fixture.detectChanges();

      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.user()).toBeNull();
      expect(auth.token()).toBeNull();
      expect(navigate).toHaveBeenCalledWith('/auth/login');
      expect(root.querySelector('#admin-account-menu')).toBeNull();
      expect(root.querySelector('.admin-user')).toBeNull();
    });
  }

  it('closes the account menu with Escape, an outside click, or the user button again', () => {
    signIn('Sujan Saha', 'ADMIN');
    render();

    openMenu();
    root.querySelector('.admin-account')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(root.querySelector('#admin-account-menu')).toBeNull();

    openMenu();
    root.querySelector<HTMLElement>('.admin-search')!.click();
    fixture.detectChanges();
    expect(root.querySelector('#admin-account-menu')).toBeNull();

    openMenu();
    openMenu();
    expect(root.querySelector('#admin-account-menu')).toBeNull();
  });

  it('shows no account details or Log Out when nobody is signed in', () => {
    render();

    expect(root.querySelector('.admin-user')).toBeNull();
    expect(root.querySelector('#admin-account-menu')).toBeNull();
    expect(root.textContent).not.toContain('Sujan Saha');
    expect(root.querySelector('.admin-icon-button[aria-label="Notifications"]')).toBeTruthy();
  });
});
