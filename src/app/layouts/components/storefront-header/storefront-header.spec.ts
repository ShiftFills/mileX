import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { routes as appRoutes } from '../../../app.routes';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { Product } from '@shared/models';
import { StorefrontHeader } from './storefront-header';

const cartServiceStub = { provide: CartService, useValue: { count: () => 0 } };
const products = signal<Product[]>([]);
const catalogStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
const catalogError = signal<string | null>(null);
const categoryServiceStub = {
  provide: ProductCatalogService,
  useValue: {
    products: products.asReadonly(),
    status: catalogStatus.asReadonly(),
    error: catalogError.asReadonly(),
    load: () => undefined,
    loadCategories: () => of([
      { id: '31', label: 'Housewares' },
      { id: '44', label: 'Outdoor' },
    ]),
    getErrorMessage: () => 'Categories are unavailable.',
  },
};

@Component({ template: '' })
class TestHomePage {}

@Component({
  imports: [RouterOutlet, StorefrontHeader],
  template: '<app-storefront-header /><router-outlet />',
})
class TestStorefrontShell {}

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
      providers: [provideRouter([
        { path: 'checkout/address', children: [] },
        { path: 'auth/login', component: TestHomePage },
        { path: 'auth/register', component: TestHomePage },
      ]), cartServiceStub, categoryServiceStub],
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

  it('navigates to Login from the account menu', async () => {
    await openMenu();
    (root.querySelector('#account-menu a[href="/auth/login"]') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/auth/login');
  });

  it('navigates to Register from the account menu', async () => {
    await openMenu();
    (root.querySelector('#account-menu a[href="/auth/register"]') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/auth/register');
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

describe('StorefrontHeader auth navigation integration', () => {
  let fixture: ComponentFixture<TestStorefrontShell>;
  let root: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TestStorefrontShell],
      providers: [provideRouter(appRoutes), cartServiceStub, categoryServiceStub],
    }).compileComponents();

    fixture = TestBed.createComponent(TestStorefrontShell);
    root = fixture.nativeElement as HTMLElement;
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
  });

  afterEach(() => localStorage.clear());

  it('opens the real Login screen inside AuthLayout from the account menu', async () => {
    (root.querySelector('.store-header__account-trigger') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelector('#account-menu a[href="/auth/login"]') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/auth/login');
    expect(root.querySelector('.auth.auth--login app-login')).not.toBeNull();
  });

  it('opens the real Registration screen inside AuthLayout from the account menu', async () => {
    (root.querySelector('.store-header__account-trigger') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelector('#account-menu a[href="/auth/register"]') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/auth/register');
    expect(root.querySelector('.auth.auth--register app-register')).not.toBeNull();
  });
});

describe('StorefrontHeader Browse All Products menu', () => {
  let fixture: ComponentFixture<StorefrontHeader>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StorefrontHeader],
      providers: [provideRouter([{ path: 'products', children: [] }]), cartServiceStub, categoryServiceStub],
    }).compileComponents();
    fixture = TestBed.createComponent(StorefrontHeader);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function toggleMenu(): Promise<void> {
    (root.querySelector('.store-header__more-trigger') as HTMLButtonElement).click();
    await fixture.whenStable();
  }

  it('opens and closes from its toggle button', async () => {
    await toggleMenu();
    expect(root.querySelector('#more-menu')).not.toBeNull();

    await toggleMenu();
    expect(root.querySelector('#more-menu')).toBeNull();
  });

  it('stays open for clicks inside the menu', async () => {
    await toggleMenu();
    (root.querySelector('#more-menu') as HTMLElement).click();
    await fixture.whenStable();

    expect(root.querySelector('#more-menu')).not.toBeNull();
  });

  it('closes when clicking outside the menu and toggle', async () => {
    await toggleMenu();
    document.body.click();
    await fixture.whenStable();

    expect(root.querySelector('#more-menu')).toBeNull();
  });

  it('navigates to products and closes when selecting Browse all products', async () => {
    await toggleMenu();
    (root.querySelector('#more-menu a') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/products');
    expect(root.querySelector('#more-menu')).toBeNull();
  });
});

