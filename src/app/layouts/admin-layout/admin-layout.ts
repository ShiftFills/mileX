import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { ClickOutside } from '@shared/directives/click-outside';
import { Sidebar, SidebarLink } from '../components/sidebar/sidebar';

@Component({
  selector: 'app-admin-layout',
  // CHANGED: ClickOutside closes the toolbar account menu (same pattern as the storefront header).
  imports: [ClickOutside, RouterLink, RouterOutlet, Sidebar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  // CHANGED (new): AuthService is injected so the sidebar menu can depend on the user's role.
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // CHANGED (new): toolbar account details come from the signed-in user (was hard-coded "Sujan Saha / Admin").
  protected readonly isAuthenticated = this.auth.isAuthenticated;
  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    if (!user) return '';
    return (
      user.userName?.trim() ||
      `${user.firstName} ${user.lastName}`.trim() ||
      user.email.trim() ||
      this.roleLabel()
    );
  });
  /** USER_TYPE as a label, e.g. ADMIN → "Admin", SELLER → "Seller". */
  protected readonly roleLabel = computed(() =>
    (this.auth.userType() ?? '')
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase()),
  );
  /** Up to two initials, e.g. "Sujan Saha" → "SS", "sujan.saha@milex.in" → "SS", "admin" → "A". */
  protected readonly initials = computed(() => {
    const words = this.displayName().split('@')[0].split(/[\s._-]+/).filter(Boolean);
    const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
    return letters.map((word) => word.charAt(0)).join('').toUpperCase();
  });
  protected readonly accountMenuOpen = signal(false);
  protected readonly logoutIcon = 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9';

  private readonly productLinks: SidebarLink = {
    label: 'Products',
    path: '/admin/products',
    icon: 'products',
    children: [
      { label: 'All Products', path: '/admin/products/all' },
      { label: 'Add Product', path: '/admin/products/new' },
      { label: 'Variants', path: '/admin/products/variants' },
    ],
  };

  // CHANGED (new): shared by the Admin and Seller menus.
  private readonly orderManagementLink: SidebarLink = {
    label: 'Order Management',
    path: '/admin/orders',
    icon: 'orders',
  };

  // CHANGED (new): shared by the Admin and Seller menus.
  private readonly returnRequestLink: SidebarLink = {
    label: 'Return Request',
    path: '/admin/returns',
    icon: 'returns',
  };

  private readonly adminLinks: SidebarLink[] = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    this.productLinks,
    // { label: 'Shopping Cart', path: '/cart', icon: 'cart' },/
    this.orderManagementLink,
    this.returnRequestLink,
    { label: 'Seller Verification', path: '/admin/sellers', icon: 'sellers' },
    { label: 'My Orders', path: '/admin/my-orders', icon: 'my-orders' },
  ];

  // CHANGED: Sellers may use product management, order management and return requests in this area
  // (see roleMatchGuard), so only those menus are shown to them, in the same order as the Admin menu;
  // every other entry would just bounce them back out. Admins keep the full menu. Admin menu items are unchanged.
  private readonly sellerLinks: SidebarLink[] = [
    this.productLinks,
    this.orderManagementLink,
    this.returnRequestLink,
  ];

  protected readonly links: SidebarLink[] =
    this.auth.user()?.userType?.trim().toUpperCase() === 'SELLER'
      ? this.sellerLinks
      : this.adminLinks;

  protected toggleAccountMenu(): void {
    this.accountMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  // CHANGED (new): Logout clears the session (user, token and per-user data) and opens the login screen.
  protected logout(): void {
    this.closeAccountMenu();
    this.auth.clearSession();
    void this.router.navigateByUrl(APP_ROUTES.login);
  }
}