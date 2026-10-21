import { CartItem } from './cart.model';
import { Address } from './user.model';

export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  items: CartItem[];
  shippingAddress: Address;
  total: number;
  status: OrderStatus;
  createdAt: string;
}
