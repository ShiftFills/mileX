export type AddressType = 'home' | 'work' | 'other';

/** A delivery address a customer can pick at checkout. */
export interface DeliveryAddress {
  id: string;
  type: AddressType;
  fullName: string;
  /** Ten-digit mobile number, without country code. */
  mobile: string;
  pincode: string;
  house: string;
  street: string;
  landmark?: string;
  city: string;
  state: string;
}
