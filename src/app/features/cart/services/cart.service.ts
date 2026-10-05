import { Injectable, computed, signal } from '@angular/core';
import { CartItem } from '@shared/models';

/** Cart state lives in a root-level service so it survives navigation. */
@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>([]);

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().reduce((sum, i) => sum + i.quantity, 0));

  // add / remove / update-quantity / persistence will be added here.
}
