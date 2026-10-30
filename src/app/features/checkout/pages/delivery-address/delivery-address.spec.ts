import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { AddressService } from '@core/services/address.service';
import { DeliveryAddressPage } from './delivery-address';

function clearStorage(): void {
  for (const key of [STORAGE_KEYS.cart, STORAGE_KEYS.addresses, STORAGE_KEYS.selectedAddress]) {
    localStorage.removeItem(key);
  }
}

const PRODUCTS_RESPONSE = {
  status: 'SUCCESS',
  data: [
    { PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse Updated', PRICE: '999.00', SELLING_PRICE: '749.00', STOCK_QUANTITY: 90, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
  ],
};

describe('DeliveryAddressPage', () => {
  let fixture: ComponentFixture<DeliveryAddressPage>;
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;
  let http: HttpTestingController;

  const text = (): string => root.textContent?.replace(/\s+/g, ' ') ?? '';
  const click = async (el: Element | null | undefined): Promise<void> => {
    (el as HTMLElement).click();
    await fixture.whenStable();
  };
  const type = async (selector: string, value: string): Promise<void> => {
    const input = root.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const confirm = (): Promise<void> => click(root.querySelector('.order-summary__confirm button'));

  beforeEach(async () => {
    clearStorage();
    localStorage.setItem(
      STORAGE_KEYS.cart,
      JSON.stringify([{ product: { id: '4' }, quantity: 1 }]),
    );
    await TestBed.configureTestingModule({
      imports: [DeliveryAddressPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(DeliveryAddressPage);
    http.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);
    root = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    clearStorage();
  });

  it('shows the saved addresses with the first one selected, and the order summary', () => {
    const cards = root.querySelectorAll('.address-card');
    expect(cards.length).toBe(2);
    expect(cards[0].classList).toContain('is-selected');
    expect(text()).toContain('Sujan Saha');
    expect(text()).toContain('Order total');
    expect(text()).toContain('₹749');
  });

  it('continues to payment with the selected saved address', async () => {
    await click(root.querySelectorAll('.address-card')[1]);
    await confirm();
    expect(TestBed.inject(AddressService).selected()?.id).toBe('address-work');
    expect(navigate).toHaveBeenCalledWith(['/checkout/payment']);
  });

  it('validates a partially filled form and does not continue', async () => {
    await type('#address-fullName', 'Asha K');
    await type('#address-mobile', '12ab345');
    expect(root.querySelector<HTMLInputElement>('#address-mobile')!.value).toBe('12345');
    await confirm();
    expect(navigate).not.toHaveBeenCalled();
    expect(text()).toContain('Enter a valid 10-digit mobile number');
    expect(text()).toContain('Please select your state');
  });

  it('saves a valid new address and continues', async () => {
    await type('#address-fullName', 'Asha K');
    await type('#address-mobile', '9876501234');
    await type('#address-pincode', '600001');
    await type('#address-house', '12B');
    await type('#address-street', 'Anna Salai');
    await type('#address-city', 'Chennai');
    const state = root.querySelector<HTMLSelectElement>('#address-state')!;
    state.value = 'Tamil Nadu';
    state.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    await confirm();
    const saved = TestBed.inject(AddressService);
    expect(saved.addresses().length).toBe(3);
    expect(saved.selected()?.fullName).toBe('Asha K');
    expect(navigate).toHaveBeenCalledWith(['/checkout/payment']);
  });
});
