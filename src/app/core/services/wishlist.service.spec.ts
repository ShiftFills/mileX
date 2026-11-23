// CHANGED (new): the wishlist hearts (PUT wishlist/save_for_later { CART_ID, VARIANT_ID }; never shopping_cart/insert).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { Product } from '@shared/models';
import { AuthService } from './auth.service';
import { CartService } from './cart.service';
import { ToastService } from './toast.service';
import { WishlistService } from './wishlist.service';

const USER_ID = 3;
const CUSTOMER_ID = 1;
const CART_URL = `/api/shopping_cart/get?CUSTOMER_ID=${CUSTOMER_ID}`;
const SAVE_URL = '/api/wishlist/save_for_later';
const DELETE_URL = '/api/shopping_cart/delete';
const INSERT_URL = '/api/shopping_cart/insert';

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

/** A Home card's product: "tissuee", with one variant (28), as products/get sends it. */
const TISSUE: Product = {
  id: '18', name: 'tissuee', description: '', price: 70, currency: 'INR', imageUrl: '', category: 'category-1',
  inStock: true, sellerId: 52, variantOptions: [{ id: '28', price: 70, inStock: true }],
};

/** A shopping_cart/get row: tissuee variant 28 in the cart (CART_ID 59). */
function cartRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CART_ID: 59, PRODUCT_ID: 18, SELLER_ID: 52, CART_QUANTITY: 1, UNIT_PRICE: '70.00', CUSTOMER_ID, SAVE_FOR_LATER: 0,
    PRODUCT_NAME: 'tissuee', VARIANT_ID: 28, ...overrides,
  };
}

