import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { ProductLookupOption } from '@core/services/product-catalog.service';

@Component({
  selector: 'app-hero-banner',
  imports: [RouterLink],
  templateUrl: './hero-banner.html',
  styleUrl: './hero-banner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroBanner {
  protected readonly routes = APP_ROUTES;
  readonly categories = input<readonly ProductLookupOption[]>([]);
}
