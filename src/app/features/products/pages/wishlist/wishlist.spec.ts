// CHANGED: the Wishlist page with the wishlist APIs (GET wishlist/get, POST wishlist/manage) for a signed-in customer
// (it used move_to_cart/get, move_to_cart/update and shopping_cart/delete), and the device wishlist (guest).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ToastService } from '@core/services/toast.service';
import { WishlistService } from '@core/services/wishlist.service';
import { Wishlist } from './wishlist';

const USER_ID = 3;
const CUSTOMER_ID = 1;
const WISHLIST_URL = (offset = 0): string => `/api/wishlist/get?LIMIT=10&OFFSET=${offset}`;
const MANAGE_URL = '/api/wishlist/manage';
const INSERT_URL = '/api/shopping_cart/insert';
const CART_URL = `/api/shopping_cart/get?CUSTOMER_ID=${CUSTOMER_ID}`;
const variantUrl = (id: number): string => `/api/product_variant/get?PRODUCT_ID=${id}&VARIANT_ID=-1&LIMIT=10&OFFSET=0`;
const BRANDS_URL = '/api/brand_management/get?BRAND_ID=-1';

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

/**
 * A wishlist/get row, shaped like the sample response: by default the Leather Wallet (product 3) saved as variant 9,
 * with the product's SELLING_PRICE / PRICE (MRP), stock, seller and S3 image.
 */
function wishlistRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    WISHLIST_ID: 3, CUSTOMER_ID, PRODUCT_ID: 3, PRODUCT_VARIANT_ID: 9, CREATED_AT: '2026-11-19T10:31:27.000Z',
    PRODUCT_NAME: 'Leather Wallet', PRODUCT_CODE_SKU: 'SKU0003', CATEGORY_ID: 1, SUB_CATEGORY_ID: 2, BRAND_ID: 2,
    PRODUCT_IMAGE: 'products/wallet.png', PRODUCT_DESCRIPTION: 'Leather wallet', TAX_RATE: '18.00',
    SELLING_PRICE: '899.00', PRICE: '1299.00', DISCOUNT: '0.00', STOCK_QUANTITY: 20, MINIMUM_ORDER_QUANTITY: 1,
    MAXIMUM_ORDER_QUANTITY: 4, SELLER_ID: 6, IS_ACTIVE: 'ACTIVE', MATCHED_VARIANT_ID: 9,
    ...overrides,
  };
}

/** The saved Travel Mug (product 4, variant 12): out of stock, and without variant details in product_variant/get. */
const MUG_ROW = {
  WISHLIST_ID: 4, PRODUCT_ID: 4, PRODUCT_VARIANT_ID: 12, MATCHED_VARIANT_ID: 12, PRODUCT_NAME: 'Travel Mug',
  PRODUCT_CODE_SKU: 'SKU0004', BRAND_ID: 3, CATEGORY_ID: 2, PRODUCT_IMAGE: null, SELLING_PRICE: '450.00',
  PRICE: '500.00', STOCK_QUANTITY: 0, SELLER_ID: 7,
};

const wishlistResponse = (data: unknown[]) => ({ status: true, message: 'WISHLIST DETAILS FETCHED SUCCESSFULLY', data });
const managed = (productId: number, variantId: number, action: 'ADD' | 'REMOVE') => ({
  status: true,
  message: action === 'ADD' ? 'ADDED TO WISHLIST' : 'REMOVED FROM WISHLIST',
  data: { CUSTOMER_ID, PRODUCT_ID: productId, PRODUCT_VARIANT_ID: variantId },
});

/** The price row of a card, its parts (selling price, struck MRP, "% OFF") joined by spaces. */
const priceRow = (card: HTMLElement): string =>
  Array.from(card.querySelectorAll('.product-card__price > *'), (part) => (part.textContent ?? '').trim()).join(' ');

/** product_variant/get rows of product 3: the saved variant 9 (with its own image) and variant 10 (out of stock). */
const PRODUCT_3_VARIANTS = [
  {
    VARIANT_ID: 9, VARIANT_NAME: 'Classic', PRODUCT_ID: 3, SELLER_ID: 6, PRICE: '949.00', STOCK_QUANTITY: 5,
    COLOUR_NAME: 'Brown', SIZE_NAME: 'M', MATERIAL_NAME: null, VARIANT_IMAGE: 'variants/brown.png', STATUS: 'ACTIVE',
  },
  {
    VARIANT_ID: 10, VARIANT_NAME: 'Slim', PRODUCT_ID: 3, SELLER_ID: 6, PRICE: '899.00', STOCK_QUANTITY: 0,
    COLOUR_NAME: 'Black', SIZE_NAME: null, MATERIAL_NAME: null, VARIANT_IMAGE: null, STATUS: 'ACTIVE',
  },
];

