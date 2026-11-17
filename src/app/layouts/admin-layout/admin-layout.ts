import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { Sidebar, SidebarLink } from '../components/sidebar/sidebar';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterOutlet, Sidebar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  // CHANGED (new): AuthService is injected so the sidebar menu can depend on the user's role.
  private readonly auth = inject(AuthService);

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
  private readonly returnRequestLink: SidebarLink = {
    label: 'Return Request',
    path: '/admin/returns',
    icon: 'returns',
  };

  private readonly adminLinks: SidebarLink[] = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    this.productLinks,
    // { label: 'Shopping Cart', path: '/cart', icon: 'cart' },/
    { label: 'Order Management', path: '/admin/orders', icon: 'orders' },
    this.returnRequestLink,
    { label: 'Seller Verification', path: '/admin/sellers', icon: 'sellers' },
    { label: 'My Orders', path: '/admin/my-orders', icon: 'my-orders' },
  ];

  // CHANGED: Sellers may use product management and return requests in this area (see roleMatchGuard),
  // so only those menus are shown to them; every other entry would just bounce them back out.
  // Admins keep the full menu. Admin menu items are unchanged.
  private readonly sellerLinks: SidebarLink[] = [this.productLinks, this.returnRequestLink];

  protected readonly links: SidebarLink[] =
    this.auth.user()?.userType?.trim().toUpperCase() === 'SELLER'
      ? this.sellerLinks
      : this.adminLinks;
}