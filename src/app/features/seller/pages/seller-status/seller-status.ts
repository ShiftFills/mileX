import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';

@Component({
  selector: 'app-seller-status',
  imports: [RouterLink],
  templateUrl: './seller-status.html',
  styleUrl: './seller-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerStatusPage {
  private readonly route = inject(ActivatedRoute);

  protected readonly routes = APP_ROUTES;
  protected readonly sellerStatus = this.route.snapshot.data['sellerStatus'] as string;
  protected readonly rejected = this.sellerStatus === 'REJECTED';
  protected readonly unavailable = this.sellerStatus === 'UNAVAILABLE';
}
