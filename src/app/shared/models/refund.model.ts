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
