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

export type OrderSummaryStatus = 'Delivered' | 'Shipped' | 'Processing';

export interface OrderSummaryItem {
  name: string;
  variant: string;
  quantity: number;
  image: string;
}

/** Compact order row used by order-history lists (storefront "My Orders" and the admin copy). */
export interface OrderSummary {
  id: string;
  placedOn: string;
  total: number;
  status: OrderSummaryStatus;
  statusNote: string;
  trackingNo: string;
  items: OrderSummaryItem[];
}
