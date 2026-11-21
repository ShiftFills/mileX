import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ToastService } from '@core/services/toast.service';
import { Cart } from './cart';

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEYS.cart);
  localStorage.removeItem(STORAGE_KEYS.wishlist);
  localStorage.removeItem(STORAGE_KEYS.user);
  localStorage.removeItem(STORAGE_KEYS.accessToken);
}

const PRODUCTS_RESPONSE = {
  status: 'SUCCESS',
  data: [
    { PRODUCT_ID: 3, PRODUCT_NAME: 'Samsung Galaxy S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 5, CATEGORY_ID: 1, IS_ACTIVE: 1 },
    { PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse Updated', PRICE: '999.00', SELLING_PRICE: '749.00', STOCK_QUANTITY: 90, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
    { PRODUCT_ID: 5, PRODUCT_NAME: 'Wireless Mouse', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
  ],
};

/** The sample customer login: a different USER_ID and CUSTOMER_ID, as returned by the backend. */
const USER_ID = 3;
const CUSTOMER_ID = 1;

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

function signInCustomer(): void {
  TestBed.inject(AuthService).setSession(
    { id: String(USER_ID), email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
    tokenWithClaims({ USER_ID, CUSTOMER_ID }),
  );
}

function cartRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CART_ID: 70,
    PRODUCT_ID: 12,
    SELLER_ID: 8,
    SKU: 'CRT0070',
    CART_QUANTITY: 2,
    UNIT_PRICE: '600.00',
    CART_DISCOUNT: '50.00',
    TAX: '45.00',
    TOTAL_AMOUNT: '945.00',
    CUSTOMER_ID,
    SAVE_FOR_LATER: 0,
    PRODUCT_NAME: 'Head Set',
    PRODUCT_CODE_SKU: 'SKU0012',
    PRODUCT_IMAGE: 'uploads/products/headset.png',
    MRP: '3000.00',
    PRODUCT_DISCOUNT: '0.00',
    PRODUCT_STOCK_QUANTITY: 34,
    MAXIMUM_ORDER_QUANTITY: 5,
    ...overrides,
  };
}

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

  it('loads customer cart details using the CUSTOMER_ID (not the USER_ID) and preserves local items', async () => {
    signInCustomer();
    const customerFixture = TestBed.createComponent(Cart);
    customerFixture.detectChanges();

    const request = http.expectOne((req) => req.url.endsWith('/shopping_cart/get'));
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('CUSTOMER_ID')).toBe(String(CUSTOMER_ID));
    expect(request.request.params.get('CUSTOMER_ID')).not.toBe(String(USER_ID));
    expect(request.request.params.has('PRODUCT_ID')).toBe(false);
    expect(request.request.params.has('SELLER_ID')).toBe(false);
    request.flush({
      success: true,
      message: 'Shopping cart details fetched successfully',
      data: [
        {
          CART_ID: 70,
          PRODUCT_ID: 12,
          SELLER_ID: 8,
          SKU: 'CRT0070',
          CART_QUANTITY: 2,
          UNIT_PRICE: '600.00',
          CART_DISCOUNT: '50.00',
          TAX: '45.00',
          TOTAL_AMOUNT: '945.00',
          CUSTOMER_ID,
          SAVE_FOR_LATER: 0,
          PRODUCT_NAME: 'Head Set',
          PRODUCT_CODE_SKU: 'SKU0012',
          PRODUCT_IMAGE: 'uploads/products/headset.png',
          PRODUCT_DESCRIPTION: 'Head set',
          SELLING_PRICE: '2000.00',
          MRP: '3000.00',
          PRODUCT_DISCOUNT: '0.00',
          PRODUCT_STOCK_QUANTITY: 34,
          MAXIMUM_ORDER_QUANTITY: 5,
          VARIANT_ID: null,
          VARIANT_NAME: null,
          VARIANT_SKU: null,
          BARCODE: null,
          COLOR_ID: null,
          COLOUR_NAME: null,
          SIZE_ID: null,
          SIZE_NAME: null,
          MATERIAL_ID: null,
          MATERIAL_NAME: null,
        },
      ],
    });

    await customerFixture.whenStable();
    customerFixture.detectChanges();
    const customerRoot = customerFixture.nativeElement as HTMLElement;
    expect(customerRoot.querySelectorAll('.cart-item')).toHaveLength(2);
    expect(customerRoot.querySelector('.cart-item h2')?.textContent).toContain('Head Set');
    expect(customerRoot.querySelector('.cart-item__sku')?.textContent).toContain('SKU0012');
    expect(customerRoot.querySelector('.cart-item__image')?.getAttribute('src'))
      .toBe('/uploads/products/headset.png');
    expect(customerRoot.querySelector('.cart-item__variant')).toBeNull();
    expect(customerRoot.textContent).toContain('Tax:');
    expect(customerRoot.textContent).toContain('Item total:');
    expect(customerRoot.textContent).toContain('₹1,694');

    customerRoot.querySelector<HTMLButtonElement>('.cart-item .quantity-control button:last-child')!.click();
    await customerFixture.whenStable();
    customerFixture.detectChanges();
    expect(customerRoot.querySelector('.cart-item output')?.textContent).toBe('3');
    expect(customerRoot.querySelector('.cart-item__total')?.textContent).toContain('₹1,417.50');

    customerFixture.destroy();
  });

  it('rejects cart rows stored under the USER_ID instead of the CUSTOMER_ID', async () => {
    signInCustomer();
    const customerFixture = TestBed.createComponent(Cart);
    customerFixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/shopping_cart/get')).flush({
      success: true,
      message: 'Shopping cart details fetched successfully',
      data: [cartRow({ CUSTOMER_ID: USER_ID })],
    });
    await customerFixture.whenStable();
    customerFixture.detectChanges();

    expect(customerFixture.nativeElement.textContent).toContain(
      'The shopping cart API returned an item for a different customer.',
    );
    customerFixture.destroy();
  });

  describe('customer session without a CUSTOMER_ID', () => {
    function signInWithoutCustomerId(): void {
      // The token carries a USER_ID but no CUSTOMER_ID claim; it must never be used as the customer ID.
      TestBed.inject(AuthService).setSession(
        { id: String(USER_ID), email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
        tokenWithClaims({ USER_ID }),
      );
    }

    it('does not request the cart and offers "Sign in again"', async () => {
      signInWithoutCustomerId();
      const customerFixture = TestBed.createComponent(Cart);
      customerFixture.detectChanges();
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      http.expectNone((req) => req.url.endsWith('/shopping_cart/get'));
      const customerRoot = customerFixture.nativeElement as HTMLElement;
      expect(customerRoot.textContent).toContain('A valid customer ID is unavailable. Sign in again to load your cart.');
      expect(customerRoot.querySelector('.cart-state__retry')?.textContent?.trim()).toBe('Sign in again');
      customerFixture.destroy();
    });

    it('clears the session and goes to Login with a return URL when "Sign in again" is clicked', async () => {
      signInWithoutCustomerId();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const customerFixture = TestBed.createComponent(Cart);
      customerFixture.detectChanges();
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      customerFixture.nativeElement.querySelector('.cart-state__retry').click();

      expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
      expect(navigate).toHaveBeenCalledWith([APP_ROUTES.login], {
        queryParams: { returnUrl: APP_ROUTES.cart },
      });
      http.expectNone((req) => req.url.endsWith('/shopping_cart/get'));
      customerFixture.destroy();
    });
  });

  async function openCustomerCart(rows: Record<string, unknown>[]): Promise<{
    customerFixture: ComponentFixture<Cart>;
    customerRoot: HTMLElement;
  }> {
    signInCustomer();
    const customerFixture = TestBed.createComponent(Cart);
    customerFixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/shopping_cart/get')).flush({
      success: true,
      message: 'Shopping cart details fetched successfully',
      data: rows,
    });
    await customerFixture.whenStable();
    customerFixture.detectChanges();
    return { customerFixture, customerRoot: customerFixture.nativeElement as HTMLElement };
  }

  // CHANGED (new)
  describe('product images', () => {
    const KEY = 'products/866dea6fc30de9342300a6e901f8df6f.png';
    const SIGNED = `https://milex.s3.amazonaws.com/${KEY}?X-Amz-Signature=first`;
    const imageRequests = (): ReturnType<HttpTestingController['match']> =>
      http.match((req) => req.url.includes('/s3/images/'));
    const imageOf = (container: HTMLElement, name: string): Element | null =>
      Array.from(container.querySelectorAll('.cart-item'))
        .find((article) => article.querySelector('h2')?.textContent?.includes(name))
        ?.querySelector('.cart-item__image') ?? null;

    it('shows the signed S3 URL of PRODUCT_IMAGE in cart and saved rows, one request per key', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([
        cartRow({ PRODUCT_IMAGE: KEY }),
        cartRow({ CART_ID: 71, PRODUCT_ID: 13, PRODUCT_NAME: 'Keyboard', SAVE_FOR_LATER: 1, PRODUCT_IMAGE: KEY }),
      ]);

      const requests = imageRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].request.method).toBe('GET');
      expect(requests[0].request.url).toBe(`/s3-api/s3/images/${KEY}`);
      expect(requests[0].request.headers.has('Authorization')).toBe(false);
      // Loading: the image box without a broken "/products/..." URL.
      expect(imageOf(customerRoot, 'Head Set')?.getAttribute('aria-label')).toBe('Loading image of Head Set');
      expect(customerRoot.querySelector(`img[src="/${KEY}"]`)).toBeNull();

      requests[0].flush({ success: true, imageKey: KEY, imageUrl: SIGNED, expiresIn: 3600 });
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(imageOf(customerRoot, 'Head Set')?.getAttribute('src')).toBe(SIGNED);
      expect(customerRoot.querySelector('.cart-saved .cart-item__image')?.getAttribute('src')).toBe(SIGNED);
      customerFixture.destroy();
    });

    it('gets one fresh URL when the image fails to display, then shows the empty image box', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([cartRow({ PRODUCT_IMAGE: KEY })]);
      imageRequests()[0].flush({ success: true, imageKey: KEY, imageUrl: SIGNED, expiresIn: 3600 });
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      imageOf(customerRoot, 'Head Set')!.dispatchEvent(new Event('error'));
      await customerFixture.whenStable();
      customerFixture.detectChanges();
      const refresh = imageRequests();
      expect(refresh).toHaveLength(1);
      const renewed = SIGNED.replace('first', 'second');
      refresh[0].flush({ success: true, imageKey: KEY, imageUrl: renewed, expiresIn: 3600 });
      await customerFixture.whenStable();
      customerFixture.detectChanges();
      expect(imageOf(customerRoot, 'Head Set')?.getAttribute('src')).toBe(renewed);

      imageOf(customerRoot, 'Head Set')!.dispatchEvent(new Event('error'));
      await customerFixture.whenStable();
      customerFixture.detectChanges();
      expect(imageRequests()).toHaveLength(0);
      expect(imageOf(customerRoot, 'Head Set')?.tagName).toBe('SPAN');
      expect(imageOf(customerRoot, 'Head Set')?.getAttribute('aria-label')).toBe('No image for Head Set');
      customerFixture.destroy();
    });

    it('shows the empty image box when the S3 URL cannot be loaded or the row has no image', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([
        cartRow({ PRODUCT_IMAGE: KEY }),
        cartRow({ CART_ID: 72, PRODUCT_ID: 14, PRODUCT_NAME: 'Ear Buds', PRODUCT_IMAGE: null }),
      ]);
      imageRequests()[0].flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(imageOf(customerRoot, 'Head Set')?.getAttribute('aria-label')).toBe('No image for Head Set');
      expect(imageOf(customerRoot, 'Ear Buds')?.getAttribute('aria-label')).toBe('No image for Ear Buds');
      expect(customerRoot.querySelector('.cart-items img[src="/images/latest-gadgets.svg"]')).toBeNull();
      customerFixture.destroy();
    });
  });

  describe('Save for later (customer cart)', () => {
    const saveButtonOf = (container: HTMLElement): HTMLButtonElement =>
      Array.from(container.querySelectorAll<HTMLButtonElement>('.cart-items .cart-item__actions button'))
        .find((button) => button.textContent?.includes('Save for later'))!;

    it('shows SAVE_FOR_LATER = 1 rows under Saved for later and SAVE_FOR_LATER = 0 rows in the cart', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([
        cartRow(),
        cartRow({ CART_ID: 71, PRODUCT_ID: 13, PRODUCT_NAME: 'Keyboard', SAVE_FOR_LATER: 1 }),
      ]);

      expect(Array.from(customerRoot.querySelectorAll('.cart-items .cart-item h2')).map((h) => h.textContent))
        .toEqual(expect.arrayContaining(['Head Set']));
      expect(customerRoot.querySelector('.cart-items')?.textContent).not.toContain('Keyboard');
      expect(customerRoot.querySelectorAll('.cart-saved .cart-item')).toHaveLength(1);
      expect(customerRoot.querySelector('.cart-saved')?.textContent).toContain('Keyboard');
      expect(cart.count()).toBe(3); // 1 local mouse + 2 Head Sets; the saved row is not counted
      customerFixture.destroy();
    });

    it('calls PUT wishlist/save_for_later with the row CART_ID once, then moves the row and updates totals', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([cartRow()]);
      const subtotalBefore = cart.subtotal();
      const button = saveButtonOf(customerRoot);

      button.click();
      button.click(); // repeated click while the request is in flight
      customerFixture.detectChanges();

      const request = http.expectOne((req) => req.url.endsWith('/wishlist/save_for_later'));
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ CART_ID: 70 });
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');

      request.flush('SUCCESS');
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(customerRoot.querySelectorAll('.cart-items .cart-item')).toHaveLength(1);
      expect(customerRoot.querySelector('.cart-items')?.textContent).not.toContain('Head Set');
      expect(customerRoot.querySelectorAll('.cart-saved .cart-item')).toHaveLength(1);
      expect(customerRoot.querySelector('.cart-saved')?.textContent).toContain('Head Set');
      expect(cart.count()).toBe(1);
      expect(cart.subtotal()).toBe(subtotalBefore - 1200);
      expect(TestBed.inject(ToastService).current()?.type).toBe('success');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.wishlist) ?? '[]')).not.toContain('12');
      customerFixture.destroy();
    });

    it('calls PUT for a backend row when TOTAL_AMOUNT is omitted by shopping_cart/get', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([
        cartRow({
          CART_ID: 5,
          PRODUCT_ID: 1,
          SELLER_ID: 1,
          SKU: 'CRT0001',
          CART_QUANTITY: 2,
          UNIT_PRICE: '600.00',
          TOTAL_AMOUNT: undefined,
          CART_DISCOUNT: undefined,
          TAX: undefined,
          CUSTOMER_ID,
          PRODUCT_NAME: 'Head Set',
          PRODUCT_CODE_SKU: 'SKU0001',
          MRP: '3000.00',
          PRODUCT_DISCOUNT: undefined,
        }),
      ]);

      expect(customerRoot.querySelector('.cart-item__total')?.textContent).toContain('₹1,200.00');
      saveButtonOf(customerRoot).click();

      const request = http.expectOne('/api/wishlist/save_for_later');
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ CART_ID: 5 });
      request.flush('SUCCESS');
      await customerFixture.whenStable();

      expect(TestBed.inject(ToastService).current()?.type).toBe('success');
      customerFixture.destroy();
    });

    it('does not duplicate a row that is already saved', async () => {
      const { customerFixture } = await openCustomerCart([
        cartRow({ SAVE_FOR_LATER: 1 }),
        cartRow({ SAVE_FOR_LATER: 1 }),
      ]);
      expect(cart.savedItems()).toHaveLength(1);
      customerFixture.destroy();
    });

    it('keeps the row in the cart and shows an error toast when the API fails', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([cartRow()]);
      const button = saveButtonOf(customerRoot);

      button.click();
      http.expectOne((req) => req.url.endsWith('/wishlist/save_for_later')).flush(
        { message: 'Cart row could not be saved' },
        { status: 500, statusText: 'Server Error' },
      );
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(customerRoot.querySelectorAll('.cart-items .cart-item')).toHaveLength(2);
      expect(customerRoot.querySelector('.cart-saved')).toBeNull();
      expect(button.disabled).toBe(false);
      expect(TestBed.inject(ToastService).current()).toEqual({
        type: 'error',
        message: 'Cart row could not be saved',
      });
      customerFixture.destroy();
    });

    it('treats a 2xx response that reports failure as an error', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([cartRow()]);

      saveButtonOf(customerRoot).click();
      http.expectOne((req) => req.url.endsWith('/wishlist/save_for_later')).flush(
        JSON.stringify({ status: 'FAILURE', message: 'Already saved' }),
      );
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(customerRoot.querySelector('.cart-saved')).toBeNull();
      expect(TestBed.inject(ToastService).current()).toEqual({ type: 'error', message: 'Already saved' });
      customerFixture.destroy();
    });
  });

  it('shows the shopping cart API error and retry state', async () => {
    signInCustomer();
    const customerFixture = TestBed.createComponent(Cart);
    customerFixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/shopping_cart/get')).flush({
      success: false,
      message: 'Cart unavailable',
      data: [],
    });
    await customerFixture.whenStable();
    customerFixture.detectChanges();

    expect(customerFixture.nativeElement.textContent).toContain('Cart unavailable');
    expect(customerFixture.nativeElement.querySelector('.cart-state__retry')).not.toBeNull();
    customerFixture.destroy();
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
  describe('Remove item (customer cart)', () => {
    const removeButtonOf = (container: HTMLElement, name: string): HTMLButtonElement => {
      const row = Array.from(container.querySelectorAll('.cart-items .cart-item'))
        .find((article) => article.querySelector('h2')?.textContent?.includes(name));
      return Array.from(row!.querySelectorAll<HTMLButtonElement>('.cart-item__actions button'))
        .find((button) => button.textContent?.includes('Remove'))!;
    };
    const deleteRequests = (): ReturnType<HttpTestingController['match']> =>
      http.match((req) => req.url.endsWith('/shopping_cart/delete'));

    it('calls DELETE shopping_cart/delete once with the row IDs, then removes only that row', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([
        cartRow(),
        cartRow({ CART_ID: 71, PRODUCT_ID: 12, SELLER_ID: 9, VARIANT_NAME: 'Blue', PRODUCT_NAME: 'Head Set' }),
      ]);
      expect(customerRoot.querySelectorAll('.cart-items .cart-item')).toHaveLength(3);
      const countBefore = cart.count();
      const button = removeButtonOf(customerRoot, 'Head Set');

      button.click();
      button.click(); // repeated click while the request is in flight
      customerFixture.detectChanges();

      const requests = deleteRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].request.method).toBe('DELETE');
      expect(requests[0].request.body).toEqual({ CART_ID: 70, PRODUCT_ID: 12, SELLER_ID: 8, CUSTOMER_ID });
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');

      requests[0].flush('SUCCESS');
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(cart.items().map((item) => item.apiDetails?.cartId)).not.toContain('70');
      expect(cart.items().map((item) => item.apiDetails?.cartId)).toContain('71');
      expect(customerRoot.querySelectorAll('.cart-items .cart-item')).toHaveLength(2);
      expect(cart.count()).toBe(countBefore - 2);
      expect(TestBed.inject(ToastService).current()?.type).toBe('success');
      customerFixture.destroy();
    });

    it('keeps the row and shows an error toast when the API fails', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([cartRow()]);
      const button = removeButtonOf(customerRoot, 'Head Set');

      button.click();
      deleteRequests()[0].flush({ message: 'Cart row could not be deleted' }, { status: 500, statusText: 'Server Error' });
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(customerRoot.querySelectorAll('.cart-items .cart-item')).toHaveLength(2);
      expect(button.disabled).toBe(false);
      expect(TestBed.inject(ToastService).current()).toEqual({
        type: 'error',
        message: 'Cart row could not be deleted',
      });
      customerFixture.destroy();
    });

    it('treats a 2xx response that reports failure as an error and keeps the row', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([cartRow()]);

      removeButtonOf(customerRoot, 'Head Set').click();
      deleteRequests()[0].flush(JSON.stringify({ status: 'FAILURE', message: 'Row not found' }));
      await customerFixture.whenStable();
      customerFixture.detectChanges();

      expect(customerRoot.querySelectorAll('.cart-items .cart-item')).toHaveLength(2);
      expect(TestBed.inject(ToastService).current()).toEqual({ type: 'error', message: 'Row not found' });
      customerFixture.destroy();
    });

    it('blocks Save for later and quantity changes on a row while its delete is in flight', async () => {
      const { customerFixture, customerRoot } = await openCustomerCart([cartRow()]);
      const row = Array.from(customerRoot.querySelectorAll('.cart-items .cart-item'))
        .find((article) => article.querySelector('h2')?.textContent?.includes('Head Set'))!;

      removeButtonOf(customerRoot, 'Head Set').click();
      customerFixture.detectChanges();

      const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button'));
      expect(buttons.every((button) => button.disabled)).toBe(true);
      deleteRequests()[0].flush('SUCCESS');
      await customerFixture.whenStable();
      customerFixture.destroy();
    });
  });
});