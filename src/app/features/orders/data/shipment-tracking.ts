import { ShipmentTracking } from '@shared/models';

/** Order id used by the design; any order in the history resolves to the same demo shipment. */
export const DEMO_TRACKING_ORDER_ID = 'ORD-569874';

const HEADPHONES_ICON = 'M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zM20 15a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z';
const CABLE_ICON = 'M7 3v4M11 3v4M5 7h8v3a4 4 0 0 1-8 0zM9 14v3a3 3 0 0 0 6 0v-5M15 12h4';

/** Demo shipment until the tracking API exists (see OrderService.findTracking). */
export const DEMO_SHIPMENT: ShipmentTracking = {
  orderId: DEMO_TRACKING_ORDER_ID,
  placedOn: '2026-09-22',
  carrier: {
    name: 'Delhivery Express',
    code: 'DEL',
    color: '#e63946',
    trackingNo: 'TRK1234567890',
    siteUrl: 'https://www.delhivery.com/',
  },
  scheduleStatus: 'On Schedule',
  onSchedule: true,
  estimatedDelivery: '2026-09-28',
  currentLocation: 'Chennai Sorting Hub',
  steps: [
    { label: 'Order Placed', caption: '22 Sep, 10:30 AM' },
    { label: 'Packed', caption: '23 Sep, 04:15 PM' },
    { label: 'Shipped', caption: '24 Sep, 02:00 PM' },
    { label: 'In Transit', caption: 'Near Chennai Hub' },
    { label: 'Delivered', caption: 'Pending Arrival' },
  ],
  currentStep: 3,
  distanceKm: 14.2,
  route: { title: 'En route to Chennai Delivery Hub', driver: 'Ramesh K.', vehicle: 'TN-07-BX-4921' },
  items: [
    { name: 'Sony WH-1000XM5 Wireless Headphones', sku: 'SNY-HP-05', quantity: 1, price: 3499, imageUrl: '/images/wishlist/headphones.jpg', icon: HEADPHONES_ICON, tone: 'accent' },
    { name: 'Anker USB-C Fast Charging Cable (6ft)', sku: 'ANK-CB-01', quantity: 1, price: 199.99, icon: CABLE_ICON, tone: 'neutral' },
  ],
  address: {
    name: 'Sujan Saha',
    lines: ['Flat 4B, Emerald Heights, Anna Nagar East', 'Chennai, Tamil Nadu - 600102'],
    phone: '+91 98765 43210',
  },
  payment: { method: 'Visa ending in 4242', badge: 'VISA', status: 'Paid', authorizedOn: '2026-09-22' },
};
