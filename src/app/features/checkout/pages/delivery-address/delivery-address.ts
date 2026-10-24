import { CurrencyPipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CHECKOUT_STEPS, FREE_SHIPPING_THRESHOLD, MOBILE_PATTERN, PINCODE_PATTERN } from '@core/constants/checkout';
import { INDIAN_STATES } from '@core/constants/indian-states';
import { AddressService } from '@core/services/address.service';
import { CartService } from '@core/services/cart.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { Input } from '@shared/components/input/input';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Radio } from '@shared/components/radio/radio';
import { Select } from '@shared/components/select/select';
import { Stepper } from '@shared/components/stepper/stepper';
import { AddressType, DeliveryAddress, Product } from '@shared/models';
import { eventValue } from '@shared/utils/form-events';

type FieldKey = 'fullName' | 'mobile' | 'pincode' | 'house' | 'street' | 'landmark' | 'city' | 'state';
type AddressForm = Record<FieldKey, string> & { type: AddressType };

interface FieldConfig {
  key: FieldKey;
  label: string;
  placeholder: string;
  autocomplete: string;
  /** Lower-case noun used in error messages ("Please enter your full name"). */
  noun: string;
  optional?: boolean;
  select?: boolean;
  /** Extra rule applied to a non-empty value; returns an error message or null. */
  check?: (value: string) => string | null;
}

