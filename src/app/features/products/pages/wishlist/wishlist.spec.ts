// CHANGED (new): the Wishlist page with move_to_cart/get (signed-in customer) and the device wishlist (guest).
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ToastService } from '@core/services/toast.service';
import { Wishlist } from './wishlist';

const USER_ID = 3;
const CUSTOMER_ID = 1;
const WISHLIST_URL = (offset = 0): string => `/api/move_to_cart/get?CATEGORY_ID=-1&PRODUCT_ID=-1&LIMIT=10&OFFSET=${offset}`;
const productUrl = (id: number): string => `/api/products/get?PRODUCT_ID=${id}`;
const variantUrl = (id: number): string => `/api/product_variant/get?PRODUCT_ID=${id}&VARIANT_ID=-1&LIMIT=10&OFFSET=0`;
const BRANDS_URL = '/api/brand_management/get?BRAND_ID=-1';
// CHANGED (new): Move to Cart (PUT move_to_cart/update) and the cart refresh after it.
const MOVE_URL = '/api/move_to_cart/update';
const CART_URL = `/api/shopping_cart/get?CUSTOMER_ID=1`;

/** A shopping_cart/get row: by default the wallet (product 3, variant 9) as an active cart row (CART_ID 80). */
function cartRowJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CART_ID: 80, PRODUCT_ID: 3, SELLER_ID: 6, CART_QUANTITY: 1, UNIT_PRICE: '899.00', CUSTOMER_ID: 1, SAVE_FOR_LATER: 0,
    PRODUCT_NAME: 'Leather Wallet', VARIANT_ID: 9, ...overrides,
  };
}

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

/**
 * A move_to_cart/get row like the sample response (with PRODUCT_NAME). Its UNIT_PRICE (750) is a stale stored price:
 * the cards show the product's current prices instead.
 */
function wishlistRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CART_ID: 45, PRODUCT_ID: 3, PRODUCT_VARIANT_ID: 9, SELLER_ID: 6, SKU: 'CRT0045', QUANTITY: 1,
    UNIT_PRICE: '750.00', DISCOUNT: '0.00', TAX: '0.00', TOTAL_AMOUNT: '750.00', CUSTOMER_ID, SAVE_FOR_LATER: 1,
    PRODUCT_NAME: 'Leather Wallet',
    ...overrides,
  };
}

/** The saved Travel Mug row (product 4, which has no VARIANTS, and no variant 12 in product_variant/get). */
const MUG_ROW = {
  CART_ID: 46, PRODUCT_ID: 4, PRODUCT_VARIANT_ID: 12, SELLER_ID: 7, QUANTITY: 2,
  UNIT_PRICE: '400.00', TOTAL_AMOUNT: '800.00', PRODUCT_NAME: 'Travel Mug',
};

const wishlistResponse = (data: unknown[]) => ({
  status: true, message: 'Saved for Later items retrieved successfully', data,
});

/**
 * products/get?PRODUCT_ID=<id> rows, shaped like the API's: the product's SELLING_PRICE / PRICE (MRP) / DISCOUNT and
 * its VARIANTS with their own prices. Variant 9 is on offer, variant 10 is not (PRICE = SELLING_PRICE).
 * Product 4 is out of stock.
 */
const PRODUCTS: Record<number, Record<string, unknown>> = {
  3: {
    PRODUCT_ID: 3, SELLER_ID: 6, PRODUCT_NAME: 'Leather Wallet', PRICE: '1299.00', SELLING_PRICE: '999.00',
    DISCOUNT: '300.00', STOCK_QUANTITY: 20, BRAND_ID: 2, CATEGORY_ID: 1, IS_ACTIVE: 'ACTIVE',
    PRODUCT_IMAGE: 'products/wallet.png',
    VARIANTS: [
      { VARIANT_ID: 9, SELLING_PRICE: '899.00', PRICE: '1299.00', DISCOUNT: '400.00', STOCK_QUANTITY: 5 },
      { VARIANT_ID: 10, SELLING_PRICE: '999.00', PRICE: '999.00', DISCOUNT: '0.00', STOCK_QUANTITY: 0 },
    ],
  },
  4: {
    PRODUCT_ID: 4, SELLER_ID: 7, PRODUCT_NAME: 'Travel Mug', PRICE: '500.00', SELLING_PRICE: '450.00',
    DISCOUNT: '0.00', STOCK_QUANTITY: 0, BRAND_ID: 3, CATEGORY_ID: 2, IS_ACTIVE: 'ACTIVE',
  },
};
/** The price row of a card, its parts (selling price, struck MRP, "% OFF") joined by spaces. */
const priceRow = (card: HTMLElement): string =>
  Array.from(card.querySelectorAll('.product-card__price > *'), (part) => (part.textContent ?? '').trim()).join(' ');

