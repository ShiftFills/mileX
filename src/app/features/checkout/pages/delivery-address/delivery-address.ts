import { CurrencyPipe, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CHECKOUT_STEPS, FREE_SHIPPING_THRESHOLD, MOBILE_PATTERN, PINCODE_PATTERN } from '@core/constants/checkout';
import { INDIAN_STATES } from '@core/constants/indian-states';
import { AddressInput, AddressService } from '@core/services/address.service';
import { CartService } from '@core/services/cart.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { ToastService } from '@core/services/toast.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Radio } from '@shared/components/radio/radio';
import { Select } from '@shared/components/select/select';
import { Stepper } from '@shared/components/stepper/stepper';
import { AddressType, DeliveryAddress, Product } from '@shared/models';
import { eventValue } from '@shared/utils/form-events';
import { finalize } from 'rxjs';

type FieldKey = 'fullName' | 'mobile' | 'pincode' | 'house' | 'street' | 'landmark' | 'city' | 'state' | 'country';
type AddressForm = Record<FieldKey, string> & { type: AddressType; isDefault: boolean };

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
  // house -> ADDRESS_LINE_1, street -> ADDRESS_LINE_2
  { key: 'house', label: 'House / Flat / Building', placeholder: 'Enter house / flat / building', autocomplete: 'address-line1', noun: 'house / flat / building' },
  { key: 'street', label: 'Street / Area', placeholder: 'Enter street / area', autocomplete: 'address-line2', noun: 'street / area' },
  { key: 'landmark', label: 'Landmark', placeholder: 'Enter landmark', autocomplete: 'off', noun: 'landmark', optional: true },
  {
    key: 'city', label: 'City', placeholder: 'Enter city', autocomplete: 'address-level2', noun: 'city',
    check: (v) => (/^[\p{L}][\p{L} .'-]*$/u.test(v) ? null : 'Enter a valid city'),
  },
  { key: 'state', label: 'State', placeholder: 'Select state', autocomplete: 'address-level1', noun: 'state', select: true },
  {
    key: 'country', label: 'Country', placeholder: 'Enter country', autocomplete: 'country-name', noun: 'country',
    check: (v) => (/^[\p{L}][\p{L} .'-]*$/u.test(v) ? null : 'Enter a valid country'),
  },
];

const ADDRESS_TYPES: readonly { value: AddressType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

const TYPE_TONE: Record<AddressType, BadgeTone> = { home: 'info', work: 'neutral', other: 'neutral' };
const MAX_DIGITS: Partial<Record<FieldKey, number>> = { mobile: 10, pincode: 6 };
const DEFAULT_COUNTRY = 'India';

/** A blank form. Country (India) and Address Type (Home) are prefilled and are not user changes. */
const EMPTY_FORM: AddressForm = {
  fullName: '', mobile: '', pincode: '', house: '', street: '', landmark: '', city: '', state: '',
  country: DEFAULT_COUNTRY, type: 'home', isDefault: false,
};

/** Checkout step 2: pick a saved delivery address or add a new one (customer_address API). */
@Component({
  selector: 'app-delivery-address',
  imports: [Alert, Badge, Button, Card, Checkbox, CurrencyPipe, Input, LoadingSpinner, PageHeading, Radio, RouterLink, Select, Stepper],
  templateUrl: './delivery-address.html',
  styleUrl: './delivery-address.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // CHANGED (new): each Order Summary row shows its product's own image (signed S3 URL).
  providers: [ProductImageDisplayService],
})
export class DeliveryAddressPage {
  protected readonly cart = inject(CartService);
  protected readonly catalog = inject(ProductCatalogService);
  // CHANGED (new)
  protected readonly productImages = inject(ProductImageDisplayService);
  protected readonly addressBook = inject(AddressService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
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
  /** The values the form started with (blank, or the address being edited): used to detect unsaved changes. */
  private readonly baseline = signal<AddressForm>({ ...EMPTY_FORM });
  protected readonly editingId = signal<string | null>(null);
  /** ADDRESS_TYPE exactly as the backend returned it for the address being edited (for example 'pg'). */
  private readonly originalApiType = signal('');
  /** True once the user picks a type in the radio group; until then an edited address keeps its original type. */
  private readonly typeChosen = signal(false);
  private readonly touched = signal<ReadonlySet<FieldKey>>(new Set());
  private readonly submitted = signal(false);
  protected readonly selectionError = signal(false);
  /** Shown when Confirm to Payment is pressed while the form holds unsaved changes. */
  protected readonly unsavedError = signal(false);
  /** True while an insert or update request is in flight: shows the button loader and blocks repeat clicks. */
  protected readonly saving = signal(false);
  /** ADDRESS_ID of the card whose "Set as default" request is in flight. */
  protected readonly defaultingId = signal<string | null>(null);

  // ---- Order summary ----
  // CHANGED: delisted products are left out, like cart.subtotal (checkout stays blocked until they are removed).
  protected readonly listTotal = computed(() =>
    this.cart.purchasableItems().reduce((sum, { product, quantity }) => sum + (product.originalPrice ?? product.price) * quantity, 0),
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

  /** True only when the user has changed something compared with where the form started. */
  protected readonly isDirty = computed(() => {
    const form = this.form();
    const base = this.baseline();
    return (
      FIELDS.some((field) => form[field.key].trim() !== base[field.key].trim()) ||
      form.type !== base.type ||
      form.isDefault !== base.isDefault
    );
  });

  constructor() {
    // CHANGED: loads the catalog for the cart rows (CartService no longer loads it on every page).
    this.catalog.load();
    // Fetch the logged-in customer's saved addresses; the service selects the default (or the first).
    this.addressBook.load();
    // CHANGED (new): loads the S3 image URLs of the cart rows (cached URLs make no request).
    effect(() => {
      const products = this.cart.items().map((item) => item.product);
      untracked(() => this.productImages.show(products));
    });
  }

  /** The error to show under a field: only after it was edited or a save was attempted. */
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

  protected isDefaulting(id: string): boolean {
    return this.defaultingId() === id;
  }

  // ---- Saved addresses ----
  protected selectAddress(id: string): void {
    this.addressBook.select(id);
    this.selectionError.set(false);
    this.unsavedError.set(false);
  }

  protected editAddress(address: DeliveryAddress): void {
    if (this.saving()) return;
    this.addressBook.select(address.id);
    const values: AddressForm = {
      fullName: address.fullName,
      mobile: address.mobile,
      pincode: address.pincode,
      house: address.house,
      street: address.street,
      landmark: address.landmark ?? '',
      city: address.city,
      state: address.state,
      country: address.country || DEFAULT_COUNTRY,
      type: address.type,
      isDefault: address.isDefault,
      
    };
    this.form.set(values);
    this.baseline.set({ ...values });
    this.editingId.set(address.id);
    this.originalApiType.set(address.apiType);
    this.typeChosen.set(false);
    this.touched.set(new Set());
    this.submitted.set(false);
    this.unsavedError.set(false);
    this.focusForm();
  }

  protected addNewAddress(): void {
    if (this.saving()) return;
    this.resetForm();
    this.focusForm();
  }

  protected cancelEdit(): void {
    if (this.saving()) return;
    this.resetForm();
  }

  /** Makes a saved address the default. Ignored while another save or default change is running. */
  protected setAsDefault(address: DeliveryAddress): void {
    if (address.isDefault || this.saving() || this.defaultingId() !== null) return;
    this.defaultingId.set(address.id);
    this.addressBook
      .setDefault(address)
      .pipe(
        finalize(() => this.defaultingId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          // Keep an open edit form for this address in step with the new default.
          if (this.editingId() === address.id) {
            this.form.update((form) => ({ ...form, isDefault: true }));
            this.baseline.update((base) => ({ ...base, isDefault: true }));
          }
          this.toast.showSuccess('Default address updated.');
        },
        error: (error: unknown) =>
          this.toast.showError(this.addressBook.errorMessage(error, 'The default address could not be updated.')),
      });
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
    this.unsavedError.set(false);
  }

  protected markTouched(key: FieldKey): void {
    this.touched.update((touched) => new Set(touched).add(key));
  }

  protected setType(type: AddressType): void {
    this.form.update((form) => ({ ...form, type }));
    this.typeChosen.set(true);
    this.unsavedError.set(false);
  }

  protected setDefaultChecked(checked: boolean): void {
    this.form.update((form) => ({ ...form, isDefault: checked }));
    this.unsavedError.set(false);
  }

  // ---- Save (insert or update through the API) ----
  protected saveAddress(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    const firstInvalid = FIELDS.find((field) => this.errors()[field.key]);
    if (firstInvalid) {
      this.document.getElementById(`address-${firstInvalid.key}`)?.focus();
      return;
    }

    const input = this.toInput();
    const editingId = this.editingId();
    this.saving.set(true);
    (editingId ? this.addressBook.update(editingId, input) : this.addressBook.add(input))
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess(editingId ? 'Address updated successfully.' : 'Address saved successfully.');
          this.selectionError.set(false);
          this.resetForm();
        },
        error: (error: unknown) =>
          this.toast.showError(this.addressBook.errorMessage(error, 'The address could not be saved. Please try again.')),
      });
  }

  // ---- Confirm ----
  protected confirmToPayment(): void {
    if (this.cart.hasUnavailableItems()) return;
    if (this.saving() || this.defaultingId() !== null) return;
    if (this.isDirty()) {
      // Something was typed or changed and not saved: do not continue.
      this.unsavedError.set(true);
      return;
    }
    if (!this.addressBook.selected()) {
      this.selectionError.set(true);
      return;
    }
    void this.router.navigate([this.routes.payment]);
  }

  protected retryLoad(): void {
    this.catalog.load();
  }

  protected retryAddresses(): void {
    this.addressBook.load();
  }

  /**
   * Builds the service input. ADDRESS_TYPE is HOME / WORK / OTHER from the radio group, except that
   * an edited address whose type the user never touched keeps its original backend value (for
   * example 'pg') instead of being converted to OTHER.
   */
  private toInput(): AddressInput {
    const form = this.form();
    const original = this.originalApiType().trim();
    const addressType = this.editingId() && original && !this.typeChosen() ? original : form.type.toUpperCase();
    return {
      addressType,
      fullName: form.fullName.trim(),
      mobile: form.mobile.trim(),
      pincode: form.pincode.trim(),
      house: form.house.trim(),
      street: form.street.trim(),
      landmark: form.landmark.trim() || undefined,
      city: form.city.trim(),
      state: form.state,
      country: form.country.trim(),
      isDefault: form.isDefault,
    };
  }

  private resetForm(): void {
    this.form.set({ ...EMPTY_FORM });
    this.baseline.set({ ...EMPTY_FORM });
    this.editingId.set(null);
    this.originalApiType.set('');
    this.typeChosen.set(false);
    this.touched.set(new Set());
    this.submitted.set(false);
    this.unsavedError.set(false);
  }

  private focusForm(): void {
    const target = this.document.getElementById('address-fullName');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  }
}