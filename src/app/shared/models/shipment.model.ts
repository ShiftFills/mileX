export interface ShipmentCarrier {
  name: string;
  /** Short code shown in the carrier badge, e.g. "BLU". */
  code: string;
  /** Badge background colour. */
  color: string;
  trackingNo: string;
  /** The carrier's tracking website; absent for a carrier the app has no website for. */
  // CHANGED: optional (the tracking API sends no carrier URL; known carriers get one from a fixed list).
  siteUrl?: string;
}

export interface ShipmentStep {
  label: string;
  /** A date for the steps the API dates (order placed, shipped, expected delivery); otherwise empty. */
  caption: string;
}

export interface ShipmentItem {
  /**
   * The IDs of this product's tracking row, which a Cancel / Return Item request sends: ORDER_ID, PRODUCT_ID,
   * PRODUCT_VARIANT_ID, SELLER_ID, SHIPPING_ID and DELIVERY_ADDRESS_ID (the pickup address). Each is set only when
   * the row has a valid one; variantId is null when the row says the product was ordered without a variant. They are
   * kept per product, so a return never mixes the IDs of two products of one order.
   */
  // CHANGED (new)
  orderId?: number;
  productId?: number;
  variantId?: number | null;
  sellerId?: number;
  shippingId?: number;
  deliveryAddressId?: number;
  name: string;
  /** SKU, or '' when the API sends none. */
  sku: string;
  // CHANGED: null when the API sends no valid value (the page then leaves it out instead of showing 0).
  quantity: number | null;
  /** Unit price (PRICE). */
  price: number | null;
  /** Optional product thumbnail used in shipment actions. */
  imageUrl?: string;
  /** SVG path data on a 24x24 grid. */
  icon: string;
  tone: 'accent' | 'neutral';
}

/**
 * Order amounts as the tracking API sends them (SUBTOTAL, DISCOUNT, TAX, TOTAL_AMOUNT). An amount the API leaves out
 * is null (never 0). `shipping` is TOTAL_AMOUNT − (SUBTOTAL + TAX − DISCOUNT), null when that is not more than 0.
 */
// CHANGED (new)
export interface ShipmentTotals {
  subtotal: number | null;
  discount: number | null;
  tax: number | null;
  shipping: number | null;
  total: number | null;
}

/** Tracking details of one order's shipment (GET tracking?ORDER_NUMBER=…). */
// CHANGED: from the tracking API (it was demo data). Fields the API does not send are optional and the page hides
// what is missing: currentLocation, distanceKm, route and payment.
export interface ShipmentTracking {
  /** ORDER_NUMBER, e.g. "ORD0016". */
  orderId: string;
  /** ORDER_DATE (ISO), or '' when the API sends no valid date. */
  placedOn: string;
  // CHANGED (new): ORDER_STATUS_NAME and the shipping status (ORDER_SHIPPING_STATUS_ID / _NAME).
  orderStatus?: string;
  shippingStatusId?: number;
  shippingStatus?: string;
  // CHANGED (new): SHIPMENT_NUMBER and SHIPPING_DATE ("Shipped on", ISO).
  shipmentNumber?: string;
  shippedOn?: string;
  carrier: ShipmentCarrier;
  /** Human readable schedule state, e.g. "On schedule" (STATUS). */
  scheduleStatus: string;
  onSchedule: boolean;
  /** EXPECTED_DELIVERY_DATE (ISO), or null when the API sends no valid date. */
  // CHANGED: null when missing or invalid (it was always a date).
  estimatedDelivery: string | null;
  /**
   * Live tracking details for the Live Tracking UI (status card and Live Route GPS Tracking card), each shown only when
   * set: the package's current location, the distance left, and the route title, driver and vehicle. No API sends them
   * yet, so mapShipmentTracking sets none (backend dependency).
   */
  // CHANGED: each route detail is optional (the card shows whichever ones are sent).
  currentLocation?: string;
  steps: ShipmentStep[];
  /**
   * Zero-based index of the step the package is at (from ORDER_SHIPPING_STATUS_NAME); steps.length once delivered,
   * when every step is completed.
   */
  // CHANGED: steps.length when delivered (it was the last step's index, shown as the current step).
  currentStep: number;
  distanceKm?: number;
  route?: { title?: string; driver?: string; vehicle?: string };
  items: ShipmentItem[];
  /**
   * The delivery address: a name and phone when DELIVERY_ADDRESS has them ('' otherwise), its lines, and its city when
   * it ends in city, state, country and PIN.
   */
  // CHANGED: city (the destination in the Live Route GPS Tracking card).
  address: { name: string; lines: string[]; phone: string; city?: string };
  // CHANGED (new)
  totals?: ShipmentTotals;
  payment?: { method: string; badge: string; status: string; authorizedOn: string };
  /**
   * What the customer can do from the page once the backend has an API for it: `reschedule` shows the Reschedule
   * button, `invoiceUrl` the Invoice PDF link (in Payment & Billing). Neither exists yet, so both stay hidden.
   */
  // CHANGED (new)
  actions?: { reschedule?: boolean; invoiceUrl?: string };
}

// CHANGED: LiveShipmentTracking and hasLiveTracking() are removed: the Live Route GPS Tracking card is always shown
// (as in the design) and shows each live detail only when the API sends it.
