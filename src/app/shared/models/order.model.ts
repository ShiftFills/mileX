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
  productId?: number;
  productVariantId?: number | null;
  name?: string;
  variant?: string;
  quantity: number;
  image?: string;
}

/** Compact order row used by order-history lists (storefront "My Orders" and the admin copy). */
export interface OrderSummary {
  id: string;
  orderId?: number;
  placedOn: string;
  total: number;
  status: string;
  statusNote?: string;
  trackingNo?: string;
  items: OrderSummaryItem[];
}

export interface CustomerOrdersPage {
  orders: OrderSummary[];
  totalRecords: number;
}

/** Request body for POST place_order. Field names match the backend exactly. */
export interface PlaceOrderPayload {
  /** 0 places an order for every product in the cart; a CART_ID orders only that cart row. */
  CART_ID: number;
  DELIVERY_ADDRESS_ID: number;
  BILLING_ADDRESS_ID: number;
  /** PAYMENT_METHOD_ID of the chosen method (payment_method/get). */
  PAYMENT_METHOD: number;
  SHIPPING_CHARGES: number;
}

/** What the page gets back from place_order. The response format is not confirmed yet. */
export interface PlaceOrderResult {
  /** The API's message, or a default when the response has none. */
  message: string;
  /** Set only when the response contains an order number. */
  orderNumber?: string;
}