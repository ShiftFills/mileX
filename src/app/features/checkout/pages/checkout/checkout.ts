import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CartService } from '@core/services/cart.service';
import { CartItem } from '@shared/models';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { Input } from '@shared/components/input/input';
import { Radio } from '@shared/components/radio/radio';
import { Table, TableCellContext, TableColumn } from '@shared/components/table/table';

type CustomerDetails = {
  name: string;
  email: string;
  phone: string;
};

type AddressDetails = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

type EditableCard = 'customer' | 'delivery' | 'billing';
type PaymentMethod = 'upi' | 'card' | 'bank' | 'cod';

@Component({
  selector: 'app-checkout',
  imports: [Button, Card, Checkbox, CurrencyPipe, Input, Radio, RouterLink, Table],
  templateUrl: './checkout.html',
  styleUrl: './checkout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Checkout {
  protected readonly cart = inject(CartService);
  private readonly router = inject(Router);
  protected readonly routes = APP_ROUTES;
  protected readonly placed = signal(false);
  protected readonly customer = signal<CustomerDetails>({
    name: 'Sujan Saha',
    email: 'sujan@gmail.com',
    phone: '+91 98765 43210',
  });
  protected readonly deliveryAddress = signal<AddressDetails>({
    street: '123, Green Park, Anna Salai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postalCode: '600035',
    country: 'India',
  });
  protected readonly billingAddress = signal<AddressDetails>({
    street: '123, Green Park, Anna Salai',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postalCode: '600035',
    country: 'India',
  });
  protected readonly billingSameAsDelivery = signal(true);
  protected readonly editingCard = signal<EditableCard | null>(null);
  protected readonly customerDraft = signal<CustomerDetails | null>(null);
  protected readonly deliveryDraft = signal<AddressDetails | null>(null);
  protected readonly billingDraft = signal<AddressDetails | null>(null);
  protected readonly billingSameDraft = signal(true);
  protected readonly editError = signal('');
  protected readonly paymentMethod = signal<PaymentMethod>('upi');
  private readonly productCell = viewChild<TemplateRef<TableCellContext<CartItem>>>('productCell');
  private readonly variantCell = viewChild<TemplateRef<TableCellContext<CartItem>>>('variantCell');
  private readonly unitPriceCell = viewChild<TemplateRef<TableCellContext<CartItem>>>('unitPriceCell');
  private readonly discountCell = viewChild<TemplateRef<TableCellContext<CartItem>>>('discountCell');
  private readonly taxCell = viewChild<TemplateRef<TableCellContext<CartItem>>>('taxCell');
  private readonly totalCell = viewChild<TemplateRef<TableCellContext<CartItem>>>('totalCell');
  protected readonly productColumns = computed<readonly TableColumn<CartItem>[]>(() => [
    { key: 'product', label: 'Product', width: '18%', cellTemplate: this.productCell() },
    { key: 'variant', label: 'Variant', width: '14%', cellTemplate: this.variantCell() },
    { key: 'quantity', label: 'Quantity', width: '10%' },
    { key: 'unitPrice', label: 'Unit Price', width: '14%', cellTemplate: this.unitPriceCell() },
    { key: 'discount', label: 'Discount', width: '14%', cellTemplate: this.discountCell() },
    { key: 'tax', label: 'Tax', width: '10%', cellTemplate: this.taxCell() },
    { key: 'total', label: 'Total Amount', width: '20%', bold: true, cellTemplate: this.totalCell() },
  ]);

  protected discountFor(item: CartItem): number {
    return Math.max(0, (item.product.originalPrice ?? item.product.price) - item.product.price) * item.quantity;
  }

  protected variantFor(item: CartItem): string {
    return item.product.variantDetails?.split('·')[0]?.trim() || '—';
  }

  protected discountTotal(): number {
    return this.cart.items().reduce((total, item) => total + this.discountFor(item), 0);
  }

  protected beginEdit(card: EditableCard): void {
    this.editingCard.set(card);
    this.editError.set('');
    if (card === 'customer') this.customerDraft.set({ ...this.customer() });
    if (card === 'delivery') this.deliveryDraft.set({ ...this.deliveryAddress() });
    if (card === 'billing') {
      this.billingDraft.set({ ...this.billingAddress() });
      this.billingSameDraft.set(this.billingSameAsDelivery());
    }
  }

  protected updateCustomerField(field: keyof CustomerDetails, event: Event): void {
    const value = this.inputValue(event);
    if (value !== null) this.customerDraft.update((draft) => draft ? { ...draft, [field]: value } : draft);
  }

  protected updateDeliveryField(field: keyof AddressDetails, event: Event): void {
    const value = this.inputValue(event);
    if (value !== null) this.deliveryDraft.update((draft) => draft ? { ...draft, [field]: value } : draft);
  }

  protected updateBillingField(field: keyof AddressDetails, event: Event): void {
    const value = this.inputValue(event);
    if (value !== null) this.billingDraft.update((draft) => draft ? { ...draft, [field]: value } : draft);
  }

  protected setBillingSameAsDelivery(checked: boolean): void {
    this.billingSameDraft.set(checked);
  }

  protected saveEdit(card: EditableCard): void {
    if (this.editingCard() !== card) return;
    if (card === 'customer') {
      const draft = this.customerDraft();
      if (!draft || !draft.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) || !draft.phone.trim()) {
        this.editError.set('Enter a name, valid email address, and phone number.');
        return;
      }
      this.customer.set({ ...draft, name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() });
    }
    if (card === 'delivery') {
      const draft = this.deliveryDraft();
      if (!this.isAddressValid(draft)) {
        this.editError.set('Complete the street, city, state, postal code, and country fields.');
        return;
      }
      this.deliveryAddress.set({ ...draft, street: draft.street.trim(), city: draft.city.trim(), state: draft.state.trim(), postalCode: draft.postalCode.trim(), country: draft.country.trim() });
      if (this.billingSameAsDelivery()) this.billingAddress.set({ ...this.deliveryAddress() });
    }
    if (card === 'billing') {
      const draft = this.billingDraft();
      if (!this.billingSameDraft() && !this.isAddressValid(draft)) {
        this.editError.set('Complete the street, city, state, postal code, and country fields.');
        return;
      }
      if (draft) this.billingAddress.set({ ...draft, street: draft.street.trim(), city: draft.city.trim(), state: draft.state.trim(), postalCode: draft.postalCode.trim(), country: draft.country.trim() });
      this.billingSameAsDelivery.set(this.billingSameDraft());
      if (this.billingSameDraft()) this.billingAddress.set({ ...this.deliveryAddress() });
    }
    this.cancelEdit();
  }

  protected cancelEdit(): void {
    this.editingCard.set(null);
    this.customerDraft.set(null);
    this.deliveryDraft.set(null);
    this.billingDraft.set(null);
    this.editError.set('');
  }

  protected editProducts(): void {
    void this.router.navigateByUrl(this.routes.cart);
  }

  protected selectPaymentMethod(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement && ['upi', 'card', 'bank', 'cod'].includes(target.value)) {
      this.paymentMethod.set(target.value as PaymentMethod);
    }
  }

  protected displayedBillingAddress(): AddressDetails {
    return this.billingSameAsDelivery() ? this.deliveryAddress() : this.billingAddress();
  }

  private inputValue(event: Event): string | null {
    const target = event.target;
    return target instanceof HTMLInputElement ? target.value : null;
  }

  private isAddressValid(address: AddressDetails | null): address is AddressDetails {
    return !!address && Object.values(address).every((value) => value.trim().length > 0);
  }

  protected placeDemoOrder(event: SubmitEvent): void {
    event.preventDefault();
    if (this.editingCard()) return;
    this.placed.set(true);
    this.cart.clear();
  }
}
