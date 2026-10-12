import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CartService } from '@core/services/cart.service';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Input } from '@shared/components/input/input';
import { PageHeader } from '@shared';
import { Radio } from '@shared/components/radio/radio';

@Component({
  selector: 'app-checkout',
  imports: [Button, Card, CurrencyPipe, Input, PageHeader, Radio, RouterLink],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Checkout {
  protected readonly cart = inject(CartService);
  protected readonly routes = APP_ROUTES;
  protected readonly placed = signal(false);

  protected placeDemoOrder(event: SubmitEvent): void {
    event.preventDefault();
    this.placed.set(true);
    this.cart.clear();
  }
}
