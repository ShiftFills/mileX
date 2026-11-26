import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  private readonly auth = inject(AuthService);
  protected readonly year = new Date().getFullYear();
  protected readonly routes = APP_ROUTES;
  /** My Orders (customer login only): shown to customers and visitors, not to Admin or Seller accounts. */
  // CHANGED (new)
  protected readonly showMyOrders = computed(
    () => !this.auth.isAuthenticated() || this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER',
  );
}
