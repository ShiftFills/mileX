/**
 * One payment method from GET payment_method/get. Field names match the backend exactly.
 * The UI only needs PAYMENT_METHOD_ID (kept when the customer selects a method) and
 * PAYMENT_METHOD_NAME (shown as the label); the audit fields are optional.
 */
export interface PaymentMethod {
  PAYMENT_METHOD_ID: number;
  PAYMENT_METHOD_NAME: string;
  CREATED_AT?: string | null;
  CREATED_BY?: number | null;
  UPDATED_AT?: string | null;
  UPDATED_BY?: number | null;
}