import type { StepperStep } from '@shared/components/stepper/stepper';

/** Orders above this subtotal ship free (matches the storefront header banner). */
export const FREE_SHIPPING_THRESHOLD = 999;

/** Indian PIN code: six digits, not starting with 0. */
export const PINCODE_PATTERN = /^[1-9]\d{5}$/;

/** Indian mobile number: ten digits starting with 6-9. */
export const MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** Steps shown in the cart / address page headers. */
export const CHECKOUT_STEPS: readonly StepperStep[] = [
  { label: 'Cart' },
  { label: 'Address' },
  { label: 'Payment' },
];
