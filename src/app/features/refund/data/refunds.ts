import { Refund } from '@shared/models';

/** Demo refunds until the refunds API exists (see RefundService). */
export const REFUNDS: readonly Refund[] = [
  {
    id: 'RET-884912',
    orderNo: 'ORD-569874',
    amount: 1499,
    status: 'Completed',
    creditedVia: 'Original Payment Method',
    method: 'Visa ending in 4242',
    reference: 'REF-TXN-9982310',
    processedOn: '2026-09-26',
    stage: 4,
    items: [
      {
        name: 'Sony Noise-Cancelling Headphones - Black',
        variant: 'Standard / Matte Black',
        quantity: 1,
        price: 1499,
        returnReason: 'Defective audio output on right cup',
      },
    ],
  },
];