describe('WishlistService', () => {
  let wishlist: WishlistService;
  let cart: CartService;
  let toast: ToastService;
  let http: HttpTestingController;

  /** Answers the product-status lookups CartService sends for cart rows (still listed). */
  function answerStatusLookups(): void {
    for (const request of http.match((req) => req.url.endsWith('/products/get') && req.params.has('PRODUCT_ID'))) {
      const id = Number(request.request.params.get('PRODUCT_ID'));
      request.flush({ status: true, data: [{ PRODUCT_ID: id, PRODUCT_NAME: 'Product', SELLING_PRICE: '1.00', IS_ACTIVE: 'ACTIVE' }] });
    }
  }

  function signInCustomer(): void {
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
      tokenWithClaims({ USER_ID, CUSTOMER_ID }),
    );
  }

  /** Signs a customer in and reads their cart once (shopping_cart/get: the CART_IDs and the saved state). */
  function syncCart(rows: Record<string, unknown>[]): void {
    signInCustomer();
    wishlist.sync();
    http.expectOne(CART_URL).flush({ success: true, data: rows });
    answerStatusLookups();
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    wishlist = TestBed.inject(WishlistService);
    cart = TestBed.inject(CartService);
    toast = TestBed.inject(ToastService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    toast.dismiss();
    // The heart never calls the shopping cart insert.
    http.expectNone(INSERT_URL);
    http.verify();
    localStorage.clear();
  });

  it('sends a signed-out visitor to Login instead of saving on the device', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    wishlist.sync();
    wishlist.toggleProduct(TISSUE);

    expect(navigate).toHaveBeenCalledWith([APP_ROUTES.login], { queryParams: { returnUrl: '/' } });
    expect(wishlist.has('18')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.wishlist)).toBeNull();
    http.expectNone(() => true);
  });

  it('tells a seller that only customers can save items, without any request', () => {
    TestBed.inject(AuthService).setSession(
      { id: '8', email: '', firstName: 'seller', lastName: '', userType: 'SELLER' },
      tokenWithClaims({ USER_ID: 8, SELLER_ID: 5 }),
    );
    wishlist.toggleProduct(TISSUE);

    expect(toast.current()).toEqual({ type: 'error', message: 'Only customer accounts can save items to the wishlist.' });
    http.expectNone(() => true);
  });

  it('reads the customer\'s cart once and fills the hearts of their saved rows', () => {
    syncCart([cartRow({ SAVE_FOR_LATER: 1 })]);
    wishlist.sync();
    http.expectNone(CART_URL);

    expect(wishlist.has('18')).toBe(true);
    expect(wishlist.has('19')).toBe(false);
  });

  it('saves the product\'s cart row with PUT { CART_ID, VARIANT_ID }, once however often it is tapped', () => {
    syncCart([cartRow()]);
    expect(cart.count()).toBe(1);

    wishlist.toggleProduct(TISSUE);
    expect(wishlist.isPending('18')).toBe(true);
    wishlist.toggleProduct(TISSUE);
    // The heart stays empty until the save succeeds.
    expect(wishlist.has('18')).toBe(false);

    const save = http.expectOne(SAVE_URL);
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({ CART_ID: 59, VARIANT_ID: 28 });
    save.flush(JSON.stringify({ status: true, message: 'Saved for later' }));

    expect(wishlist.has('18')).toBe(true);
    expect(wishlist.isPending('18')).toBe(false);
    expect(cart.count()).toBe(0);
    expect(toast.current()).toEqual({ type: 'success', message: 'tissuee was saved to your wishlist.' });
  });

  it('calls PUT with CART_ID null and the product\'s VARIANT_ID for a product with no cart row', () => {
    syncCart([]);
    const lenovo: Product = {
      ...TISSUE, id: '16', name: 'Lenovo IdeaPad Slim 57',
      variantOptions: [{ id: '23', price: 20000, inStock: false }, { id: '24', price: 20000, inStock: true }],
    };

    wishlist.toggleProduct(lenovo);
    const save = http.expectOne(SAVE_URL);
    expect(save.request.method).toBe('PUT');
    // No cart row: CART_ID null (none is invented), and the first variant in stock.
    expect(save.request.body).toEqual({ CART_ID: null, VARIANT_ID: 24 });
    save.flush({ status: false, message: 'CART_ID is required' }, { status: 400, statusText: 'Bad Request' });

    expect(wishlist.has('16')).toBe(false);
    expect(toast.current()).toEqual({ type: 'error', message: 'CART_ID is required' });
  });

  it('fills the heart when the backend saves a product sent without a CART_ID (the cart is read again)', () => {
    syncCart([]);

    wishlist.toggleProduct(TISSUE);
    const save = http.expectOne(SAVE_URL);
    expect(save.request.body).toEqual({ CART_ID: null, VARIANT_ID: 28 });
    save.flush('Saved for later');
    http.expectOne(CART_URL).flush({ success: true, data: [cartRow({ SAVE_FOR_LATER: 1 })] });

    expect(wishlist.has('18')).toBe(true);
    expect(toast.current()).toEqual({ type: 'success', message: 'tissuee was saved to your wishlist.' });
  });

  it('keeps the heart empty when the backend accepts it but saves nothing', () => {
    syncCart([]);

    wishlist.toggleProduct(TISSUE);
    http.expectOne(SAVE_URL).flush('Updated');
    http.expectOne(CART_URL).flush({ success: true, data: [] });

    expect(wishlist.has('18')).toBe(false);
    expect(toast.current()).toEqual({
      type: 'error', message: 'tissuee was not saved: the wishlist API did not create a saved item without a CART_ID.',
    });
  });

  it('sends VARIANT_ID null for a cart row without a variant', () => {
    syncCart([cartRow({ CART_ID: 70, PRODUCT_ID: 20, PRODUCT_NAME: 'Samsung Galaxy S25', VARIANT_ID: null })]);
    const phone: Product = { ...TISSUE, id: '20', name: 'Samsung Galaxy S25' };

    wishlist.toggleProduct(phone);
    const save = http.expectOne(SAVE_URL);
    expect(save.request.body).toEqual({ CART_ID: 70, VARIANT_ID: null });
    save.flush('Saved for later');

    expect(wishlist.has('20')).toBe(true);
  });

  it('saves the row of the selected variant on the Product View, and only that one', () => {
    syncCart([cartRow({ CART_ID: 60, VARIANT_ID: 29 }), cartRow()]);

    wishlist.toggleProduct(TISSUE, '28');
    const save = http.expectOne(SAVE_URL);
    expect(save.request.body).toEqual({ CART_ID: 59, VARIANT_ID: 28 });
    save.flush('Saved for later');

    // Variant 30 is not in the cart: CART_ID null with the selected VARIANT_ID 30.
    wishlist.toggleProduct({ ...TISSUE, id: '18' }, '30');
    const second = http.expectOne(SAVE_URL);
    expect(second.request.body).toEqual({ CART_ID: null, VARIANT_ID: 30 });
    second.flush({ message: 'CART_ID is required' }, { status: 400, statusText: 'Bad Request' });
  });

  it('keeps the row in the cart and the heart empty when the save fails', () => {
    syncCart([cartRow()]);

    wishlist.toggleProduct(TISSUE);
    http.expectOne(SAVE_URL).flush({ message: 'Could not save the item' }, { status: 500, statusText: 'Server Error' });

    expect(wishlist.has('18')).toBe(false);
    expect(cart.count()).toBe(1);
    expect(toast.current()).toEqual({ type: 'error', message: 'Could not save the item' });
  });

  it('removes a saved product when its filled heart is tapped (DELETE shopping_cart/delete)', () => {
    syncCart([cartRow({ SAVE_FOR_LATER: 1 })]);

    wishlist.toggleProduct(TISSUE);
    const remove = http.expectOne(DELETE_URL);
    expect(remove.request.body).toEqual({ CART_ID: 59, PRODUCT_ID: 18, SELLER_ID: 52, CUSTOMER_ID, PRODUCT_VARIANT_ID: 28 });
    remove.flush('Cart item deleted successfully');

    expect(wishlist.has('18')).toBe(false);
    expect(toast.current()).toEqual({ type: 'success', message: 'tissuee was removed from your wishlist.' });
  });
});
