import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { AuthService } from '@core/services/auth.service';
import { CartItem } from '@shared/models';
import { ShoppingCartService } from './shopping-cart.service';

const CART_RESPONSE = {
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
      CUSTOMER_ID: 3,
      SAVE_FOR_LATER: 0,
      PRODUCT_NAME: 'Head Set',
      PRODUCT_CODE_SKU: 'SKU0012',
      PRODUCT_IMAGE: 'uploads/products/headset.png',
      PRODUCT_DESCRIPTION: 'Head set',
      SELLING_PRICE: '2000.00',
      MRP: '3000.00',
      PRODUCT_DISCOUNT: '0.00',
      PRODUCT_STOCK_QUANTITY: 34,
      MINIMUM_ORDER_QUANTITY: 2,
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
      VARIANT_PRICE: null,
      VARIANT_STOCK_QUANTITY: null,
      VARIANT_IMAGE: null,
      VARIANT_STATUS: null,
    },
    {
      CART_ID: 71,
      PRODUCT_ID: 13,
      SELLER_ID: 9,
      SKU: 'CRT0071',
      CART_QUANTITY: 1,
      UNIT_PRICE: '450.00',
      CART_DISCOUNT: '0.00',
      TAX: '22.50',
      TOTAL_AMOUNT: '472.50',
      CUSTOMER_ID: 3,
      SAVE_FOR_LATER: 0,
      PRODUCT_NAME: 'Travel Mug',
      PRODUCT_CODE_SKU: 'SKU0013',
      PRODUCT_IMAGE: null,
      PRODUCT_DESCRIPTION: 'Insulated mug',
      SELLING_PRICE: '450.00',
      MRP: '500.00',
      PRODUCT_DISCOUNT: '50.00',
      PRODUCT_STOCK_QUANTITY: 10,
      MINIMUM_ORDER_QUANTITY: 1,
      MAXIMUM_ORDER_QUANTITY: 4,
      VARIANT_ID: 21,
      VARIANT_NAME: 'Steel',
      VARIANT_SKU: 'VAR0021',
      BARCODE: '12345',
      COLOR_ID: 4,
      COLOUR_NAME: 'Silver',
      SIZE_ID: 2,
      SIZE_NAME: 'Large',
      MATERIAL_ID: 3,
      MATERIAL_NAME: 'Stainless steel',
    },
  ],
};

/** The item part of the insert payload; CUSTOMER_ID and CREATED_BY come from the session. */
const CART_ITEM = {
  PRODUCT_ID: 9,
  SELLER_ID: 1,
  PRODUCT_VARIANT_ID: 14,
  QUANTITY: 1,
  UNIT_PRICE: 115000,
  DISCOUNT: 0,
  TAX: 0,
  TOTAL_AMOUNT: 115000,
};

const INSERT_URL = '/api/shopping_cart/insert';

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

