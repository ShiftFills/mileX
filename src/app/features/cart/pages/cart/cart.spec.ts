import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { CartService } from '@core/services/cart.service';
import { Cart } from './cart';

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEYS.cart);
  localStorage.removeItem(STORAGE_KEYS.wishlist);
}

const PRODUCTS_RESPONSE = {
  status: 'SUCCESS',
  data: [
    { PRODUCT_ID: 3, PRODUCT_NAME: 'Samsung Galaxy S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 5, CATEGORY_ID: 1, IS_ACTIVE: 1 },
    { PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse Updated', PRICE: '999.00', SELLING_PRICE: '749.00', STOCK_QUANTITY: 90, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
    { PRODUCT_ID: 5, PRODUCT_NAME: 'Wireless Mouse', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
  ],
};

describe('Cart', () => {
  let fixture: ComponentFixture<Cart>;
  let root: HTMLElement;
  let cart: CartService;
  let http: HttpTestingController;

  const text = (): string => root.textContent?.replace(/\s+/g, ' ') ?? '';
  /** Whitespace-free text, for label/value pairs that sit in separate elements (<dt>/<dd>). */
  const compact = (): string => root.textContent?.replace(/\s+/g, '') ?? '';
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

  beforeEach(async () => {
    clearStorage();
    localStorage.setItem(
      STORAGE_KEYS.cart,
      JSON.stringify([{ product: { id: '4' }, quantity: 1 }]),
    );
    await TestBed.configureTestingModule({
      imports: [Cart],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    cart = TestBed.inject(CartService);
    fixture = TestBed.createComponent(Cart);
    http.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);
    await fixture.whenStable();
    fixture.detectChanges();
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    http.verify();
    clearStorage();
  });

  it('shows the saved API item with its price, discount and order summary', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Shopping Cart');
    expect(root.querySelector('.cart-item h2')?.textContent).toContain('Wireless Mouse Updated');
    expect(text()).toContain('₹749');
    expect(text()).toContain('25% OFF');
    expect(compact()).toContain('Price(1item)₹999');
    expect(compact()).toContain('Productdiscount−₹250');
    expect(text()).toContain('You\'re saving ₹250 on this order');
    expect(text()).toContain('Your ₹749 subtotal does not qualify yet.');
  });

  it('updates totals when the quantity changes and never goes below 1', async () => {
    const [decrease, increase] = Array.from(root.querySelectorAll('.quantity-control button'));
    expect((decrease as HTMLButtonElement).disabled).toBe(true);

    await click(increase);
    expect(cart.count()).toBe(2);
    expect(compact()).toContain('Price(2items)₹1,998');
    expect(text()).toContain('Your order qualifies for free shipping.');
  });

  it('stops the quantity at the API order limit', async () => {
    cart.setQuantity('4', 10);
    await fixture.whenStable();
    const increase = root.querySelectorAll<HTMLButtonElement>('.quantity-control button')[1];
    expect(increase.disabled).toBe(true);
  });

  it('removes the item and shows the empty state', async () => {
    const remove = Array.from(root.querySelectorAll('.cart-item__actions button')).find((b) => b.textContent?.includes('Remove'));
    await click(remove);
    expect(cart.items()).toHaveLength(0);
    expect(root.querySelector('.cart-empty')).not.toBeNull();
  });

  it('moves the item to the wishlist with "Save for later"', async () => {
    const save = Array.from(root.querySelectorAll('.cart-item__actions button')).find((b) => b.textContent?.includes('Save for later'));
    await click(save);
    expect(cart.items()).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.wishlist) ?? '[]')).toContain('4');
  });

  it('validates the delivery pincode', async () => {
    await type('#cart-pincode', '12ab');
    await click(root.querySelector('.cart-delivery button[type="submit"]'));
    expect(text()).toContain('Enter a valid 6-digit pincode.');

    await type('#cart-pincode', '632001');
    await click(root.querySelector('.cart-delivery button[type="submit"]'));
    expect(text()).toContain('Delivery is available at 632001');
  });

  it('rejects unknown coupons and coupons the cart does not qualify for', async () => {
    await type('input[name="coupon"]', 'NOPE');
    await click(root.querySelector('.cart-coupon button[type="submit"]'));
    expect(text()).toContain('This coupon code is not valid.');

    await type('input[name="coupon"]', 'festive20');
    await click(root.querySelector('.cart-coupon button[type="submit"]'));
    expect(text()).toContain('Add items worth ₹750 more to use this coupon.');
  });

  it('applies a qualifying coupon and reflects it in the totals', async () => {
    cart.setQuantity('4', 3);
    await fixture.whenStable();
    await type('input[name="coupon"]', 'festive20');
    await click(root.querySelector('.cart-coupon button[type="submit"]'));

    expect(text()).toContain('FESTIVE20 applied');
    expect(compact()).toContain('Ordertotal₹1,247');
    expect(text()).toContain('You\'re saving ₹1,750 on this order');
  });
});
