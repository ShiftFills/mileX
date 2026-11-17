export type AddressType = 'home' | 'work' | 'other';

/** A delivery address a customer can pick at checkout (one row of customer_address/get). */
export interface DeliveryAddress {
  /** ADDRESS_ID from the backend, as a string (convert with Number() for API calls). */
  id: string;
  /** Type shown in the UI. Any backend value other than HOME or WORK is shown as 'other'. */
  type: AddressType;
  /**
   * ADDRESS_TYPE exactly as the backend returned it (for example 'pg').
   * Sent back unchanged when the user edits the address without changing its type.
   */
  apiType: string;
  fullName: string;
  /** Ten-digit mobile number, without country code. */
  mobile: string;
  pincode: string;
  /** ADDRESS_LINE_1 */
  house: string;
  /** ADDRESS_LINE_2 */
  street: string;
  landmark?: string;
  city: string;
  state: string;
  country: string;
  /** True when the backend reports DEFAULT_ADDRESS = 1. */
  isDefault: boolean;
}

/** Request body for POST customer_address/insert. Field names match the backend exactly. */
export interface CustomerAddressInsertPayload {
  ADDRESS_TYPE: string;
  FULL_NAME: string;
  MOBILE_NUMBER: string;
  ADDRESS_LINE_1: string;
  ADDRESS_LINE_2: string;
  LANDMARK: string;
  CITY: string;
  STATE: string;
  COUNTRY: string;
  PINCODE: string;
  DEFAULT_ADDRESS: 0 | 1;
  CUSTOMER_ID: number;
}

/**
 * Request body for PUT customer_address/update.
 * Same fields as the insert payload (including CUSTOMER_ID), plus the ADDRESS_ID of the address
 * being updated. CUSTOMER_ID is the logged-in customer's id from AuthService.customerId().
 */
export interface CustomerAddressUpdatePayload extends CustomerAddressInsertPayload {
  ADDRESS_ID: number;
}