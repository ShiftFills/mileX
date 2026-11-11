export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userName?: string;
  userType?: string;
  userTypeId?: number;
}

export interface Address {
  id: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}
