import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { PageHeader } from '@shared';
import { Card } from '@shared/components/card/card';

@Component({
  selector: 'app-storefront-info',
  imports: [Card, PageHeader, RouterLink],
  templateUrl: './storefront-info.html',
  styleUrl: './storefront-info.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontInfo {
  protected readonly heading = input.required<string>();
  protected readonly subtitle = input.required<string>();
  protected readonly routes = APP_ROUTES;
}
