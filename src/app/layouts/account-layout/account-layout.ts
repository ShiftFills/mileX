import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
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
  private readonly auth = inject(AuthService);
  // CHANGED: Orders (My Orders, customer login only) is listed for customer accounts only.
  protected readonly links = computed<SidebarLink[]>(() => [
    { label: 'Profile', path: '/account/profile' },
    { label: 'Addresses', path: '/account/addresses' },
    ...(this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER' ? [{ label: 'Orders', path: '/orders' }] : []),
  ]);
}