/** Fields in reading order of the two-column grid (left, right, left, right...). */
const FIELDS: readonly FieldConfig[] = [
  {
    key: 'fullName', label: 'Full Name', placeholder: 'Enter full name', autocomplete: 'name', noun: 'full name',
    check: (v) => (/^[\p{L}][\p{L} .'-]{1,59}$/u.test(v) ? null : 'Enter a valid name'),
  },
  {
    key: 'mobile', label: 'Mobile Number', placeholder: 'Enter mobile number', autocomplete: 'tel-national', noun: 'mobile number',
    check: (v) => (MOBILE_PATTERN.test(v) ? null : 'Enter a valid 10-digit mobile number'),
  },
  {
    key: 'pincode', label: 'Pincode', placeholder: 'Enter pincode', autocomplete: 'postal-code', noun: 'pincode',
    check: (v) => (PINCODE_PATTERN.test(v) ? null : 'Enter a valid 6-digit pincode'),
  },
  { key: 'house', label: 'House / Flat / Building', placeholder: 'Enter house / flat / building', autocomplete: 'address-line1', noun: 'house / flat / building' },
  { key: 'street', label: 'Street / Area', placeholder: 'Enter street / area', autocomplete: 'address-line2', noun: 'street / area' },
  { key: 'landmark', label: 'Landmark', placeholder: 'Enter landmark', autocomplete: 'off', noun: 'landmark', optional: true },
  {
    key: 'city', label: 'City', placeholder: 'Enter city', autocomplete: 'address-level2', noun: 'city',
    check: (v) => (/^[\p{L}][\p{L} .'-]*$/u.test(v) ? null : 'Enter a valid city'),
  },
  { key: 'state', label: 'State', placeholder: 'Select state', autocomplete: 'address-level1', noun: 'state', select: true },
];

const ADDRESS_TYPES: readonly { value: AddressType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

const TYPE_TONE: Record<AddressType, BadgeTone> = { home: 'info', work: 'neutral', other: 'neutral' };
const MAX_DIGITS: Partial<Record<FieldKey, number>> = { mobile: 10, pincode: 6 };
const EMPTY_FORM: AddressForm = {
  fullName: '', mobile: '', pincode: '', house: '', street: '', landmark: '', city: '', state: '', type: 'home',
};

/** Checkout step 2: pick a saved delivery address or add a new one. */
@Component({
  selector: 'app-delivery-address',
  imports: [Alert, Badge, Button, Card, Checkbox, CurrencyPipe, Input, PageHeading, Radio, RouterLink, Select, Stepper],
  templateUrl: './delivery-address.html',
  styleUrl: './delivery-address.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryAddressPage {
  protected readonly cart = inject(CartService);
  protected readonly addressBook = inject(AddressService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly routes = APP_ROUTES;
  protected readonly steps = CHECKOUT_STEPS;
  protected readonly fields = FIELDS;
  protected readonly addressTypes = ADDRESS_TYPES;
  protected readonly states = INDIAN_STATES;
  protected readonly freeShippingThreshold = FREE_SHIPPING_THRESHOLD;
  protected readonly typeTone = TYPE_TONE;

  protected readonly form = signal<AddressForm>({ ...EMPTY_FORM });
  protected readonly saveForLater = signal(true);
  protected readonly editingId = signal<string | null>(null);
  private readonly touched = signal<ReadonlySet<FieldKey>>(new Set());
  private readonly submitted = signal(false);
  protected readonly selectionError = signal(false);

  // ---- Order summary ----
  protected readonly listTotal = computed(() =>
    this.cart.items().reduce((sum, { product, quantity }) => sum + (product.originalPrice ?? product.price) * quantity, 0),
  );
  protected readonly productDiscount = computed(() => this.listTotal() - this.cart.subtotal());
  protected readonly orderTotal = this.cart.subtotal;
  protected readonly qualifiesForFreeShipping = computed(() => this.orderTotal() > FREE_SHIPPING_THRESHOLD);

  // ---- Form state ----
  private readonly errors = computed(() => {
    const form = this.form();
    const errors: Partial<Record<FieldKey, string>> = {};
    for (const field of FIELDS) {
      const value = form[field.key].trim();
      if (!value) {
        if (!field.optional) errors[field.key] = field.select ? `Please select your ${field.noun}` : `Please enter your ${field.noun}`;
      } else if (field.check) {
        const message = field.check(value);
        if (message) errors[field.key] = message;
      }
    }
    return errors;
  });
  /** True once the user has typed anything or is editing a saved address. */
  protected readonly formStarted = computed(
    () => this.editingId() !== null || FIELDS.some((field) => this.form()[field.key].trim() !== ''),
  );

  constructor() {
    // Demo cart matching the design: a single item for first-time visitors.
    this.cart.seedDemoItems(['women-printed-maxi-dress-1']);
  }

  /** The error to show under a field: only after it was edited or a submit was attempted. */
  protected errorFor(key: FieldKey): string | null {
    return this.submitted() || this.touched().has(key) ? (this.errors()[key] ?? null) : null;
  }

  protected variantOf(product: Product): string {
    return [product.colors?.[0]?.name, product.sizes?.[0] && `Size ${product.sizes[0]}`].filter(Boolean).join(' • ');
  }

  protected formatMobile(mobile: string): string {
    return `+91 ${mobile}`;
  }

  protected typeLabel(type: AddressType): string {
    return ADDRESS_TYPES.find((item) => item.value === type)?.label ?? type;
  }

  // ---- Saved addresses ----
  protected selectAddress(id: string): void {
    this.addressBook.select(id);
    this.selectionError.set(false);
  }

  protected editAddress(address: DeliveryAddress): void {
    this.addressBook.select(address.id);
    this.editingId.set(address.id);
    this.form.set({ ...EMPTY_FORM, ...address, landmark: address.landmark ?? '' });
    this.touched.set(new Set());
    this.submitted.set(false);
    this.focusForm();
  }

  protected addNewAddress(): void {
    this.resetForm();
    this.focusForm();
  }

  protected cancelEdit(): void {
    this.resetForm();
  }

  // ---- Form handlers ----
  protected updateField(key: FieldKey, event: Event): void {
    let value = eventValue(event) ?? '';
    const maxDigits = MAX_DIGITS[key];
    if (maxDigits) {
      value = value.replace(/\D/g, '').slice(0, maxDigits);
      if (event.target instanceof HTMLInputElement) event.target.value = value;
    }
    this.form.update((form) => ({ ...form, [key]: value }));
    this.selectionError.set(false);
  }

  protected markTouched(key: FieldKey): void {
    this.touched.update((touched) => new Set(touched).add(key));
  }

  protected setType(type: AddressType): void {
    this.form.update((form) => ({ ...form, type }));
  }

  protected setSaveForLater(checked: boolean): void {
    this.saveForLater.set(checked);
  }

  // ---- Confirm ----
  protected confirmToPayment(): void {
    if (this.formStarted()) {
      this.submitted.set(true);
      const firstInvalid = FIELDS.find((field) => this.errors()[field.key]);
      if (firstInvalid) {
        this.document.getElementById(`address-${firstInvalid.key}`)?.focus();
        return;
      }
      this.storeFormAddress();
    } else if (!this.addressBook.selected()) {
      this.selectionError.set(true);
      return;
    }
    void this.router.navigate([this.routes.payment]);
  }

  private storeFormAddress(): void {
    const form = this.form();
    const address = {
      type: form.type,
      fullName: form.fullName.trim(),
      mobile: form.mobile.trim(),
      pincode: form.pincode.trim(),
      house: form.house.trim(),
      street: form.street.trim(),
      landmark: form.landmark.trim() || undefined,
      city: form.city.trim(),
      state: form.state,
    };
    const editingId = this.editingId();
    if (editingId) this.addressBook.save({ ...address, id: editingId });
    else if (this.saveForLater()) this.addressBook.save(address);
    else this.addressBook.useOnce(address);
  }

  private resetForm(): void {
    this.form.set({ ...EMPTY_FORM });
    this.editingId.set(null);
    this.touched.set(new Set());
    this.submitted.set(false);
  }

  private focusForm(): void {
    const target = this.document.getElementById('address-fullName');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  }
}
