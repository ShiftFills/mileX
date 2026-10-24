import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { StorefrontHeader } from './storefront-header';

@Component({ template: '' })
class TestHomePage {}

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

describe('StorefrontHeader Browse All Products menu', () => {
  let fixture: ComponentFixture<StorefrontHeader>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StorefrontHeader],
      providers: [provideRouter([{ path: 'products', children: [] }])],
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
      ])],
    }).compileComponents();
    fixture = TestBed.createComponent(StorefrontHeader);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  async function toggleMenu(): Promise<void> {
    (root.querySelector('.store-header__mobile-toggle') as HTMLButtonElement).click();
    await fixture.whenStable();
  }

  it('renders the Figma category menu items in reference order', async () => {
    await toggleMenu();
    const labels = Array.from(root.querySelectorAll('#category-popup > a')).map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      'Home',
      'Fashion',
      'Electronics',
      'Home & Living',
      'Beauty & Personal Care',
      'Sports & Fitness',
      'Toys & Baby',
      'Books & Stationery',
      'Home Appliances',
      'Jewellery & Accessories',
      'Automotive',
      'Mobiles & Tablets',
      'More',
    ]);
    expect(root.querySelector('.store-header__category-menu-close')).toBeNull();
    expect(root.querySelector('#category-popup a[href="/"] svg')).toBeNull();
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

  it('navigates to a category and closes the popup', async () => {
    await toggleMenu();
    (root.querySelector('#category-popup a[href*="category=fashion"]') as HTMLAnchorElement).click();
    await fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/products?category=fashion');
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