describe('ShoppingCartService', () => {
  let service: ShoppingCartService;
  let auth: AuthService;
  let http: HttpTestingController;

  /** Signs in a session whose IDs come from the access token claims, like a real login. */
  function signIn(userType: string, claims: Record<string, unknown>): void {
    auth.setSession(
      { id: String(claims['USER_ID']), email: '', firstName: 'user', lastName: '', userType },
      tokenWithClaims(claims),
    );
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    service = TestBed.inject(ShoppingCartService);
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads all customer items using only the dynamically provided CUSTOMER_ID', () => {
    let items: CartItem[] = [];
    service.getCart(3).subscribe((result) => (items = result));

    const request = http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=3');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('PRODUCT_ID')).toBeNull();
    expect(request.request.params.get('SELLER_ID')).toBeNull();
    request.flush(CART_RESPONSE);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      product: {
        id: '12',
        name: 'Head Set',
        sku: 'SKU0012',
        imageUrl: '/uploads/products/headset.png',
        price: 600,
        originalPrice: 3000,
      },
      quantity: 2,
      apiDetails: {
        cartId: '70',
        sellerId: 8,
        customerId: 3,
        unitPrice: 600,
        cartDiscount: 50,
        tax: 45,
        totalAmount: 945,
      },
    });
    expect(items[0]?.apiDetails?.variant).toBeUndefined();
    expect(items[1]?.apiDetails?.variant).toEqual({
      id: '21',
      name: 'Steel',
      sku: 'VAR0021',
      barcode: '12345',
      color: 'Silver',
      size: 'Large',
      material: 'Stainless steel',
    });
    expect(items[1]?.product.imageUrl).toBe('/images/latest-gadgets.svg');
  });

  // CHANGED (new)
  it('keeps an S3 PRODUCT_IMAGE as imageKey instead of a relative URL', () => {
    let items: CartItem[] = [];
    service.getCart(3).subscribe((result) => (items = result));
    http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=3').flush({
      ...CART_RESPONSE,
      data: [{ ...CART_RESPONSE.data[0], PRODUCT_IMAGE: 'products/866dea6fc30de9342300a6e901f8df6f.png' }],
    });

    expect(items[0]?.product.imageKey).toBe('products/866dea6fc30de9342300a6e901f8df6f.png');
    expect(items[0]?.product.imageUrl).toBe('/images/latest-gadgets.svg');
    expect(items[0]?.product.imageUrl).not.toBe('/products/866dea6fc30de9342300a6e901f8df6f.png');
  });

  it('returns an empty list for a successful empty cart', () => {
    let items: unknown;
    service.getCart(3).subscribe((result) => (items = result));
    http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=3').flush({
      success: true,
      message: 'Shopping cart details fetched successfully',
      data: [],
    });

    expect(items).toEqual([]);
  });

  it('rejects invalid customer IDs and cart records returned for another customer', () => {
    expect(() => service.getCart(0)).toThrowError(RangeError);

    let error: unknown;
    service.getCart(3).subscribe({ error: (caught: unknown) => (error = caught) });
    const response = {
      ...CART_RESPONSE,
      data: CART_RESPONSE.data.map((item, index) =>
        index === 0 ? { ...item, CUSTOMER_ID: 4 } : item,
      ),
    };
    http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=3').flush(response);

    expect(error).toEqual(new Error('The shopping cart API returned an item for a different customer.'));
  });

  it('does not write diagnostic output to the console when a customer mismatch is rejected', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    service.getCart(1).subscribe({ error: () => undefined });
    http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=1').flush(CART_RESPONSE);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  describe('with a customer session (USER_ID 3, CUSTOMER_ID 1)', () => {
    beforeEach(() => signIn('CUSTOMER', { USER_ID: 3, CUSTOMER_ID: 1 }));

    it('loads the cart with the CUSTOMER_ID, not the USER_ID', () => {
      let items: CartItem[] = [];
      service.getCart(auth.customerId() as number).subscribe((result) => (items = result));

      const request = http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=1');
      request.flush({
        ...CART_RESPONSE,
        data: CART_RESPONSE.data.map((item) => ({ ...item, CUSTOMER_ID: 1 })),
      });

      expect(items).toHaveLength(2);
      expect(items.every((item) => item.apiDetails?.customerId === 1)).toBe(true);
    });

    it('rejects rows saved under the USER_ID when the logged-in customer is a different ID', () => {
      let error: unknown;
      service.getCart(auth.customerId() as number).subscribe({ error: (caught: unknown) => (error = caught) });

      // CART_RESPONSE rows carry CUSTOMER_ID 3, which is this person's USER_ID, not their customer.
      http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=1').flush(CART_RESPONSE);

      expect(error).toEqual(new Error('The shopping cart API returned an item for a different customer.'));
    });

    it('posts CUSTOMER_ID 1 and CREATED_BY 3 to shopping_cart/insert', () => {
      let completed = false;
      service.addItem(CART_ITEM).subscribe({ complete: () => (completed = true) });

      const request = http.expectOne(INSERT_URL);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        PRODUCT_ID: 9,
        SELLER_ID: 1,
        PRODUCT_VARIANT_ID: 14,
        QUANTITY: 1,
        UNIT_PRICE: 115000,
        DISCOUNT: 0,
        TAX: 0,
        TOTAL_AMOUNT: 115000,
        CUSTOMER_ID: 1,
        CREATED_BY: 3,
      });
      request.flush('Shopping cart item added successfully');

      expect(completed).toBe(true);
    });

    it('never sends the USER_ID as CUSTOMER_ID', () => {
      service.addItem(CART_ITEM).subscribe();

      const request = http.expectOne(INSERT_URL);
      const body = request.request.body as Record<string, number>;
      expect(body['CUSTOMER_ID']).toBe(auth.customerId());
      expect(body['CUSTOMER_ID']).not.toBe(auth.userId());
      expect(body['CREATED_BY']).toBe(auth.userId());
      request.flush('');
    });

    it('ignores CUSTOMER_ID and CREATED_BY values passed in by the caller', () => {
      service
        .addItem({ ...CART_ITEM, CUSTOMER_ID: 99, CREATED_BY: 99 } as unknown as typeof CART_ITEM)
        .subscribe();

      const request = http.expectOne(INSERT_URL);
      expect(request.request.body).toMatchObject({ CUSTOMER_ID: 1, CREATED_BY: 3 });
      request.flush('');
    });

    it('rejects invalid IDs and amounts without sending a request', () => {
      const invalid = [
        { PRODUCT_ID: 0 },
        { SELLER_ID: -1 },
        { SELLER_ID: 1.5 },
        { PRODUCT_VARIANT_ID: 0 },
        { QUANTITY: 0 },
        { UNIT_PRICE: -1 },
        { DISCOUNT: Number.NaN },
        { TAX: -0.5 },
        { TOTAL_AMOUNT: Number.POSITIVE_INFINITY },
      ];

      for (const override of invalid) {
        let error: unknown;
        service.addItem({ ...CART_ITEM, ...override }).subscribe({ error: (caught: unknown) => (error = caught) });
        expect(error).toBeInstanceOf(RangeError);
      }
      http.expectNone(INSERT_URL);
    });

    it('reports a failure returned in a JSON body', () => {
      let error: unknown;
      service.addItem(CART_ITEM).subscribe({ error: (caught: unknown) => (error = caught) });

      http.expectOne(INSERT_URL).flush(JSON.stringify({ status: 'FAILURE', message: 'Product is out of stock.' }));

      expect(error).toEqual(new Error('Product is out of stock.'));
    });

    it('reports a failure returned as plain text', () => {
      let error: unknown;
      service.addItem(CART_ITEM).subscribe({ error: (caught: unknown) => (error = caught) });

      http.expectOne(INSERT_URL).flush('Failed to add the item.');

      expect(error).toEqual(new Error('Failed to add the item.'));
    });
  });

  describe('addItem without a usable customer ID', () => {
    function expectNoInsert(): void {
      let error: unknown;
      service.addItem(CART_ITEM).subscribe({ error: (caught: unknown) => (error = caught) });

      expect(error).toEqual(new Error('Sign in as a customer to add items to your cart.'));
      http.expectNone(INSERT_URL);
    }

    it('sends nothing when signed out', () => {
      expectNoInsert();
    });

    it('sends nothing for a customer whose token has no CUSTOMER_ID, and never falls back to USER_ID', () => {
      signIn('CUSTOMER', { USER_ID: 3 });

      expect(auth.userId()).toBe(3);
      expect(auth.customerId()).toBeUndefined();
      expectNoInsert();
    });

    it('sends nothing for a customer whose CUSTOMER_ID claim is null', () => {
      signIn('CUSTOMER', { USER_ID: 3, CUSTOMER_ID: null });

      expectNoInsert();
    });

    it('sends nothing for a seller or an admin session', () => {
      signIn('SELLER', { USER_ID: 8, SELLER_ID: 5 });
      expectNoInsert();

      signIn('ADMIN', { USER_ID: 1, ADMIN_ID: 2 });
      expectNoInsert();
    });
  });
  // CHANGED (new): Remove sends PRODUCT_VARIANT_ID only for a row with a variant (a row without one sent NaN, which
  // failed before any request with "Cart, product, seller and customer IDs must be positive safe integers.").
  describe('removeItem (DELETE shopping_cart/delete)', () => {
    function loadRows(): CartItem[] {
      let items: CartItem[] = [];
      service.getCart(3).subscribe((result) => (items = result));
      http.expectOne((request) => request.url.endsWith('/shopping_cart/get')).flush(CART_RESPONSE);
      return items;
    }

    it('deletes a row without a variant with its four IDs and no PRODUCT_VARIANT_ID', () => {
      const [headSet] = loadRows();
      let removed = false;
      service.removeItem(headSet).subscribe({ complete: () => (removed = true) });

      const request = http.expectOne('/api/shopping_cart/delete');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({ CART_ID: 70, PRODUCT_ID: 12, SELLER_ID: 8, CUSTOMER_ID: 3 });
      request.flush('Cart item deleted successfully');
      expect(removed).toBe(true);
    });

    it('sends the PRODUCT_VARIANT_ID of a row with a variant', () => {
      const [, mug] = loadRows();
      service.removeItem(mug).subscribe();

      const request = http.expectOne('/api/shopping_cart/delete');
      expect(request.request.body).toEqual({ CART_ID: 71, PRODUCT_ID: 13, SELLER_ID: 9, CUSTOMER_ID: 3, PRODUCT_VARIANT_ID: 21 });
      request.flush('Cart item deleted successfully');
    });
  });
  // CHANGED: the wishlist tests (move_to_cart/get, move_to_cart/update, wishlist/save_for_later) moved to
  // wishlist.service.spec.ts with the new wishlist APIs.
});