describe('Wishlist', () => {
  let fixture: ComponentFixture<Wishlist>;
  let http: HttpTestingController;
  let toast: ToastService;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined = root()): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const cards = (): HTMLElement[] => Array.from(root().querySelectorAll('app-product-card'));
  const moveButton = (card: HTMLElement): HTMLButtonElement => card.querySelector('.product-card__add button')!;
  const removeButton = (card: HTMLElement): HTMLButtonElement => card.querySelector('.product-card__wishlist button')!;
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const ignoreImages = (): void => {
    http.match((request) => request.url.includes('/s3/images/'));
  };

  function signInCustomer(): void {
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
      tokenWithClaims({ USER_ID, CUSTOMER_ID }),
    );
  }

  /** Answers what a page asks besides wishlist/get: the brand names and product_variant/get per new product. */
  function flushDetails(ids: number[], { brands = true } = {}): void {
    if (brands) {
      http.expectOne(BRANDS_URL).flush({
        status: 'SUCCESS',
        data: [{ BRAND_ID: 2, BRAND_NAME: 'Hidesign' }, { BRAND_ID: 3, BRAND_NAME: 'Milton' }, { BRAND_ID: 4, BRAND_NAME: 'boAt' }],
      });
    }
    for (const id of ids) {
      http.expectOne(variantUrl(id)).flush({ status: 'SUCCESS', data: id === 3 ? PRODUCT_3_VARIANTS : [] });
    }
  }

  /** Opens the page as a customer and answers the catalog (device wishlist) and the first wishlist/get page. */
  async function openAsCustomer(rows: unknown[]): Promise<void> {
    signInCustomer();
    fixture = TestBed.createComponent(Wishlist);
    fixture.detectChanges();
    http.expectOne('/api/products/get?STATUS=ACTIVE').flush({ status: 'SUCCESS', data: [] });
    http.expectOne(WISHLIST_URL()).flush(wishlistResponse(rows));
    await settle();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Wishlist],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    toast.dismiss();
    http.verify();
    localStorage.clear();
  });

  it('shows each item with the row\'s name, SKU and prices, its brand and its saved variant', async () => {
    await openAsCustomer([wishlistRow(), wishlistRow(MUG_ROW)]);
    expect(root().querySelector('[role="status"]')?.textContent).toContain('Loading your wishlist');
    flushDetails([3, 4]);
    await settle();

    const [wallet, mug] = cards();
    expect(cards()).toHaveLength(2);
    expect(text(wallet.querySelector('h2'))).toBe('Leather Wallet');
    expect(text(wallet)).toContain('Brand: Hidesign');
    expect(text(wallet)).toContain('Classic · Brown / M');
    expect(text(wallet)).toContain('SKU: SKU0003');
    // SELLING_PRICE, struck PRICE (MRP), then round((1299 − 899) ÷ 1299 × 100) = 31% OFF.
    expect(priceRow(wallet)).toBe('₹899 ₹1,299 31% OFF');
    expect(wallet.querySelector('.product-card--unavailable')).toBeNull();
    expect(moveButton(wallet).textContent).toContain('Move to Cart');
    expect(moveButton(wallet).disabled).toBe(false);
    expect(wallet.querySelector('a')?.getAttribute('href')).toBe('/products/3');

    // STOCK_QUANTITY 0 and no variant details: out of stock, from the row alone.
    expect(text(mug.querySelector('h2'))).toBe('Travel Mug');
    expect(text(mug)).toContain('Brand: Milton');
    expect(text(mug)).toContain('SKU: SKU0004');
    expect(text(mug)).toContain('Out of stock');
    expect(priceRow(mug)).toBe('₹450 ₹500 10% OFF');
    expect(moveButton(mug).disabled).toBe(true);

    // The saved variant's own S3 image is shown instead of the product's.
    http.expectNone((request) => request.url.endsWith('/s3/images/products/wallet.png'));
    http.expectOne((request) => request.url.endsWith('/s3/images/variants/brown.png')).flush({
      success: true, imageKey: 'variants/brown.png', imageUrl: 'https://bucket.s3.amazonaws.com/variants/brown.png?sig=1', expiresIn: 3600,
    });
    await settle();
    expect(wallet.querySelector('img')?.getAttribute('src')).toBe('https://bucket.s3.amazonaws.com/variants/brown.png?sig=1');
  });

  it('shows the sample wishlist/get row with its name, SKU, legacy image and listing offer', async () => {
    await openAsCustomer([
      wishlistRow({
        PRODUCT_ID: 19, PRODUCT_VARIANT_ID: 31, MATCHED_VARIANT_ID: 31, PRODUCT_NAME: 'Ear Buds', PRODUCT_CODE_SKU: 'SKU0019',
        BRAND_ID: 4, PRODUCT_IMAGE: 'uploads/products/earbuds.png', SELLING_PRICE: '3000.00', PRICE: '4000.00',
        STOCK_QUANTITY: 67, SELLER_ID: 55,
      }),
    ]);
    flushDetails([19]);
    await settle();
    const [earBuds] = cards();

    expect(text(earBuds.querySelector('h2'))).toBe('Ear Buds');
    expect(text(earBuds)).toContain('Brand: boAt');
    expect(text(earBuds)).toContain('SKU: SKU0019');
    // round((4000 − 3000) ÷ 4000 × 100) = 25% OFF.
    expect(priceRow(earBuds)).toBe('₹3,000 ₹4,000 25% OFF');
    expect(earBuds.querySelector('img')?.getAttribute('src')).toBe('/uploads/products/earbuds.png');
    expect(moveButton(earBuds).disabled).toBe(false);
  });

  it('shows two saved variants of one product as two items, with one product_variant/get request', async () => {
    await openAsCustomer([wishlistRow(), wishlistRow({ WISHLIST_ID: 5, PRODUCT_VARIANT_ID: 10, MATCHED_VARIANT_ID: 10 })]);
    flushDetails([3]);
    await settle();
    ignoreImages();

    const [classic, slim] = cards();
    expect(cards()).toHaveLength(2);
    expect(text(classic)).toContain('Classic · Brown / M');
    expect(text(slim)).toContain('Slim · Black');
    // Variant 10 has no stock: out of stock, although the product has.
    expect(text(slim)).toContain('Out of stock');
    expect(moveButton(slim).disabled).toBe(true);
    expect(moveButton(classic).disabled).toBe(false);
  });

  it('shows an inactive product, or an inactive variant, as no longer available', async () => {
    await openAsCustomer([wishlistRow({ IS_ACTIVE: 'INACTIVE' }), wishlistRow({ PRODUCT_ID: 4, PRODUCT_VARIANT_ID: 12 })]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(variantUrl(4)).flush({
      status: 'SUCCESS',
      data: [{ ...PRODUCT_3_VARIANTS[0], VARIANT_ID: 12, PRODUCT_ID: 4, VARIANT_IMAGE: null, STATUS: 'INACTIVE' }],
    });
    await settle();
    ignoreImages();
    const [product, variant] = cards();

    expect(text(product)).toContain('This product is no longer available.');
    expect(text(variant)).toContain('This variant is no longer available.');
    for (const card of cards()) {
      expect(card.querySelector('.product-card--unavailable')).not.toBeNull();
      expect(card.querySelector('a')).toBeNull();
      expect(moveButton(card).disabled).toBe(true);
      // They can still be removed.
      expect(removeButton(card).disabled).toBe(false);
    }
  });

  it('shows an item from its row when its variant details cannot be loaded', async () => {
    await openAsCustomer([wishlistRow()]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(variantUrl(3)).flush('Server error', { status: 500, statusText: 'Server Error' });
    await settle();
    ignoreImages();
    const [wallet] = cards();

    expect(text(wallet.querySelector('h2'))).toBe('Leather Wallet');
    expect(priceRow(wallet)).toBe('₹899 ₹1,299 31% OFF');
    expect(text(wallet)).not.toContain('Classic');
    expect(moveButton(wallet).disabled).toBe(false);
  });

  describe('Remove', () => {
    it('sends POST wishlist/manage REMOVE with the item\'s PRODUCT_ID and PRODUCT_VARIANT_ID, then drops the card', async () => {
      await openAsCustomer([wishlistRow(), wishlistRow({ WISHLIST_ID: 5, PRODUCT_VARIANT_ID: 10 })]);
      flushDetails([3]);
      await settle();
      ignoreImages();

      removeButton(cards()[1]).click();
      await settle();
      const remove = http.expectOne(MANAGE_URL);
      expect(remove.request.method).toBe('POST');
      // The variant of this card (10), not the other saved variant of the product.
      expect(remove.request.body).toEqual({ PRODUCT_ID: 3, PRODUCT_VARIANT_ID: 10, ACTION: 'REMOVE' });
      // While the request is in flight: a spinner on this heart, and every card's buttons disabled.
      expect(removeButton(cards()[1]).getAttribute('aria-busy')).toBe('true');
      expect(cards().every((card) => moveButton(card).disabled && removeButton(card).disabled)).toBe(true);
      remove.flush(managed(3, 10, 'REMOVE'));
      await settle();

      // Gone at once; the page is then read again to fill its place (no cart request).
      expect(cards()).toHaveLength(1);
      expect(text(cards()[0])).toContain('Classic');
      expect(toast.current()).toEqual({ type: 'success', message: 'Leather Wallet was removed from your wishlist.' });
      http.expectOne(WISHLIST_URL()).flush(wishlistResponse([wishlistRow()]));
      http.expectNone(CART_URL);
      await settle();
      expect(cards()).toHaveLength(1);
      // The hearts on other screens follow: variant 10 is no longer saved, variant 9 still is.
      const wishlist = TestBed.inject(WishlistService);
      expect(wishlist.has({ id: '3' }, 10)).toBe(false);
      expect(wishlist.has({ id: '3' }, 9)).toBe(true);
    });

    it('shows the empty wishlist after the last item is removed', async () => {
      await openAsCustomer([wishlistRow()]);
      flushDetails([3]);
      await settle();
      ignoreImages();

      removeButton(cards()[0]).click();
      await settle();
      http.expectOne(MANAGE_URL).flush(managed(3, 9, 'REMOVE'));
      http.expectOne(WISHLIST_URL()).flush(wishlistResponse([]));
      await settle();

      expect(cards()).toHaveLength(0);
      expect(text()).toContain('Your wishlist is empty');
    });

    it('keeps the card and shows the API error when the request fails', async () => {
      await openAsCustomer([wishlistRow()]);
      flushDetails([3]);
      await settle();
      ignoreImages();

      removeButton(cards()[0]).click();
      await settle();
      http.expectOne(MANAGE_URL).flush({ status: false, message: 'ITEM NOT FOUND IN WISHLIST' });
      await settle();

      http.expectNone((request) => request.url.endsWith('/wishlist/get'));
      expect(cards()).toHaveLength(1);
      expect(toast.current()).toEqual({ type: 'error', message: 'ITEM NOT FOUND IN WISHLIST' });
      expect(removeButton(cards()[0]).disabled).toBe(false);
      expect(TestBed.inject(WishlistService).has({ id: '3' }, 9)).toBe(true);
    });
  });

  // CHANGED: Move to Cart is shopping_cart/insert, then wishlist/manage REMOVE (it was PUT move_to_cart/update).
  describe('Move to Cart', () => {
    async function openWithWallet(): Promise<void> {
      await openAsCustomer([wishlistRow(), wishlistRow(MUG_ROW)]);
      flushDetails([3, 4]);
      await settle();
      ignoreImages();
    }

    it('adds the item to the cart, removes it from the wishlist, then refreshes the wishlist and the cart', async () => {
      await openWithWallet();
      const cart = TestBed.inject(CartService);

      moveButton(cards()[0]).click();
      await settle();
      const insert = http.expectOne(INSERT_URL);
      expect(insert.request.body).toEqual({
        PRODUCT_ID: 3, SELLER_ID: 6, PRODUCT_VARIANT_ID: 9, QUANTITY: 1, UNIT_PRICE: 899, DISCOUNT: 0, TAX: 0,
        TOTAL_AMOUNT: 899, CUSTOMER_ID, CREATED_BY: USER_ID,
      });
      expect(moveButton(cards()[0]).getAttribute('aria-busy')).toBe('true');
      expect(cards().every((card) => moveButton(card).disabled && removeButton(card).disabled)).toBe(true);
      insert.flush('Shopping cart item added successfully');

      const remove = http.expectOne(MANAGE_URL);
      expect(remove.request.body).toEqual({ PRODUCT_ID: 3, PRODUCT_VARIANT_ID: 9, ACTION: 'REMOVE' });
      remove.flush(managed(3, 9, 'REMOVE'));
      await settle();
      expect(cards()).toHaveLength(1);
      expect(toast.current()).toEqual({ type: 'success', message: 'Leather Wallet was moved to your cart.' });

      // The cart (header count) and the wishlist page are read again; products already seen make no new requests.
      http.expectOne(CART_URL).flush({
        success: true,
        data: [{ CART_ID: 80, PRODUCT_ID: 3, SELLER_ID: 6, CART_QUANTITY: 1, UNIT_PRICE: '899.00', CUSTOMER_ID, SAVE_FOR_LATER: 0, PRODUCT_NAME: 'Leather Wallet', VARIANT_ID: 9 }],
      });
      // The cart looks up whether the product now in it is still listed.
      http.expectOne('/api/products/get?PRODUCT_ID=3').flush({ status: 'SUCCESS', data: [] });
      http.expectOne(WISHLIST_URL()).flush(wishlistResponse([wishlistRow(MUG_ROW)]));
      await settle();

      expect(cards()).toHaveLength(1);
      expect(text(cards()[0].querySelector('h2'))).toBe('Travel Mug');
      expect(cart.count()).toBe(1);
    });

    it('keeps the item and shows the API error when the cart insert fails (nothing is removed)', async () => {
      await openWithWallet();

      moveButton(cards()[0]).click();
      await settle();
      http.expectOne(INSERT_URL).flush({ message: 'Product is out of stock' }, { status: 400, statusText: 'Bad Request' });
      await settle();

      http.expectNone(MANAGE_URL);
      expect(cards()).toHaveLength(2);
      expect(toast.current()).toEqual({ type: 'error', message: 'Product is out of stock' });
      expect(moveButton(cards()[0]).disabled).toBe(false);
    });

    it('says so when the item reached the cart but could not be removed from the wishlist', async () => {
      await openWithWallet();

      moveButton(cards()[0]).click();
      await settle();
      http.expectOne(INSERT_URL).flush('Shopping cart item added successfully');
      http.expectOne(MANAGE_URL).flush({ message: 'Server busy' }, { status: 503, statusText: 'Service Unavailable' });
      await settle();

      expect(cards()).toHaveLength(2);
      expect(toast.current()).toEqual({
        type: 'error', message: 'Leather Wallet was added to your cart, but is still in your wishlist. Server busy',
      });
      // The cart is read again, so the header count shows the new row.
      http.expectOne(CART_URL).flush({ success: true, data: [] });
    });

    it('does not offer Move to Cart for an out-of-stock item', async () => {
      await openWithWallet();

      expect(moveButton(cards()[1]).disabled).toBe(true);
      moveButton(cards()[1]).click();
      await settle();
      http.expectNone(INSERT_URL);
    });
  });

  it('pages through the wishlist with LIMIT 10 and OFFSET', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => wishlistRow({ WISHLIST_ID: 100 + index, PRODUCT_VARIANT_ID: 100 + index }));
    await openAsCustomer(firstPage);
    flushDetails([3]);
    await settle();
    ignoreImages();
    expect(cards()).toHaveLength(10);
    expect(text(root().querySelector('app-pagination'))).toContain('Showing 1–10 items on this page');

    (root().querySelector('app-pagination button[aria-label="Next page"]') as HTMLButtonElement).click();
    await settle();
    http.expectOne(WISHLIST_URL(10)).flush(wishlistResponse([
      wishlistRow({ WISHLIST_ID: 110, PRODUCT_VARIANT_ID: 110 }), wishlistRow({ WISHLIST_ID: 111, PRODUCT_VARIANT_ID: 111 }),
    ]));
    await settle();

    expect(cards()).toHaveLength(2);
    expect(text(root().querySelector('app-pagination'))).toContain('Showing 11–12 of 12 items');
  });

  it('shows the empty state, and the API error with Try again', async () => {
    await openAsCustomer([]);
    expect(text()).toContain('Your wishlist is empty');

    fixture.destroy();
    fixture = TestBed.createComponent(Wishlist);
    fixture.detectChanges();
    http.expectOne(WISHLIST_URL()).flush({ status: false, message: 'Unable to fetch wishlist' });
    await settle();
    expect(text(root().querySelector('[role="alert"]'))).toContain('Unable to fetch wishlist');

    (root().querySelector('.wishlist__retry') as HTMLButtonElement).click();
    await settle();
    http.expectOne(WISHLIST_URL()).flush(wishlistResponse([]));
    await settle();
    expect(text()).toContain('Your wishlist is empty');
  });

  it('keeps the device wishlist for a guest and never calls wishlist/get', async () => {
    localStorage.setItem('milex.wishlist', JSON.stringify(['3']));
    fixture = TestBed.createComponent(Wishlist);
    fixture.detectChanges();
    http.expectOne('/api/products/get?STATUS=ACTIVE').flush({
      status: 'SUCCESS',
      data: [{ PRODUCT_ID: 3, PRODUCT_NAME: 'Leather Wallet', SELLING_PRICE: '999.00', PRICE: '1299.00', STOCK_QUANTITY: 20, IS_ACTIVE: 'ACTIVE' }],
    });
    await settle();

    http.expectNone((request) => request.url.endsWith('/wishlist/get'));
    expect(cards()).toHaveLength(1);
    expect(text(cards()[0].querySelector('h2'))).toBe('Leather Wallet');
    expect(moveButton(cards()[0]).textContent).toContain('Add to Cart');
  });
});
