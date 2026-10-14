import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Sidebar, SidebarLink } from '../components/sidebar/sidebar';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterOutlet, Sidebar],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayout {
  protected readonly links: SidebarLink[] = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: 'dashboard' },
    {
      label: 'Products',
      path: '/admin/products',
      icon: 'products',
      children: [
        { label: 'All Products', path: '/admin/products/all' },
        { label: 'Add Product', path: '/admin/products/new' },
        { label: 'Variants', path: '/admin/products/variants' },
      ],
    },
  ];
}
