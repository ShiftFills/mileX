// CHANGED: the wishlist hearts use POST wishlist/manage { PRODUCT_ID, PRODUCT_VARIANT_ID, ACTION } and GET wishlist/get
// (they used to save cart rows with PUT wishlist/save_for_later and remove them with DELETE shopping_cart/delete).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { Product, WishlistPage } from '@shared/models';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { WishlistService } from './wishlist.service';

const USER_ID = 3;
const CUSTOMER_ID = 1;
const MANAGE_URL = '/api/wishlist/manage';
const syncUrl = (offset = 0): string => `/api/wishlist/get?LIMIT=100&OFFSET=${offset}`;

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

/** A product card's product: "tissuee", with variants 28 (in stock) and 29, as products/get sends it. */
const TISSUE: Product = {
  id: '18', name: 'tissuee', description: '', price: 70, currency: 'INR', imageUrl: '', category: 'category-1',
  inStock: true, sellerId: 52,
  variantOptions: [{ id: '29', price: 70, inStock: false }, { id: '28', price: 70, inStock: true }],
};

/** A wishlist/get row: the sample response's Ear Buds (product 19, variant 31). */
function wishlistRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    WISHLIST_ID: 3, CUSTOMER_ID, PRODUCT_ID: 19, PRODUCT_VARIANT_ID: 31, CREATED_AT: '2026-11-19T10:31:27.000Z',
    PRODUCT_NAME: 'Ear Buds', PRODUCT_CODE_SKU: 'SKU0019', CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, BRAND_ID: 4,
    PRODUCT_IMAGE: 'uploads/products/Screenshot 2026-10-21 154159.png', PRODUCT_VIDEO: null, PRODUCT_DIMENSION: 1,
    PRODUCT_DESCRIPTION: 'Wireless Ear Buds', HSN_CODE: '847234', TAX_RATE: '18.00', SELLING_PRICE: '3000.00',
    PRICE: '4000.00', DISCOUNT: '0.00', STOCK_QUANTITY: 67, MINIMUM_ORDER_QUANTITY: 1, MAXIMUM_ORDER_QUANTITY: 4,
    WEIGHT: '12.00', LENGTH: '34.00', WIDTH: '22.00', HEIGHT: '1.00', SELLER_ID: 55, IS_ACTIVE: 'ACTIVE',
    CREATED_BY: 79, UPDATED_BY: null, UPDATED_AT: '2026-11-19T10:31:27.000Z', MATCHED_VARIANT_ID: 31,
    ...overrides,
  };
}

const wishlistResponse = (data: unknown[]) => ({ status: true, message: 'WISHLIST DETAILS FETCHED SUCCESSFULLY', data });

/** The documented POST wishlist/manage success response. */
const managed = (productId: number, variantId: number, action: 'ADD' | 'REMOVE') => ({
  status: true,
  message: action === 'ADD' ? 'ADDED TO WISHLIST' : 'REMOVED FROM WISHLIST',
  data: { CUSTOMER_ID, PRODUCT_ID: productId, PRODUCT_VARIANT_ID: variantId },
});

