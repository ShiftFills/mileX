export type RefundStatus = 'Completed' | 'Processing';

export interface RefundItem {
  name: string;
  variant: string;
  quantity: number;
  price: number;
  returnReason: string;
}

export interface Refund {
  /** Return number; also the route id (`/refund/:id`). */
  id: string;
  orderNo: string;
  amount: number;
  status: RefundStatus;
  /** Shown as "Credited via ...". */
  creditedVia: string;
  /** Payment instrument, e.g. "Visa ending in 4242". */
  method: string;
  reference: string;
  /** ISO date the refund was processed. */
  processedOn: string;
  /** Zero-based index of the current lifecycle step (see REFUND_STEPS on the refund page). */
  stage: number;
  items: RefundItem[];
}

export interface ReturnRequestsQuery {
  DAYS: number;
  RETURN_STATUS: number;
  RETURN_REASON: number;
  LIMIT: number;
  OFFSET: number;
}

/** Seller login: `return_request/get?SELLER_ID=…&LIMIT=…&OFFSET=…` (no day/status/reason filters). */
// CHANGED (new): query for the Seller variant of the Return Request listing.
export interface SellerReturnRequestsQuery {
  SELLER_ID: number;
  LIMIT: number;
  OFFSET: number;
}

export interface ReturnRequestRow {
  returnId: number;
  orderId: number | null;
  orderNumber: string | null;
  productId: number | null;
  productName: string | null;
  quantity: number | null;
  reason: string | null;
  description: string | null;
  images: string[];
  pickupAddressId: number | null;
  address: string | null;
  sellerId: number | null;
  customerId: number | null;
  customerName: string | null;
  customerMobile: string | null;
  variantId: number | null;
  status: string | null;
  createdAt: string | null;
}

export interface ReturnRequestsPage {
  requests: ReturnRequestRow[];
  totalRecords: number;
}

export interface ReturnRequestStatusUpdate {
  RETURN_ID: number;
  RETURN_STATUS: 'APPROVED' | 'REJECTED';
}
