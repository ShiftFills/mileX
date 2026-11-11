import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { Sidebar, SidebarLink } from '../components/sidebar/sidebar';

@Component({
  selector: 'app-seller-layout',
  imports: [RouterLink, RouterOutlet, Sidebar],
  templateUrl: './seller-layout.html',
  styleUrl: './seller-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly links: SidebarLink[] = [
    { label: 'Dashboard', path: APP_ROUTES.sellerDashboard, icon: 'dashboard' },
  ];

  protected logout(): void {
    this.auth.clearSession();
    void this.router.navigateByUrl(APP_ROUTES.login);
  }
}
