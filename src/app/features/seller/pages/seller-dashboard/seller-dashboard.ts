import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-seller-dashboard',
  templateUrl: './seller-dashboard.html',
  styleUrl: './seller-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerDashboard {
  protected readonly user = inject(AuthService).user;
}
