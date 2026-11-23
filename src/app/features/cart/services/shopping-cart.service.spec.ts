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

  // CHANGED (new): move_to_cart/get, and the Move to Cart / Remove requests for a saved row.
  describe('wishlist (saved-for-later rows)', () => {
    /** A saved row with PRODUCT_NAME and a variant (the earlier wishlist/get sample). */
    const WISHLIST_ROW = {
      CART_ID: 45, PRODUCT_ID: 3, PRODUCT_VARIANT_ID: 9, SELLER_ID: 6, SKU: 'CRT0045', QUANTITY: 1,
      UNIT_PRICE: '999.00', DISCOUNT: '0.00', TAX: '0.00', TOTAL_AMOUNT: '999.00', CUSTOMER_ID: 1,
      SAVE_FOR_LATER: 1, CREATED_BY: 3, UPDATED_BY: 3,
      CREATED_AT: '2026-11-17T10:54:42.000Z', UPDATED_AT: '2026-11-19T04:30:58.000Z',
      PRODUCT_NAME: 'Dell Inspiron 15',
    };
    const wishlistResponse = (data: unknown[]) => ({
      status: true, message: 'Saved for Later items retrieved successfully', data,
    });

    beforeEach(() => signIn('CUSTOMER', { USER_ID: 3, CUSTOMER_ID: 1 }));

    // CHANGED (new): the sample move_to_cart/get response (two rows, PRODUCT_VARIANT_ID null, no PRODUCT_NAME).
    it('reads move_to_cart/get with CATEGORY_ID=-1 and PRODUCT_ID=-1, keeping every row and its null variant', () => {
      let page: unknown;
      service.getWishlist(10, 0).subscribe((result) => (page = result));

      const request = http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=0');
      expect(request.request.method).toBe('GET');
      request.flush({
        status: true,
        message: 'Save for Later products fetched successfully',
        data: [
          {
            CART_ID: 33, PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null, SELLER_ID: 1, SKU: 'CRT0033', QUANTITY: 5,
            UNIT_PRICE: '3000.00', DISCOUNT: '0.00', TAX: '0.00', TOTAL_AMOUNT: '15000.00', CUSTOMER_ID: 1,
            SAVE_FOR_LATER: 1, CREATED_BY: 3, UPDATED_BY: 3,
            CREATED_AT: '2026-11-13T10:04:56.000Z', UPDATED_AT: '2026-11-17T08:00:08.000Z',
          },
          {
            CART_ID: 30, PRODUCT_ID: 3, PRODUCT_VARIANT_ID: null, SELLER_ID: 1, SKU: 'CRT0030', QUANTITY: 1,
            UNIT_PRICE: '55000.00', DISCOUNT: '0.00', TAX: '0.00', TOTAL_AMOUNT: '55000.00', CUSTOMER_ID: 1,
            SAVE_FOR_LATER: 1, CREATED_BY: 3, UPDATED_BY: 3,
            CREATED_AT: '2026-11-13T06:10:33.000Z', UPDATED_AT: '2026-11-13T07:07:31.000Z',
          },
        ],
      });

      expect(page).toEqual({
        rows: [
          {
            cartId: '33', productId: 2, sellerId: 1, customerId: 1, sku: 'CRT0033', quantity: 5,
            unitPrice: 3000, discount: 0, tax: 0, totalAmount: 15000,
          },
          {
            cartId: '30', productId: 3, sellerId: 1, customerId: 1, sku: 'CRT0030', quantity: 1,
            unitPrice: 55000, discount: 0, tax: 0, totalAmount: 55000,
          },
        ],
        hasNext: false,
        total: 2,
      });
    });

    it('requests one page with LIMIT and OFFSET only, and maps each row', () => {
      let page: unknown;
      service.getWishlist(10, 0).subscribe((result) => (page = result));

      const request = http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=0');
      expect(request.request.method).toBe('GET');
      expect(request.request.params.has('CUSTOMER_ID')).toBe(false);
      request.flush(wishlistResponse([WISHLIST_ROW]));

      expect(page).toEqual({
        rows: [{
          cartId: '45', productId: 3, variantId: 9, sellerId: 6, customerId: 1, productName: 'Dell Inspiron 15',
          sku: 'CRT0045', quantity: 1, unitPrice: 999, discount: 0, tax: 0, totalAmount: 999,
        }],
        // Fewer rows than LIMIT: the last page, so the total is known.
        hasNext: false,
        total: 1,
      });
    });

    it('reports a next page when a page is full, and uses total_records when the API sends it', () => {
      const full = Array.from({ length: 2 }, (_, index) => ({ ...WISHLIST_ROW, CART_ID: 50 + index }));
      let page: { hasNext: boolean; total?: number } | undefined;
      service.getWishlist(2, 2).subscribe((result) => (page = result));
      http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=2&OFFSET=2').flush(wishlistResponse(full));
      expect(page).toMatchObject({ hasNext: true });
      expect(page?.total).toBeUndefined();

      service.getWishlist(2, 2).subscribe((result) => (page = result));
      http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=2&OFFSET=2').flush({ ...wishlistResponse(full), total_records: 4 });
      expect(page).toMatchObject({ hasNext: false, total: 4 });
    });

    it('returns no rows for an empty wishlist and leaves out rows no longer saved', () => {
      let rows: unknown[] = [{}];
      service.getWishlist(10, 0).subscribe((result) => (rows = result.rows));
      http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=0').flush(wishlistResponse([{ ...WISHLIST_ROW, SAVE_FOR_LATER: 0 }]));
      expect(rows).toEqual([]);

      service.getWishlist(10, 0).subscribe((result) => (rows = result.rows));
      http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=0').flush(wishlistResponse([]));
      expect(rows).toEqual([]);
    });

    it('rejects rows for another customer, invalid IDs and a failed response', () => {
      const errors: unknown[] = [];
      for (const data of [[{ ...WISHLIST_ROW, CUSTOMER_ID: 3 }], [{ ...WISHLIST_ROW, SELLER_ID: null }]]) {
        service.getWishlist(10, 0).subscribe({ error: (caught: unknown) => errors.push(caught) });
        http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=0').flush(wishlistResponse(data));
      }
      service.getWishlist(10, 0).subscribe({ error: (caught: unknown) => errors.push(caught) });
      http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=0').flush({ status: false, message: 'Token expired' });

      expect(errors).toEqual([
        new Error('The wishlist API returned an item for a different customer.'),
        new Error('The wishlist API returned an invalid seller ID.'),
        new Error('Token expired'),
      ]);
    });

    it('keeps a row saved without a variant (PRODUCT_VARIANT_ID null or 0) and leaves its variant out', () => {
      let rows: { cartId: string; variantId?: number }[] = [];
      service.getWishlist(10, 0).subscribe((result) => (rows = result.rows));
      http.expectOne('/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=0').flush(wishlistResponse([
        { ...WISHLIST_ROW, PRODUCT_VARIANT_ID: null },
        { ...WISHLIST_ROW, CART_ID: 46, PRODUCT_VARIANT_ID: 0 },
        { ...WISHLIST_ROW, CART_ID: 47 },
      ]));

      expect(rows.map((row) => row.cartId)).toEqual(['45', '46', '47']);
      expect(rows.map((row) => row.variantId)).toEqual([undefined, undefined, 9]);
      expect('variantId' in rows[0]).toBe(false);
    });

    it('sends nothing without a customer session', () => {
      auth.clearSession();
      let error: unknown;
      service.getWishlist(10, 0).subscribe({ error: (caught: unknown) => (error = caught) });

      expect(error).toEqual(new Error('Sign in as a customer to see your wishlist.'));
      http.expectNone((request) => request.url.endsWith('/move_to_cart/get'));
    });

    // CHANGED: Save for later sends VARIANT_ID with the CART_ID (null for a row without a variant).
    it('saves with PUT wishlist/save_for_later { CART_ID, VARIANT_ID } and rejects invalid IDs without a request', () => {
      service.saveForLater('59', '28').subscribe();
      const save = http.expectOne('/api/wishlist/save_for_later');
      expect(save.request.method).toBe('PUT');
      expect(save.request.body).toEqual({ CART_ID: 59, VARIANT_ID: 28 });
      save.flush('Saved for later');

      service.saveForLater('30', null).subscribe();
      http.expectOne('/api/wishlist/save_for_later').flush('Saved for later');

      // CHANGED (new): a product with no cart row (wishlist heart): CART_ID null.
      service.saveForLater(null, 23).subscribe();
      const withoutRow = http.expectOne('/api/wishlist/save_for_later');
      expect(withoutRow.request.method).toBe('PUT');
      expect(withoutRow.request.body).toEqual({ CART_ID: null, VARIANT_ID: 23 });
      withoutRow.flush('Saved for later');

      let error: unknown;
      service.saveForLater('0', 28).subscribe({ error: (caught: unknown) => (error = caught) });
      expect(error).toBeInstanceOf(RangeError);
      service.saveForLater('59', 'abc').subscribe({ error: (caught: unknown) => (error = caught) });
      expect(error).toBeInstanceOf(RangeError);
      http.expectNone('/api/wishlist/save_for_later');
    });


    // CHANGED (new): Move to Cart.
    it('moves a saved row to the cart with PUT move_to_cart/update and its CART_ID only', () => {
      let moved = false;
      service.moveToCart('5').subscribe({ complete: () => (moved = true) });
      const move = http.expectOne('/api/move_to_cart/update');
      expect(move.request.method).toBe('PUT');
      expect(move.request.body).toEqual({ CART_ID: 5 });
      move.flush(JSON.stringify({ status: true, message: 'Moved to cart' }));
      expect(moved).toBe(true);

      let error: unknown;
      service.moveToCart('5').subscribe({ error: (caught: unknown) => (error = caught) });
      http.expectOne('/api/move_to_cart/update').flush(JSON.stringify({ status: false }));
      expect(error).toEqual(new Error('The item could not be moved to your cart.'));

      service.moveToCart('0').subscribe({ error: (caught: unknown) => (error = caught) });
      expect(error).toBeInstanceOf(RangeError);
      http.expectNone('/api/move_to_cart/update');
    });

    it('removes a saved row with DELETE shopping_cart/delete and the row\'s own IDs', () => {
      let removed = false;
      service.removeSavedItem({
        cartId: '45', productId: 3, variantId: 9, sellerId: 6, customerId: 1, quantity: 1,
        unitPrice: 999, discount: 0, tax: 0, totalAmount: 999,
      }).subscribe({ complete: () => (removed = true) });

      const request = http.expectOne('/api/shopping_cart/delete');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({
        CART_ID: 45, PRODUCT_ID: 3, SELLER_ID: 6, CUSTOMER_ID: 1, PRODUCT_VARIANT_ID: 9,
      });
      request.flush('Cart item deleted successfully');
      expect(removed).toBe(true);
    });

    it('removes a saved row without a variant using the other four IDs only', () => {
      service.removeSavedItem({
        cartId: '45', productId: 3, sellerId: 6, customerId: 1, quantity: 1,
        unitPrice: 999, discount: 0, tax: 0, totalAmount: 999,
      }).subscribe();

      const request = http.expectOne('/api/shopping_cart/delete');
      expect(request.request.body).toEqual({ CART_ID: 45, PRODUCT_ID: 3, SELLER_ID: 6, CUSTOMER_ID: 1 });
      request.flush('Cart item deleted successfully');
    });
  });
});