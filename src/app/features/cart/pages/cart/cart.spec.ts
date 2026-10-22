import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { CartService } from '@core/services/cart.service';
import { Cart } from './cart';

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEYS.cart);
  localStorage.removeItem(STORAGE_KEYS.cartDemoSeeded);
  localStorage.removeItem(STORAGE_KEYS.cartDemoSeedVersion);
  localStorage.removeItem(STORAGE_KEYS.wishlist);
}

describe('Cart', () => {
  let fixture: ComponentFixture<Cart>;
  let root: HTMLElement;
  let cart: CartService;

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
    await TestBed.configureTestingModule({
      imports: [Cart],
      providers: [provideRouter([])],
    }).compileComponents();
    cart = TestBed.inject(CartService);
    fixture = TestBed.createComponent(Cart);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(clearStorage);

  it('shows the demo item with its price, discount and order summary', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Shopping Cart');
    expect(root.querySelector('.cart-item h2')?.textContent).toContain('Women Printed Maxi Dress');
    expect(text()).toContain('₹999');
    expect(text()).toContain('33% OFF');
    expect(compact()).toContain('Price(1item)₹1,499');
    expect(compact()).toContain('Productdiscount−₹500');
    expect(text()).toContain('You\'re saving ₹500 on this order');
    expect(text()).toContain('Your ₹999 subtotal does not qualify yet.');
  });

  it('updates totals when the quantity changes and never goes below 1', async () => {
    const [decrease, increase] = Array.from(root.querySelectorAll('.quantity-control button'));
    expect((decrease as HTMLButtonElement).disabled).toBe(true);

    await click(increase);
    expect(cart.count()).toBe(2);
    expect(compact()).toContain('Price(2items)₹2,998');
    expect(text()).toContain('Your order qualifies for free shipping.');
  });

  it('stops the quantity at the available stock', async () => {
    cart.setQuantity('women-printed-maxi-dress-1', 5);
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
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.wishlist) ?? '[]')).toContain('women-printed-maxi-dress-1');
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
    expect(text()).toContain('Add items worth ₹500 more to use this coupon.');
  });

  it('applies a qualifying coupon and reflects it in the totals', async () => {
    cart.setQuantity('women-printed-maxi-dress-1', 2); // subtotal ₹1,998 >= ₹1,499 minimum
    await fixture.whenStable();
    await type('input[name="coupon"]', 'festive20');
    await click(root.querySelector('.cart-coupon button[type="submit"]'));

    expect(text()).toContain('FESTIVE20 applied');
    expect(compact()).toContain('Ordertotal₹998');
    expect(text()).toContain('You\'re saving ₹2,000 on this order'); // ₹1,000 product discount + ₹1,000 coupon
  });
});
