import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar, SidebarLink } from '../components/sidebar/sidebar';
import { Card } from '@shared/components/card/card';

/** Nested inside MainLayout: adds a sidebar for the signed-in account area. */
@Component({
  selector: 'app-account-layout',
  imports: [Card, RouterOutlet, Sidebar],
  templateUrl: './account-layout.html',
  styleUrl: './account-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountLayout {
  protected readonly links: SidebarLink[] = [
    { label: 'Profile', path: '/account/profile' },
    { label: 'Addresses', path: '/account/addresses' },
    { label: 'Orders', path: '/orders' },
  ];
}
