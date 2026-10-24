import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Checkout } from './checkout';

interface CustomerDetails {
  name: string;
  email: string;
  phone: string;
}

interface AddressDetails {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface CheckoutHarness {
  customer(): CustomerDetails;
  deliveryAddress(): AddressDetails;
  billingAddress(): AddressDetails;
  billingSameAsDelivery(): boolean;
  editingCard(): 'customer' | 'delivery' | 'billing' | null;
  customerDraft: WritableSignal<CustomerDetails | null>;
  deliveryDraft: WritableSignal<AddressDetails | null>;
  billingDraft: WritableSignal<AddressDetails | null>;
  billingSameDraft: WritableSignal<boolean>;
  paymentMethod(): 'upi' | 'card' | 'bank' | 'cod';
  editError(): string;
  beginEdit(card: 'customer' | 'delivery' | 'billing'): void;
  saveEdit(card: 'customer' | 'delivery' | 'billing'): void;
  cancelEdit(): void;
  selectPaymentMethod(event: Event): void;
}

describe('Checkout card editing', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: CheckoutHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance as unknown as CheckoutHarness;
  });

  it('prefills customer details, saves edits, and leaves cancelled changes unapplied', () => {
    const original = component.customer();
    component.beginEdit('customer');
    expect(component.customerDraft()).toEqual(original);

    component.customerDraft.set({ ...original, name: 'Updated Customer' });
    component.saveEdit('customer');
    expect(component.customer().name).toBe('Updated Customer');
    expect(component.editingCard()).toBeNull();

    component.beginEdit('customer');
    component.customerDraft.set({ ...component.customer(), name: 'Unsaved Customer' });
    component.cancelEdit();
    expect(component.customer().name).toBe('Updated Customer');
  });

  it('updates the selected address and keeps linked billing details in sync', () => {
    const updatedDelivery = { ...component.deliveryAddress(), city: 'Bengaluru' };
    component.beginEdit('delivery');
    expect(component.deliveryDraft()).toEqual(component.deliveryAddress());
    component.deliveryDraft.set(updatedDelivery);
    component.saveEdit('delivery');

    expect(component.deliveryAddress().city).toBe('Bengaluru');
    expect(component.billingSameAsDelivery()).toBe(true);
    expect(component.billingAddress().city).toBe('Bengaluru');
  });

  it('allows an independent billing address and does not commit cancelled drafts', () => {
    const originalBilling = component.billingAddress();
    component.beginEdit('billing');
    component.billingSameDraft.set(false);
    component.billingDraft.set({ ...originalBilling, city: 'Pune' });
    component.saveEdit('billing');
    expect(component.billingSameAsDelivery()).toBe(false);
    expect(component.billingAddress().city).toBe('Pune');

    component.beginEdit('billing');
    component.billingDraft.set({ ...component.billingAddress(), city: 'Unsaved City' });
    component.cancelEdit();
    expect(component.billingAddress().city).toBe('Pune');
  });

  it('keeps invalid edits open and shows a validation message', () => {
    component.beginEdit('delivery');
    component.deliveryDraft.set({ ...component.deliveryAddress(), postalCode: '' });
    component.saveEdit('delivery');

    expect(component.editingCard()).toBe('delivery');
    expect(component.editError()).toBeTruthy();
    expect(component.deliveryAddress().postalCode).toBe('600035');
  });

  it('selects only the supported payment options', () => {
    expect(component.paymentMethod()).toBe('upi');

    const cardInput = document.createElement('input');
    cardInput.value = 'card';
    const cardChange = new Event('change');
    Object.defineProperty(cardChange, 'target', { value: cardInput });
    component.selectPaymentMethod(cardChange);
    expect(component.paymentMethod()).toBe('card');

    const unsupportedInput = document.createElement('input');
    unsupportedInput.value = 'wallet';
    const unsupportedChange = new Event('change');
    Object.defineProperty(unsupportedChange, 'target', { value: unsupportedInput });
    component.selectPaymentMethod(unsupportedChange);
    expect(component.paymentMethod()).toBe('card');
  });
});