describe('StorefrontHeader mobile category popup', () => {
  let fixture: ComponentFixture<StorefrontHeader>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StorefrontHeader],
      providers: [provideRouter([
        { path: '', pathMatch: 'full', component: TestHomePage },
        { path: 'products', children: [] },
      ]), cartServiceStub, categoryServiceStub],
    }).compileComponents();
    fixture = TestBed.createComponent(StorefrontHeader);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function toggleMenu(): Promise<void> {
    (root.querySelector('.store-header__mobile-toggle') as HTMLButtonElement).click();
    await fixture.whenStable();
  }

  it('renders category labels and IDs from the category lookup', async () => {
    await toggleMenu();
    const labels = Array.from(root.querySelectorAll('#category-popup > a')).map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      'Home',
      'Housewares',
      'Outdoor',
      'Browse all products',
    ]);
    expect(root.querySelector('.store-header__category-menu-close')).toBeNull();
    expect(root.querySelector('#category-popup')?.textContent).not.toContain('All Categories');
    expect((root.querySelector('.store-header__all-categories') as HTMLButtonElement).textContent).toContain('All Categories');
  });

  it('opens and can be reopened after closing', async () => {
    await toggleMenu();
    expect(root.querySelector('#category-popup.is-open')).not.toBeNull();

    document.body.click();
    await fixture.whenStable();
    expect(root.querySelector('#category-popup.is-open')).toBeNull();

    await toggleMenu();
    expect(root.querySelector('#category-popup.is-open')).not.toBeNull();
  });

  it('stays open when clicking inside and closes when clicking outside', async () => {
    await toggleMenu();
    (root.querySelector('#category-popup') as HTMLElement).click();
    await fixture.whenStable();
    expect(root.querySelector('#category-popup.is-open')).not.toBeNull();

    document.body.click();
    await fixture.whenStable();
    expect(root.querySelector('#category-popup.is-open')).toBeNull();
  });

  it('closes when Escape is pressed', async () => {
    await toggleMenu();
    root.querySelector('.store-header__categories')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await fixture.whenStable();

    expect(root.querySelector('#category-popup.is-open')).toBeNull();
  });

  it('navigates using the selected category ID and closes the popup', async () => {
    await toggleMenu();
    (root.querySelector('#category-popup a[href*="category=31"]') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/products?category=31');
    expect(root.querySelector('#category-popup.is-open')).toBeNull();
  });

  it('navigates Home to the existing root route and closes the popup', async () => {
    await toggleMenu();
    (root.querySelector('#category-popup a[href="/"]') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/');
    expect(root.querySelector('#category-popup.is-open')).toBeNull();
  });

  it('uses the existing products route for More and closes the popup', async () => {
    await toggleMenu();
    (root.querySelector('#category-popup .store-header__category-popup-more') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/products');
    expect(root.querySelector('#category-popup.is-open')).toBeNull();
  });

  it('opens from the desktop All Categories hamburger as well', async () => {
    (root.querySelector('.store-header__all-categories') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(root.querySelector('#category-popup.is-open')).not.toBeNull();
  });

  it('aligns the mobile popup to the mobile hamburger trigger', async () => {
    const trigger = root.querySelector('.store-header__mobile-toggle') as HTMLButtonElement;
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 16, right: 390, top: 100, bottom: 148, width: 374, height: 48, x: 16, y: 100,
      toJSON: () => ({}),
    } as DOMRect);

    trigger.click();
    await fixture.whenStable();

    const popup = root.querySelector('#category-popup') as HTMLElement;
    expect(popup.style.left).toBe('16px');
    expect(popup.style.top).toBe('148px');
  });

  it('aligns the desktop popup to the desktop All Categories control', async () => {
    const trigger = root.querySelector('.store-header__all-categories') as HTMLButtonElement;
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 32, right: 150, top: 180, bottom: 232, width: 118, height: 52, x: 32, y: 180,
      toJSON: () => ({}),
    } as DOMRect);

    trigger.click();
    await fixture.whenStable();

    const popup = root.querySelector('#category-popup') as HTMLElement;
    expect(popup.style.left).toBe('32px');
    expect(popup.style.top).toBe('232px');
  });
});
