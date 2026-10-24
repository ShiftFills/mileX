export interface ShipmentCarrier {
  name: string;
  /** Short code shown in the carrier badge, e.g. "DEL". */
  code: string;
  /** Badge background colour. */
  color: string;
  trackingNo: string;
  siteUrl: string;
}

export interface ShipmentStep {
  label: string;
  /** Date/time for finished steps, current location for the active one, a hint for upcoming ones. */
  caption: string;
}

export interface ShipmentItem {
  name: string;
  sku: string;
  quantity: number;
  /** Unit price. */
  price: number;
  /** Optional product thumbnail used in shipment actions. */
  imageUrl?: string;
  /** SVG path data on a 24x24 grid. */
  icon: string;
  tone: 'accent' | 'neutral';
}

/** Tracking details for one order's shipment (demo data until a tracking API exists). */
export interface ShipmentTracking {
  orderId: string;
  /** ISO date the order was placed. */
  placedOn: string;
  carrier: ShipmentCarrier;
  /** Human readable schedule state, e.g. "On Schedule". */
  scheduleStatus: string;
  onSchedule: boolean;
  /** ISO date. */
  estimatedDelivery: string;
  currentLocation: string;
  steps: ShipmentStep[];
  /** Zero-based index of the step the package is at. */
  currentStep: number;
  distanceKm: number;
  route: { title: string; driver: string; vehicle: string };
  items: ShipmentItem[];
  address: { name: string; lines: string[]; phone: string };
  payment: { method: string; badge: string; status: string; authorizedOn: string };
}
