import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CartService } from '../../services/cart.service';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Input } from '@shared/components/input/input';
import { PageHeader } from '@shared';

@Component({
  selector: 'app-cart',
  imports: [Button, Card, CurrencyPipe, Input, PageHeader, RouterLink],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cart {
  protected readonly cart = inject(CartService);
  protected readonly routes = APP_ROUTES;

  protected setQuantity(productId: string, event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      const quantity = Number(input.value);
      if (Number.isInteger(quantity) && quantity > 0) {
        this.cart.setQuantity(productId, quantity);
      } else {
        input.value = String(
          this.cart.items().find((item) => item.product.id === productId)?.quantity ?? 1,
        );
      }
    }
  }
}