/** product_variant/get rows of product 3: the saved variant 9 (with its own image and price) and another one. */
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

  function signInCustomer(): void {
    TestBed.inject(AuthService).setSession(
      { id: String(USER_ID), email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
      tokenWithClaims({ USER_ID, CUSTOMER_ID }),
    );
  }

  /** Answers the product requests of a page: brand names, products/get and product_variant/get per new product. */
  function flushProducts(ids: number[], { brands = true } = {}): void {
    if (brands) {
      http.expectOne(BRANDS_URL).flush({
        status: 'SUCCESS',
        data: [{ BRAND_ID: 2, BRAND_NAME: 'Hidesign' }, { BRAND_ID: 3, BRAND_NAME: 'Milton' }],
      });
    }
    for (const id of ids) {
      http.expectOne(productUrl(id)).flush({ status: 'SUCCESS', data: [PRODUCTS[id]] });
      http.expectOne(variantUrl(id)).flush({ status: 'SUCCESS', data: id === 3 ? PRODUCT_3_VARIANTS : [] });
    }
  }

  /** Opens the page as a customer and answers the catalog (device wishlist) and the first move_to_cart/get page. */
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

  it('shows each saved row with its product, brand, variant, price and quantity', async () => {
    await openAsCustomer([wishlistRow(), wishlistRow(MUG_ROW)]);
    expect(root().querySelector('[role="status"]')?.textContent).toContain('Loading your wishlist');
    flushProducts([3, 4]);
    await settle();

    const [wallet, mug] = cards();
    expect(cards()).toHaveLength(2);
    // Product 3 with its saved variant 9: the variant's current prices (not the row's stored 750), details and image.
    expect(text(wallet.querySelector('h2'))).toBe('Leather Wallet');
    expect(text(wallet)).toContain('Brand: Hidesign');
    expect(text(wallet)).toContain('Classic · Brown / M');
    expect(text(wallet)).toContain('Qty: 1');
    // Selling price, struck MRP, then round((1299 − 899) ÷ 1299 × 100) = 31% OFF.
    expect(text(wallet.querySelector('.product-card__price strong'))).toBe('₹899');
    expect(text(wallet.querySelector('.product-card__price del'))).toBe('₹1,299');
    expect(text(wallet.querySelector('.product-card__price span'))).toBe('31% OFF');
    expect(text(wallet)).not.toContain('₹750');
    expect(wallet.querySelector('.product-card--unavailable')).toBeNull();
    expect(moveButton(wallet).textContent).toContain('Move to Cart');
    expect(moveButton(wallet).disabled).toBe(false);
    expect(wallet.querySelector('a')?.getAttribute('href')).toBe('/products/3');

    // Product 4 has no VARIANTS and no variant 12: the product's own prices and stock.
    expect(text(mug.querySelector('h2'))).toBe('Travel Mug');
    expect(text(mug)).toContain('Brand: Milton');
    expect(text(mug)).toContain('Qty: 2');
    expect(text(mug)).toContain('Out of stock');
    expect(priceRow(mug)).toBe('₹450 ₹500 10% OFF');
    expect(moveButton(mug).disabled).toBe(true);

    // Only the variant's S3 image is requested for the wallet.
    http.expectNone((request) => request.url.endsWith('/s3/images/products/wallet.png'));
    http.expectOne((request) => request.url.endsWith('/s3/images/variants/brown.png')).flush({
      success: true, imageKey: 'variants/brown.png', imageUrl: 'https://bucket.s3.amazonaws.com/variants/brown.png?sig=1', expiresIn: 3600,
    });
    await settle();
    expect(wallet.querySelector('img')?.getAttribute('src')).toBe('https://bucket.s3.amazonaws.com/variants/brown.png?sig=1');
  });

  it('prices each card like the product listing, from the variant\'s prices or else the product\'s', async () => {
    await openAsCustomer([
      // Variant 10: PRICE = SELLING_PRICE, so the selling price only. The row's DISCOUNT is not used.
      wishlistRow({ PRODUCT_VARIANT_ID: 10, DISCOUNT: '100.00' }),
      // No variant, and a variant missing from VARIANTS: the product's own prices.
      wishlistRow({ CART_ID: 46, PRODUCT_VARIANT_ID: null }),
      wishlistRow({ CART_ID: 47, PRODUCT_VARIANT_ID: 99 }),
    ]);
    flushProducts([3]);
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));
    const [noOffer, noVariant, unknownVariant] = cards();

    expect(priceRow(noOffer)).toBe('₹999');
    expect(noOffer.querySelector('.product-card__price del')).toBeNull();
    expect(noOffer.querySelector('.product-card__price span')).toBeNull();
    expect(text(noOffer)).not.toContain('Discount');
    // The badge is the product listing's: round((1299 − 999) ÷ 1299 × 100) = 23% OFF.
    expect(priceRow(noVariant)).toBe('₹999 ₹1,299 23% OFF');
    expect(priceRow(unknownVariant)).toBe('₹999 ₹1,299 23% OFF');
  });

  // CHANGED (new): the sample move_to_cart/get response: no PRODUCT_NAME and PRODUCT_VARIANT_ID null in both rows.
  it('shows the move_to_cart/get records with their products\' name, image and listing offer, matched by PRODUCT_ID', async () => {
    await openAsCustomer([
      {
        CART_ID: 33, PRODUCT_ID: 2, PRODUCT_VARIANT_ID: null, SELLER_ID: 1, SKU: 'CRT0033', QUANTITY: 5,
        UNIT_PRICE: '3000.00', DISCOUNT: '0.00', TAX: '0.00', TOTAL_AMOUNT: '15000.00', CUSTOMER_ID, SAVE_FOR_LATER: 1,
      },
      {
        CART_ID: 30, PRODUCT_ID: 3, PRODUCT_VARIANT_ID: null, SELLER_ID: 1, SKU: 'CRT0030', QUANTITY: 1,
        UNIT_PRICE: '55000.00', DISCOUNT: '0.00', TAX: '0.00', TOTAL_AMOUNT: '55000.00', CUSTOMER_ID, SAVE_FOR_LATER: 1,
      },
    ]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [{ BRAND_ID: 4, BRAND_NAME: 'Dell' }] });
    http.expectOne(productUrl(2)).flush({
      status: true,
      data: [{
        PRODUCT_ID: 2, PRODUCT_NAME: 'Dell  ear Phones', BRAND_ID: 4, SELLER_ID: 1, SELLING_PRICE: '3000.00', PRICE: '4000.00',
        DISCOUNT: '0.00', STOCK_QUANTITY: 45, IS_ACTIVE: 'ACTIVE', PRODUCT_IMAGE: 'uploads/products/earphones.png',
        VARIANTS: [{ VARIANT_ID: 16, SELLING_PRICE: '3000.00', PRICE: '4000.00', STOCK_QUANTITY: 45 }],
      }],
    });
    http.expectOne(variantUrl(2)).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(productUrl(3)).flush({
      status: true,
      data: [{
        PRODUCT_ID: 3, PRODUCT_NAME: 'Dell Inspiron 15', BRAND_ID: 4, SELLER_ID: 1, SELLING_PRICE: '55000.00', PRICE: '60000.00',
        DISCOUNT: '5000.00', STOCK_QUANTITY: 30, IS_ACTIVE: 'ACTIVE', PRODUCT_IMAGE: 'uploads/products/dell_inspiron15.png',
      }],
    });
    http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', data: [] });
    await settle();

    const [earPhones, laptop] = cards();
    expect(cards()).toHaveLength(2);
    // Names from products/get (the rows have no PRODUCT_NAME); no variant line for a null PRODUCT_VARIANT_ID.
    expect(cards().map((card) => text(card.querySelector('h2')))).toEqual(['Dell ear Phones', 'Dell Inspiron 15']);
    expect(text(earPhones)).toContain('Brand: Dell');
    expect(text(earPhones)).toContain('Qty: 5');
    expect(text(laptop)).toContain('Qty: 1');
    // The product listing's offer: round((4000 − 3000) ÷ 4000 × 100) = 25, round((60000 − 55000) ÷ 60000 × 100) = 8.
    expect(priceRow(earPhones)).toBe('₹3,000 ₹4,000 25% OFF');
    expect(priceRow(laptop)).toBe('₹55,000 ₹60,000 8% OFF');
    expect(earPhones.querySelector('img')?.getAttribute('src')).toBe('/uploads/products/earphones.png');
    expect(laptop.querySelector('img')?.getAttribute('src')).toBe('/uploads/products/dell_inspiron15.png');
    expect(text()).not.toContain('no longer available');
    expect(cards().every((card) => !moveButton(card).disabled && card.querySelector('a') !== null)).toBe(true);

    // Move to Cart for the row without a variant: PUT move_to_cart/update with its CART_ID.
    moveButton(laptop).click();
    await settle();
    const move = http.expectOne(MOVE_URL);
    expect(move.request.body).toEqual({ CART_ID: 30 });
    move.flush(JSON.stringify({ status: true, message: 'Moved to cart' }));
    http.expectOne(WISHLIST_URL()).flush(wishlistResponse([]));
    http.expectOne(CART_URL).flush({
      success: true,
      data: [cartRowJson({ CART_ID: 30, SELLER_ID: 1, UNIT_PRICE: '55000.00', PRODUCT_NAME: 'Dell Inspiron 15', VARIANT_ID: null })],
    });
    // The cart looks up whether the product now in it is still listed.
    http.expectOne(productUrl(3)).flush({ status: true, data: [] });
    await settle();
    expect(toast.current()).toEqual({ type: 'success', message: 'Dell Inspiron 15 was moved to your cart.' });
  });

  it('shows the three live records (two share PRODUCT_ID 3) by CART_ID; inactive products as no longer available', async () => {
    // The live move_to_cart/get rows; products 2 and 3 are IS_ACTIVE "INACTIVE" in products/get, as on the dev backend.
    await openAsCustomer([
      wishlistRow({ CART_ID: 45, PRODUCT_ID: 3, SELLER_ID: 6, PRODUCT_VARIANT_ID: 9, UNIT_PRICE: '999.00', PRODUCT_NAME: 'Dell Inspiron 15' }),
      wishlistRow({ CART_ID: 30, PRODUCT_ID: 3, SELLER_ID: 1, PRODUCT_VARIANT_ID: null, UNIT_PRICE: '55000.00', PRODUCT_NAME: 'Dell Inspiron 15' }),
      wishlistRow({ CART_ID: 31, PRODUCT_ID: 2, SELLER_ID: 1, PRODUCT_VARIANT_ID: 16, UNIT_PRICE: '3000.00', PRODUCT_NAME: 'Dell ear Phones' }),
    ]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [] });
    // One request per product, although PRODUCT_ID 3 has two rows.
    http.expectOne(productUrl(3)).flush({
      status: true,
      data: [{
        PRODUCT_ID: 3, PRODUCT_NAME: 'Dell Inspiron 15', SELLER_ID: 1, SELLING_PRICE: '55000.00', PRICE: '60000.00',
        DISCOUNT: '5000.00', STOCK_QUANTITY: 30, IS_ACTIVE: 'INACTIVE', PRODUCT_IMAGE: 'uploads/products/dell_inspiron15.png',
        VARIANTS: [
          { VARIANT_ID: 3, SELLING_PRICE: '55000.00', PRICE: '60000.00', STOCK_QUANTITY: 30 },
          { VARIANT_ID: 9, SELLING_PRICE: '55000.00', PRICE: '60000.00', STOCK_QUANTITY: 30 },
        ],
      }],
    });
    http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(productUrl(2)).flush({
      status: true,
      data: [{
        PRODUCT_ID: 2, PRODUCT_NAME: 'Dell  ear Phones', SELLER_ID: 1, SELLING_PRICE: '3000.00', PRICE: '4000.00',
        DISCOUNT: '0.00', STOCK_QUANTITY: 45, IS_ACTIVE: 'INACTIVE', PRODUCT_IMAGE: 'uploads/products/earphones.png',
        VARIANTS: [{ VARIANT_ID: 16, SELLING_PRICE: '3000.00', PRICE: '4000.00', STOCK_QUANTITY: 45 }],
      }],
    });
    http.expectOne(variantUrl(2)).flush({ status: 'SUCCESS', data: [] });
    await settle();

    expect(cards()).toHaveLength(3);
    expect(cards().map((card) => text(card.querySelector('h2')))).toEqual(['Dell Inspiron 15', 'Dell Inspiron 15', 'Dell ear Phones']);
    // Current listing prices (not the stored 999 / 55000 / 3000): round((60000 − 55000) ÷ 60000 × 100) = 8,
    // round((4000 − 3000) ÷ 4000 × 100) = 25.
    expect(cards().map(priceRow)).toEqual(['₹55,000 ₹60,000 8% OFF', '₹55,000 ₹60,000 8% OFF', '₹3,000 ₹4,000 25% OFF']);
    // Both products are inactive (delisted): greyed out, "no longer available", no link to their page, and they
    // cannot be moved to the cart; they can still be removed.
    for (const card of cards()) {
      expect(card.querySelector('.product-card--unavailable')).not.toBeNull();
      expect(text(card)).toContain('This product is no longer available.');
      expect(card.querySelector('a')).toBeNull();
      expect(moveButton(card).disabled).toBe(true);
      expect(removeButton(card).disabled).toBe(false);
    }
    // Each product's own image (legacy /uploads path).
    expect(cards()[0].querySelector('img')?.getAttribute('src')).toBe('/uploads/products/dell_inspiron15.png');
    expect(cards()[2].querySelector('img')?.getAttribute('src')).toBe('/uploads/products/earphones.png');

    // Each record keeps its own CART_ID, SELLER_ID and variant: removing CART_ID 30 sends that row's IDs.
    removeButton(cards()[1]).click();
    await settle();
    const remove = http.expectOne('/api/shopping_cart/delete');
    expect(remove.request.body).toEqual({ CART_ID: 30, PRODUCT_ID: 3, SELLER_ID: 1, CUSTOMER_ID });
    remove.flush('Cart item deleted successfully');
    http.expectOne(WISHLIST_URL()).flush(wishlistResponse([]));
    http.expectOne(`/api/shopping_cart/get?CUSTOMER_ID=${CUSTOMER_ID}`).flush({ success: true, data: [] });
    await settle();
  });

  it('shows a row whose product products/get does not return from the record itself, without calling it unavailable', async () => {
    await openAsCustomer([wishlistRow(MUG_ROW)]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(productUrl(4)).flush({ status: true, data: [] });
    http.expectOne(variantUrl(4)).flush({ status: 'SUCCESS', data: [] });
    await settle();
    const [mug] = cards();

    expect(text(mug.querySelector('h2'))).toBe('Travel Mug');
    expect(priceRow(mug)).toBe('₹400');
    expect(text(mug)).not.toContain('no longer available');
    expect(mug.querySelector('.product-card--unavailable')).toBeNull();
    expect(moveButton(mug).disabled).toBe(false);
  });

  it('shows an inactive variant of an active product as no longer available', async () => {
    await openAsCustomer([wishlistRow()]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(productUrl(3)).flush({ status: 'SUCCESS', data: [PRODUCTS[3]] });
    http.expectOne(variantUrl(3)).flush({
      status: 'SUCCESS',
      data: [{ ...PRODUCT_3_VARIANTS[0], STATUS: 'INACTIVE' }],
    });
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));
    const [card] = cards();

    expect(card.querySelector('.product-card--unavailable')).not.toBeNull();
    expect(text(card)).toContain('This variant is no longer available.');
    expect(moveButton(card).disabled).toBe(true);
  });

  it('names each card by the row\'s PRODUCT_NAME, also when the product cannot be loaded', async () => {
    await openAsCustomer([wishlistRow({ PRODUCT_NAME: 'Dell Inspiron 15' }), wishlistRow({ ...MUG_ROW, PRODUCT_NAME: 'Steel Mug' })]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(productUrl(3)).flush({ status: 'SUCCESS', data: [PRODUCTS[3]] });
    http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', data: PRODUCT_3_VARIANTS });
    http.expectOne(variantUrl(4)).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(productUrl(4)).flush('Server error', { status: 500, statusText: 'Server Error' });
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));

    expect(cards().map((card) => text(card.querySelector('h2')))).toEqual(['Dell Inspiron 15', 'Steel Mug']);
    expect(text(cards()[1])).toContain('Product details could not be loaded.');
    // No product data: the row's stored price; the item can still be moved (the request failed, not the product).
    expect(priceRow(cards()[1])).toBe('₹400');
    expect(moveButton(cards()[1]).disabled).toBe(false);
  });

  it('requests a product once when several rows share it, and maps each row to its own variant', async () => {
    await openAsCustomer([wishlistRow(), wishlistRow({ CART_ID: 47, PRODUCT_VARIANT_ID: 10 })]);
    flushProducts([3]);
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));

    const [classic, slim] = cards();
    expect(text(classic)).toContain('Classic · Brown / M');
    expect(text(slim)).toContain('Slim · Black');
    expect(text(slim)).toContain('Out of stock');
    expect(moveButton(slim).disabled).toBe(true);
  });

  it('shows a row saved without a variant (PRODUCT_VARIANT_ID null) from its product, and can remove it', async () => {
    await openAsCustomer([wishlistRow({ PRODUCT_VARIANT_ID: null }), wishlistRow({ CART_ID: 46 })]);
    flushProducts([3]);
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));

    const [plain, classic] = cards();
    expect(cards()).toHaveLength(2);
    expect(text(plain.querySelector('h2'))).toBe('Leather Wallet');
    expect(text(plain)).toContain('Brand: Hidesign');
    expect(text(plain)).not.toContain('Classic');
    expect(priceRow(plain)).toBe('₹999 ₹1,299 23% OFF');
    expect(moveButton(plain).disabled).toBe(false);
    expect(text(classic)).toContain('Classic · Brown / M');

    removeButton(plain).click();
    await settle();
    const remove = http.expectOne('/api/shopping_cart/delete');
    expect(remove.request.body).toEqual({ CART_ID: 45, PRODUCT_ID: 3, SELLER_ID: 6, CUSTOMER_ID });
    remove.flush('Cart item deleted successfully');
    http.expectOne(WISHLIST_URL()).flush(wishlistResponse([wishlistRow({ CART_ID: 46 })]));
    http.expectOne(`/api/shopping_cart/get?CUSTOMER_ID=${CUSTOMER_ID}`).flush({ success: true, data: [] });
    await settle();

    expect(cards()).toHaveLength(1);
    expect(toast.current()).toEqual({ type: 'success', message: 'Leather Wallet was removed from your wishlist.' });
  });

  // CHANGED: Move to Cart is PUT move_to_cart/update with the row's CART_ID.
  describe('Move to Cart', () => {
    /** Opens the wallet (variant 9, quantity 3) and the out-of-stock mug, with their products loaded. */
    async function openWithWallet(): Promise<void> {
      await openAsCustomer([wishlistRow({ QUANTITY: 3, TOTAL_AMOUNT: '2250.00' }), wishlistRow(MUG_ROW)]);
      flushProducts([3, 4]);
      await settle();
      http.match((request) => request.url.includes('/s3/images/'));
    }

    it('sends PUT move_to_cart/update with the CART_ID, then refreshes the wishlist and the cart', async () => {
      await openWithWallet();
      const cart = TestBed.inject(CartService);

      moveButton(cards()[0]).click();
      await settle();
      const move = http.expectOne(MOVE_URL);
      expect(move.request.method).toBe('PUT');
      expect(move.request.body).toEqual({ CART_ID: 45 });
      // While the request is in flight: a spinner on this button, and every card's buttons disabled.
      expect(moveButton(cards()[0]).getAttribute('aria-busy')).toBe('true');
      expect(cards().every((card) => moveButton(card).disabled && removeButton(card).disabled)).toBe(true);
      move.flush(JSON.stringify({ status: true, message: 'Moved to cart' }));

      // The wishlist page is read again (products are cached: no new product requests), then the cart once.
      http.expectOne(WISHLIST_URL()).flush(wishlistResponse([wishlistRow(MUG_ROW)]));
      http.expectOne(CART_URL).flush({ success: true, data: [cartRowJson({ CART_ID: 45, CART_QUANTITY: 3 })] });
      http.expectOne(productUrl(3)).flush({ status: 'SUCCESS', data: [PRODUCTS[3]] });
      await settle();

      expect(cards()).toHaveLength(1);
      expect(text(cards()[0].querySelector('h2'))).toBe('Travel Mug');
      expect(toast.current()).toEqual({ type: 'success', message: 'Leather Wallet was moved to your cart.' });
      expect(cart.count()).toBe(3);
    });

    it('keeps the row and shows the API error when the request fails', async () => {
      await openWithWallet();

      moveButton(cards()[0]).click();
      await settle();
      http.expectOne(MOVE_URL).flush({ message: 'Product is out of stock' }, { status: 400, statusText: 'Bad Request' });
      await settle();

      http.expectNone((request) => request.url.endsWith('/move_to_cart/get'));
      expect(cards()).toHaveLength(2);
      expect(toast.current()).toEqual({ type: 'error', message: 'Product is out of stock' });
      expect(moveButton(cards()[0]).disabled).toBe(false);
    });

    it('reports a move the server did not apply when the row is still saved', async () => {
      await openWithWallet();

      moveButton(cards()[0]).click();
      await settle();
      http.expectOne(MOVE_URL).flush('Updated');
      http.expectOne(WISHLIST_URL()).flush(wishlistResponse([wishlistRow(), wishlistRow(MUG_ROW)]));
      http.expectOne(CART_URL).flush({ success: true, data: [] });
      await settle();

      expect(cards()).toHaveLength(2);
      expect(toast.current()).toEqual({
        type: 'error', message: 'Leather Wallet is still in your wishlist. It could not be moved to your cart.',
      });
    });

    it('does not offer Move to Cart for an out-of-stock item', async () => {
      await openWithWallet();

      expect(moveButton(cards()[1]).disabled).toBe(true);
      moveButton(cards()[1]).click();
      await settle();
      http.expectNone(MOVE_URL);
    });
  });

  it('removes a row with DELETE shopping_cart/delete and shows the empty wishlist', async () => {
    await openAsCustomer([wishlistRow()]);
    flushProducts([3]);
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));

    removeButton(cards()[0]).click();
    await settle();
    const remove = http.expectOne('/api/shopping_cart/delete');
    expect(remove.request.method).toBe('DELETE');
    expect(remove.request.body).toEqual({ CART_ID: 45, PRODUCT_ID: 3, SELLER_ID: 6, CUSTOMER_ID, PRODUCT_VARIANT_ID: 9 });
    remove.flush('Cart item deleted successfully');
    http.expectOne(WISHLIST_URL()).flush(wishlistResponse([]));
    http.expectOne(`/api/shopping_cart/get?CUSTOMER_ID=${CUSTOMER_ID}`).flush({ success: true, data: [] });
    await settle();

    expect(cards()).toHaveLength(0);
    expect(text()).toContain('Your wishlist is empty');
    expect(toast.current()).toEqual({ type: 'success', message: 'Leather Wallet was removed from your wishlist.' });
  });

  it('keeps the row and shows the API error when an action fails', async () => {
    await openAsCustomer([wishlistRow()]);
    flushProducts([3]);
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));

    removeButton(cards()[0]).click();
    await settle();
    http.expectOne('/api/shopping_cart/delete').flush({ message: 'Cart item not found' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(cards()).toHaveLength(1);
    expect(toast.current()).toEqual({ type: 'error', message: 'Cart item not found' });
    expect(removeButton(cards()[0]).disabled).toBe(false);
  });

  it('pages through the wishlist with LIMIT 10 and OFFSET', async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => wishlistRow({ CART_ID: 100 + index }));
    await openAsCustomer(firstPage);
    flushProducts([3]);
    await settle();
    http.match((request) => request.url.includes('/s3/images/'));
    expect(cards()).toHaveLength(10);
    expect(text(root().querySelector('app-pagination'))).toContain('Showing 1–10 items on this page');

    (root().querySelector('app-pagination button[aria-label="Next page"]') as HTMLButtonElement).click();
    await settle();
    http.expectOne(WISHLIST_URL(10)).flush(wishlistResponse([wishlistRow({ CART_ID: 110 }), wishlistRow({ CART_ID: 111 })]));
    await settle();

    expect(cards()).toHaveLength(2);
    expect(text(root().querySelector('app-pagination'))).toContain('Showing 11–12 of 12 items');
  });

  it('shows a row whose product failed to load, and says so (named by PRODUCT_ID without PRODUCT_NAME)', async () => {
    await openAsCustomer([wishlistRow({ PRODUCT_NAME: undefined })]);
    http.expectOne(BRANDS_URL).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', data: [] });
    http.expectOne(productUrl(3)).flush('Server error', { status: 500, statusText: 'Server Error' });
    await settle();

    expect(text(cards()[0].querySelector('h2'))).toBe('Product #3');
    expect(text(cards()[0])).toContain('Product details could not be loaded.');
    expect(text(cards()[0])).not.toContain('no longer available');
    expect(moveButton(cards()[0]).disabled).toBe(false);
    expect(toast.current()?.type).toBe('error');
  });

  it('shows the empty state, and the API error with Try again', async () => {
    await openAsCustomer([]);
    expect(text()).toContain('Your wishlist is empty');

    fixture.destroy();
    fixture = TestBed.createComponent(Wishlist);
    fixture.detectChanges();
    http.expectOne(WISHLIST_URL()).flush({ status: false, message: 'Unable to fetch saved items' });
    await settle();
    expect(text(root().querySelector('[role="alert"]'))).toContain('Unable to fetch saved items');

    (root().querySelector('.wishlist__retry') as HTMLButtonElement).click();
    await settle();
    http.expectOne(WISHLIST_URL()).flush(wishlistResponse([]));
    await settle();
    expect(text()).toContain('Your wishlist is empty');
  });

  it('keeps the device wishlist for a guest and never calls move_to_cart/get', async () => {
    localStorage.setItem('milex.wishlist', JSON.stringify(['3']));
    fixture = TestBed.createComponent(Wishlist);
    fixture.detectChanges();
    http.expectOne('/api/products/get?STATUS=ACTIVE').flush({ status: 'SUCCESS', data: [PRODUCTS[3]] });
    await settle();

    http.expectNone((request) => request.url.endsWith('/move_to_cart/get'));
    expect(cards()).toHaveLength(1);
    expect(text(cards()[0].querySelector('h2'))).toBe('Leather Wallet');
    expect(moveButton(cards()[0]).textContent).toContain('Add to Cart');
  });
});
