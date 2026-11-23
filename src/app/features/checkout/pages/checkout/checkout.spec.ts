import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CartService } from '@core/services/cart.service';
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
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Checkout);
    http.expectOne((request) => request.url.endsWith('/products/get')).flush({
      status: 'SUCCESS',
      data: [],
    });
    component = fixture.componentInstance as unknown as CheckoutHarness;
  });

  afterEach(() => http.verify());

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

  // CHANGED (new)
  it('shows the signed S3 URL of each cart row in the products table and list', async () => {
    const key = 'products/866dea6fc30de9342300a6e901f8df6f.png';
    const signed = `https://milex.s3.amazonaws.com/${key}?X-Amz-Signature=abc`;
    TestBed.inject(CartService).mergeFetchedItems([{
      product: {
        id: '16', name: 'Lenovo IdeaPad Slim 5', description: '', price: 100, currency: 'INR',
        imageUrl: '/images/latest-gadgets.svg', imageKey: key, category: 'uncategorized', inStock: true,
      },
      quantity: 1,
      apiDetails: {
        cartId: '70', sellerId: 8, customerId: 1, originalQuantity: 1, unitPrice: 100,
        cartDiscount: 0, productDiscount: 0, tax: 0, totalAmount: 100, saveForLater: false,
      },
    }]);
    // CHANGED: the cart looks up whether the product is still listed.
    http.expectOne('/api/products/get?PRODUCT_ID=16').flush({
      status: true,
      data: [{ PRODUCT_ID: 16, PRODUCT_NAME: 'Lenovo IdeaPad Slim 5', SELLING_PRICE: '100.00', IS_ACTIVE: 'ACTIVE' }],
    });
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    const request = http.expectOne(`/api/s3/images/${key}`);
    expect(root.querySelector('.checkout-product [role="img"]')?.getAttribute('aria-label'))
      .toBe('Loading image of Lenovo IdeaPad Slim 5');
    request.flush({ success: true, imageKey: key, imageUrl: signed, expiresIn: 3600 });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root.querySelector('.checkout-product img')?.getAttribute('src')).toBe(signed);
    expect(root.querySelector('.checkout-product-summary > img')?.getAttribute('src')).toBe(signed);
    expect(root.querySelector('img[src="/images/latest-gadgets.svg"]')).toBeNull();
  });
});
