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
  /** CHANGED (new): S3 key of the product image (PRODUCT_IMAGE "<folder>/<file name>"); shown as its signed URL. */
  imageKey?: string;
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

/**
 * One row of customer_orders/get with every field the API sends. The API returns one row per ordered
 * product; rows that share an ORDER_NUMBER belong to the same order. Amounts the API leaves out are null
 * (never 0), so a missing value is not shown as a real charge.
 */
export interface CustomerOrderLine {
  orderId: number;
  orderNumber: string;
  productId: number;
  productVariantId: number | null;
  quantity: number;
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  shippingCharges: number | null;
  total: number;
  /** PAYMENT_METHOD_ID from payment_method/get. */
  paymentMethodId: number | null;
  orderDate: string;
  status: string;
}

/** Every customer_orders/get row of one order number, in API order (at least one). */
export interface CustomerOrderDetail {
  orderNumber: string;
  lines: CustomerOrderLine[];
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