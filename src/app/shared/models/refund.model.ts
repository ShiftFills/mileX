/**
 * One refund of the customer Refund screen: a row of GET refund (`?ORDER_NUMBER=…&ORDER_ID=…`). Each refund belongs
 * to one return request (RETURN_ID / RETURN_NUMBER) of one product of the order (the ORDER_ID order line, with its
 * PRODUCT_ID and VARIANT_ID). A field the API leaves out (or sends in a form that cannot be read) is null; a missing
 * amount is null, never 0, so it is not shown as a real refund.
 */
// CHANGED: mapped from the refund API (it was the demo refund: return number as id, items, return reason, stage).
export interface RefundDetail {
  /** REFUND_ID; null when the API sends none (the refund is then identified by its RETURN_ID). */
  refundId: number | null;
  orderNumber: string;
  /** ORDER_ID: the order line (one product of the order) the refund is for. */
  orderId: number;
  returnId: number | null;
  returnNumber: string | null;
  productId: number | null;
  productName: string | null;
  /** VARIANT_ID; null for a product ordered without a variant (or when the API sends none). */
  variantId: number | null;
  variantName: string | null;
  amount: number | null;
  /** REFUND_METHOD (a REFUND_METHOD_ID of refund_method) and its REFUND_METHOD_NAME, e.g. "UPI". */
  methodId: number | null;
  methodName: string | null;
  reference: string | null;
  /** REFUND_DATE as the API sent it (ISO); null when it is not a valid date. */
  date: string | null;
  /** REFUND_STATUS, e.g. "REFUNDED". */
  status: string | null;
  /** RETURN_STATUS (a RETURN_STATUS_ID of return_status) and its RETURN_STATUS_NAME. */
  returnStatusId: number | null;
  returnStatusName: string | null;
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
  /** The status name (RETURN_STATUS_NAME, else a text RETURN_STATUS); may be an ID when the API sends only that. */
  status: string | null;
  createdAt: string | null;
  /**
   * CHANGED (new): IDs for the Admin screen, each null when the API does not send it: the return status
   * (RETURN_STATUS_ID, or a numeric RETURN_STATUS; an ID of the all_status/get list), the return reason
   * (RETURN_REASON_ID / REASON_ID), and the return type chosen by the customer (RETURN_OPTION: the SHIPPING_STATUS_ID
   * of RETURN/REFUND or RETURN/REPLACE) with its name when sent (RETURN_OPTION_NAME). sellerName is SELLER_NAME /
   * BUSINESS_NAME when sent.
   */
  statusId: number | null;
  reasonId: number | null;
  returnOptionId: number | null;
  returnOptionName: string | null;
  sellerName: string | null;
}

export interface ReturnRequestsPage {
  requests: ReturnRequestRow[];
  totalRecords: number;
}

// CHANGED: ReturnRequestStatusUpdate (`{ RETURN_ID, RETURN_STATUS: 'APPROVED' | 'REJECTED' }`) is removed: the backend
// refuses that body. Approve / Reject send ReturnRequestReview below.

/** The Admin's decision on a return request (also the status it leads to: Approved / Rejected). */
// CHANGED (new)
export type ReturnDecision = 'APPROVED' | 'REJECTED';

/**
 * Request body of PUT return_request/update, from the Return Request screen's actions dialog: the request's ID, the
 * Return Status picked (a SHIPPING_STATUS_ID), and ACTION: APPROVED / REJECTED for Approve / Reject, null for Save Status
 * (the status only).
 */
// CHANGED (new)
// CHANGED: ACTION is APPROVED / REJECTED (it was APPROVE / REJECT), or null for a status-only update.
export interface ReturnRequestReview {
  RETURN_ID: number;
  RETURN_STATUS: number;
  ACTION: ReturnDecision | null;
}

/**
 * Request body for POST return_request (the customer's Cancel / Return Item). Field names match the backend
 * contract exactly; the access token identifies the customer. One request returns one product of the order.
 */
// CHANGED (new)
// CHANGED: the backend contract's full body (RETURN_OPTION, PRODUCT_ID, VARIANT_ID, SELLER_ID, PICKUP_ADDRESS_ID).
// CHANGED: with ORDER_ID and REFUND_METHOD.
export interface ReturnRequestInsert {
  ORDER_NUMBER: string;
  /** CHANGED (new): ORDER_ID of the chosen product's order line (return_dropdown). */
  ORDER_ID: number;
  /** REASON_ID from return_reason/get. */
  REASON_ID: number;
  /** The customer's additional details ('' when none were given). */
  RETURN_DESCRIPTION: string;
  /** CHANGED: the Return Type: RETURN_STATUS_ID of RETURN/REFUND or RETURN/REPLACE (return_status; it was a
   * SHIPPING_STATUS_ID of shipping_status/get). */
  RETURN_OPTION: number;
  /**
   * CHANGED: PRODUCT_ID and VARIANT_ID (PRODUCT_VARIANT_ID) are the chosen product's (return_dropdown); SELLER_ID and
   * PICKUP_ADDRESS_ID (DELIVERY_ADDRESS_ID) come from that product's own tracking row. VARIANT_ID is null for a
   * product ordered without a variant.
   */
  PRODUCT_ID: number;
  VARIANT_ID: number | null;
  SELLER_ID: number;
  PICKUP_ADDRESS_ID: number;
  /** CHANGED (new): REFUND_METHOD_ID of the chosen refund method (refund_method) for a refund; null otherwise. */
  REFUND_METHOD: number | null;
}

/** CHANGED (new): one product of an order a return can be requested for (return_dropdown). */
export interface ReturnProductOption {
  /** ORDER_ID: the product's order line. */
  orderId: number;
  orderNumber: string;
  productId: number;
  /** PRODUCT_VARIANT_ID, or null for a product ordered without a variant. */
  variantId: number | null;
  /** PRODUCT_NAME. */
  name: string;
}

/**
 * POST return_request's answer (`{ STATUS, ORDER_NUMBER, RETURN_REASON_ID, RETURN_REASON, RETURN_REQUEST_COUNT,
 * RETURN_STATUS_ID, RETURN_STATUS_NAME }`). A field the API leaves out is null.
 */
// CHANGED (new)
export interface ReturnRequestResult {
  orderNumber: string | null;
  reasonId: number | null;
  reason: string | null;
  /** RETURN_REQUEST_COUNT: the return requests the order now has. */
  requestCount: number | null;
  statusId: number | null;
  /** RETURN_STATUS_NAME, e.g. "PENDING". */
  statusName: string | null;
  /** The API's message, or a default confirmation. */
  message: string;
}