describe('WishlistService', () => {
  let wishlist: WishlistService;
  let toast: ToastService;
  let http: HttpTestingController;

  function signInCustomer(): void {
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
      tokenWithClaims({ USER_ID, CUSTOMER_ID }),
    );
  }

  /** Signs a customer in and reads their whole wishlist once (wishlist/get) with these rows. */
  function syncWishlist(rows: Record<string, unknown>[]): void {
    signInCustomer();
    wishlist.sync();
    http.expectOne(syncUrl()).flush(wishlistResponse(rows));
  }

  /** Taps the heart and returns the POST wishlist/manage request. */
  function tap(product: Product, variantId?: string): ReturnType<HttpTestingController['expectOne']> {
    wishlist.toggleProduct(product, variantId);
    const request = http.expectOne(MANAGE_URL);
    expect(request.request.method).toBe('POST');
    return request;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    wishlist = TestBed.inject(WishlistService);
    toast = TestBed.inject(ToastService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    toast.dismiss();
    http.verify();
    localStorage.clear();
  });

  it('sends a signed-out visitor to Login instead of saving on the device', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    wishlist.sync();
    wishlist.toggleProduct(TISSUE);

    expect(navigate).toHaveBeenCalledWith([APP_ROUTES.login], { queryParams: { returnUrl: '/' } });
    expect(wishlist.has(TISSUE)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.wishlist)).toBeNull();
    http.expectNone(() => true);
  });

  it('tells a seller that only customers can save items, without any request', () => {
    TestBed.inject(AuthService).setSession(
      { id: '8', email: '', firstName: 'seller', lastName: '', userType: 'SELLER' },
      tokenWithClaims({ USER_ID: 8, SELLER_ID: 5 }),
    );
    wishlist.sync();
    wishlist.toggleProduct(TISSUE);

    expect(toast.current()).toEqual({ type: 'error', message: 'Only customer accounts can save items to the wishlist.' });
    http.expectNone(() => true);
  });

  it('reads the wishlist once and fills the heart of each saved product variant only', () => {
    syncWishlist([wishlistRow({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 28, PRODUCT_NAME: 'tissuee' })]);
    wishlist.sync();
    http.expectNone((request) => request.url.endsWith('/wishlist/get'));

    // The card's default variant (28, the first in stock) is saved.
    expect(wishlist.has(TISSUE)).toBe(true);
    expect(wishlist.has(TISSUE, '28')).toBe(true);
    // Another variant of the same product is a different wishlist item.
    expect(wishlist.has(TISSUE, '29')).toBe(false);
    expect(wishlist.has({ ...TISSUE, id: '19' })).toBe(false);
  });

  it('reads every page of a long wishlist (LIMIT 100 and OFFSET) for the hearts', () => {
    signInCustomer();
    wishlist.sync();
    const full = Array.from({ length: 100 }, (_, index) => wishlistRow({ PRODUCT_ID: 100 + index, PRODUCT_VARIANT_ID: 1 }));
    http.expectOne(syncUrl(0)).flush(wishlistResponse(full));
    http.expectOne(syncUrl(100)).flush(wishlistResponse([wishlistRow({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 28 })]));

    expect(wishlist.has({ ...TISSUE, id: '100', variantOptions: [], variantId: 1 })).toBe(true);
    expect(wishlist.has(TISSUE)).toBe(true);
  });

  it('reads the wishlist again on the next screen when the first read failed', () => {
    signInCustomer();
    wishlist.sync();
    http.expectOne(syncUrl()).flush({ message: 'Server error' }, { status: 500, statusText: 'Server Error' });
    wishlist.sync();
    http.expectOne(syncUrl()).flush(wishlistResponse([]));
  });

  it('adds with POST { PRODUCT_ID, PRODUCT_VARIANT_ID, ACTION: "ADD" }, once however often it is tapped', () => {
    syncWishlist([]);

    const add = tap(TISSUE);
    expect(add.request.body).toEqual({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 28, ACTION: 'ADD' });
    expect(wishlist.isPending('18')).toBe(true);
    // A second tap while the request is in flight sends nothing.
    wishlist.toggleProduct(TISSUE);
    http.expectNone(MANAGE_URL);
    // The heart stays empty until the API succeeded.
    expect(wishlist.has(TISSUE)).toBe(false);
    add.flush(managed(18, 28, 'ADD'));

    expect(wishlist.has(TISSUE)).toBe(true);
    expect(wishlist.isPending('18')).toBe(false);
    expect(toast.current()).toEqual({ type: 'success', message: 'tissuee was added to your wishlist.' });
  });

  it('removes with ACTION "REMOVE" when the filled heart is tapped', () => {
    syncWishlist([wishlistRow({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 28 })]);

    const remove = tap(TISSUE);
    expect(remove.request.body).toEqual({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 28, ACTION: 'REMOVE' });
    remove.flush(managed(18, 28, 'REMOVE'));

    expect(wishlist.has(TISSUE)).toBe(false);
    expect(toast.current()).toEqual({ type: 'success', message: 'tissuee was removed from your wishlist.' });
  });

  it('adds the variant selected on the Product View, independently of the product\'s other variants', () => {
    syncWishlist([wishlistRow({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 28 })]);

    // Variant 29 is not saved (28 is): ADD for 29.
    const add = tap(TISSUE, '29');
    expect(add.request.body).toEqual({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 29, ACTION: 'ADD' });
    add.flush(managed(18, 29, 'ADD'));
    expect(wishlist.has(TISSUE, '29')).toBe(true);
    expect(wishlist.has(TISSUE, '28')).toBe(true);

    // Removing 29 leaves 28 saved.
    tap(TISSUE, '29').flush(managed(18, 29, 'REMOVE'));
    expect(wishlist.has(TISSUE, '29')).toBe(false);
    expect(wishlist.has(TISSUE)).toBe(true);
  });

  it('sends the VARIANT_ID of the product\'s own products/get row when it has no VARIANTS list', () => {
    syncWishlist([]);
    const mouse: Product = { ...TISSUE, id: '5', name: 'Wireless Mouse', variantOptions: undefined, variantId: 16 };

    const add = tap(mouse);
    expect(add.request.body).toEqual({ PRODUCT_ID: 5, PRODUCT_VARIANT_ID: 16, ACTION: 'ADD' });
    add.flush(managed(5, 16, 'ADD'));
    expect(wishlist.has(mouse)).toBe(true);
  });

  it('says why a product without any variant cannot be saved, without a request', () => {
    syncWishlist([]);
    const plain: Product = { ...TISSUE, id: '7', name: 'Plain Mug', variantOptions: [], variantId: undefined };

    wishlist.toggleProduct(plain);
    http.expectNone(MANAGE_URL);
    expect(toast.current()).toEqual({
      type: 'error', message: 'Plain Mug cannot be saved to your wishlist right now. Variant details are missing.',
    });
  });

  it('fills, and removes, a saved variant of a product card that names no variant of its own', () => {
    syncWishlist([wishlistRow({ PRODUCT_ID: 7, PRODUCT_VARIANT_ID: 40 })]);
    const plain: Product = { ...TISSUE, id: '7', name: 'Plain Mug', variantOptions: [], variantId: undefined };

    expect(wishlist.has(plain)).toBe(true);
    const remove = tap(plain);
    expect(remove.request.body).toEqual({ PRODUCT_ID: 7, PRODUCT_VARIANT_ID: 40, ACTION: 'REMOVE' });
    remove.flush(managed(7, 40, 'REMOVE'));
    expect(wishlist.has(plain)).toBe(false);
  });

  it('keeps the heart as it was and shows the API error when the request fails', () => {
    syncWishlist([]);

    tap(TISSUE).flush({ message: 'Could not add the item' }, { status: 500, statusText: 'Server Error' });
    expect(wishlist.has(TISSUE)).toBe(false);
    expect(wishlist.isPending('18')).toBe(false);
    expect(toast.current()).toEqual({ type: 'error', message: 'Could not add the item' });

    // A 2xx response that reports failure is an error too.
    tap(TISSUE).flush({ status: false, message: 'PRODUCT VARIANT NOT FOUND' });
    expect(wishlist.has(TISSUE)).toBe(false);
    expect(toast.current()).toEqual({ type: 'error', message: 'PRODUCT VARIANT NOT FOUND' });

    // A success for another product or variant does not fill this heart.
    tap(TISSUE).flush(managed(18, 29, 'ADD'));
    expect(wishlist.has(TISSUE)).toBe(false);
    expect(toast.current()).toEqual({ type: 'error', message: 'The wishlist API returned a different product.' });
  });

  // CHANGED (new): the backend's auth text ("Access token is required") is never shown.
  it('sends a customer whose session ended to Login and back, and otherwise shows a plain message, on a 401', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/products/18');
    const unauthorized = { status: 401, statusText: 'Unauthorized' };
    syncWishlist([]);

    // Still signed in (the token could not be renewed for now): a plain message.
    tap(TISSUE).flush({ status: 'FAILED', message: 'Access token is required' }, unauthorized);
    expect(toast.current()).toEqual({
      type: 'error',
      message: `${TISSUE.name} could not be saved to your wishlist. Please try again.`,
    });
    expect(navigate).not.toHaveBeenCalled();

    // The error interceptor ended the session: Login, then back to the product.
    toast.dismiss();
    wishlist.toggleProduct(TISSUE);
    const request = http.expectOne(MANAGE_URL);
    TestBed.inject(AuthService).clearSession();
    request.flush({ status: 'FAILED', message: 'Access token is required' }, unauthorized);
    expect(navigate).toHaveBeenCalledWith([APP_ROUTES.login], { queryParams: { returnUrl: '/products/18' } });
    expect(toast.current()).toBeNull();
    expect(wishlist.has(TISSUE)).toBe(false);
  });

  it('never shows another customer\'s saved items', () => {
    syncWishlist([wishlistRow({ PRODUCT_ID: 18, PRODUCT_VARIANT_ID: 28 })]);
    expect(wishlist.has(TISSUE)).toBe(true);

    TestBed.inject(AuthService).setSession(
      { id: '9', email: '', firstName: 'asha', lastName: '', userType: 'CUSTOMER' },
      tokenWithClaims({ USER_ID: 9, CUSTOMER_ID: 2 }),
    );
    expect(wishlist.has(TISSUE)).toBe(false);
    wishlist.sync();
    http.expectOne(syncUrl()).flush(wishlistResponse([]));
    expect(wishlist.has(TISSUE)).toBe(false);
  });

  describe('loadPage (GET wishlist/get)', () => {
    beforeEach(() => signInCustomer());

    it('requests one page with LIMIT and OFFSET only, and maps the sample row', () => {
      let page: WishlistPage | undefined;
      wishlist.loadPage(10, 0).subscribe((result) => (page = result));

      const request = http.expectOne('/api/wishlist/get?LIMIT=10&OFFSET=0');
      expect(request.request.method).toBe('GET');
      request.flush(wishlistResponse([wishlistRow()]));

      expect(page?.hasNext).toBe(false);
      expect(page?.total).toBe(1);
      expect(page?.items).toHaveLength(1);
      expect(page?.items[0]).toMatchObject({ wishlistId: '3', productId: 19, variantId: 31 });
      // The product, mapped like a products/get row: SELLING_PRICE, struck PRICE with its "% OFF", SKU, image path.
      expect(page?.items[0].product).toMatchObject({
        id: '19', name: 'Ear Buds', sku: 'SKU0019', price: 3000, originalPrice: 4000, discountLabel: '25% OFF',
        inStock: true, stockLeft: 67, maxOrderQuantity: 4, sellerId: 55, variantId: 31, brand: 'brand-4',
        imagePath: 'uploads/products/Screenshot 2026-10-21 154159.png',
      });
      // Its items fill their hearts.
      expect(wishlist.has({ id: '19' }, 31)).toBe(true);
    });

    it('reports a next page when a page is full, and uses total_records when the API sends it', () => {
      const full = [wishlistRow(), wishlistRow({ PRODUCT_VARIANT_ID: 32 })];
      let page: WishlistPage | undefined;
      wishlist.loadPage(2, 2).subscribe((result) => (page = result));
      http.expectOne('/api/wishlist/get?LIMIT=2&OFFSET=2').flush(wishlistResponse(full));
      expect(page).toMatchObject({ hasNext: true });
      expect(page?.total).toBeUndefined();

      wishlist.loadPage(2, 2).subscribe((result) => (page = result));
      http.expectOne('/api/wishlist/get?LIMIT=2&OFFSET=2').flush({ ...wishlistResponse(full), total_records: 4 });
      expect(page).toMatchObject({ hasNext: false, total: 4 });
    });

    it('returns no items for an empty wishlist (data [] or null)', () => {
      const pages: WishlistPage[] = [];
      for (const data of [[], null]) {
        wishlist.loadPage(10, 0).subscribe((result) => pages.push(result));
        http.expectOne('/api/wishlist/get?LIMIT=10&OFFSET=0').flush({ status: true, message: 'NO DATA', data });
      }
      expect(pages.map((page) => page.items)).toEqual([[], []]);
    });

    it('uses MATCHED_VARIANT_ID when PRODUCT_VARIANT_ID is empty', () => {
      let page: WishlistPage | undefined;
      wishlist.loadPage(10, 0).subscribe((result) => (page = result));
      http.expectOne('/api/wishlist/get?LIMIT=10&OFFSET=0').flush(
        wishlistResponse([wishlistRow({ PRODUCT_VARIANT_ID: null, MATCHED_VARIANT_ID: 33 })]),
      );
      expect(page?.items[0].variantId).toBe(33);
    });

    it('rejects rows for another customer, rows without a product or variant ID, and a failed response', () => {
      const errors: unknown[] = [];
      for (const data of [
        [wishlistRow({ CUSTOMER_ID: 3 })],
        [wishlistRow({ PRODUCT_VARIANT_ID: null, MATCHED_VARIANT_ID: null })],
        [wishlistRow({ PRODUCT_NAME: '' })],
      ]) {
        wishlist.loadPage(10, 0).subscribe({ error: (caught: unknown) => errors.push(caught) });
        http.expectOne('/api/wishlist/get?LIMIT=10&OFFSET=0').flush(wishlistResponse(data));
      }
      wishlist.loadPage(10, 0).subscribe({ error: (caught: unknown) => errors.push(caught) });
      http.expectOne('/api/wishlist/get?LIMIT=10&OFFSET=0').flush({ status: false, message: 'Token expired' });

      expect(errors).toEqual([
        new Error('The wishlist API returned an item for a different customer.'),
        new Error('The wishlist API returned an item without a valid product or variant ID.'),
        new Error('The wishlist API returned an item without a product name or price.'),
        new Error('Token expired'),
      ]);
    });

    it('sends nothing without a customer session or with invalid paging', () => {
      let error: unknown;
      wishlist.loadPage(0, 0).subscribe({ error: (caught: unknown) => (error = caught) });
      expect(error).toBeInstanceOf(RangeError);

      TestBed.inject(AuthService).clearSession();
      wishlist.loadPage(10, 0).subscribe({ error: (caught: unknown) => (error = caught) });
      expect(error).toEqual(new Error('Sign in as a customer to see your wishlist.'));
      http.expectNone((request) => request.url.endsWith('/wishlist/get'));
    });
  });

  describe('manage (POST wishlist/manage)', () => {
    beforeEach(() => signInCustomer());

    it('sends the documented body for ADD and REMOVE', () => {
      wishlist.manage(19, '31', 'ADD').subscribe();
      const add = http.expectOne(MANAGE_URL);
      expect(add.request.body).toEqual({ PRODUCT_ID: 19, PRODUCT_VARIANT_ID: 31, ACTION: 'ADD' });
      add.flush(managed(19, 31, 'ADD'));
      expect(wishlist.has({ id: '19' }, 31)).toBe(true);

      wishlist.manage('19', 31, 'REMOVE').subscribe();
      const remove = http.expectOne(MANAGE_URL);
      expect(remove.request.body).toEqual({ PRODUCT_ID: 19, PRODUCT_VARIANT_ID: 31, ACTION: 'REMOVE' });
      remove.flush(managed(19, 31, 'REMOVE'));
      expect(wishlist.has({ id: '19' }, 31)).toBe(false);
    });

    it('rejects invalid IDs without a request', () => {
      const errors: unknown[] = [];
      wishlist.manage(0, 31, 'ADD').subscribe({ error: (caught: unknown) => errors.push(caught) });
      wishlist.manage(19, 'abc', 'ADD').subscribe({ error: (caught: unknown) => errors.push(caught) });
      expect(errors.every((error) => error instanceof RangeError)).toBe(true);
      expect(errors).toHaveLength(2);
      http.expectNone(MANAGE_URL);
    });
  });
});
