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

  private readonly adminLinks: SidebarLink[] = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    this.productLinks,
    // { label: 'Shopping Cart', path: '/cart', icon: 'cart' },/
    { label: 'Order Management', path: '/admin/orders', icon: 'orders' },
    { label: 'Return Request', path: '/admin/returns', icon: 'returns' },
    { label: 'Seller Verification', path: '/admin/sellers', icon: 'sellers' },
    { label: 'My Orders', path: '/admin/my-orders', icon: 'my-orders' },
  ];

  // Sellers may only use product management in this area (see roleMatchGuard), so only that
  // menu is shown to them; every other entry would just bounce them back out.
  // Admins keep the full menu.
  protected readonly links: SidebarLink[] =
    this.auth.user()?.userType?.trim().toUpperCase() === 'SELLER'
      ? [this.productLinks]
      : this.adminLinks;
}