import { OrderSummary } from '@shared/models';

/** Demo order history until the orders API exists (see OrderService). */
export const ORDER_SUMMARIES: readonly OrderSummary[] = Array.from({ length: 8 }, (_, index) => ({
  id: `ORD-${2408 + index}`,
  placedOn: '18 Apr 2026',
  total: 4980,
  status: 'Delivered',
  statusNote: 'Delivered on 21 Apr 2026',
  trackingNo: '732418563210',
  items: [
    { name: 'Ear Phones', variant: 'Black', quantity: 1, image: '/images/headphones.svg' },
    { name: 'Sneakers', variant: 'White / 42', quantity: 1, image: '/images/sneakers.svg' },
  ],
}));
