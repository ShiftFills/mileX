import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ProductDetail } from './product-detail';

interface ProductDetailHarness {
  quantity(): number;
  selectionError(): string;
  addedToCart(): boolean;
  selectedSize(): string | null;
  deliveryMessage(): { ok: boolean; text: string } | null;
  discountPercent(): number;
  related(): { id: string }[];
  addToCart(): void;
  selectSize(size: string): void;
  changeQuantity(step: number): void;
  updatePincode(event: Event): void;
  checkDelivery(): void;
  toggleWishlist(id?: string): void;
}

function inputEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
}

function tokenWithClaims(claims: Record<string, number>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

// CHANGED (new): product_variant/get helpers.
function variantUrl(productId: number): string {
  return `/api/product_variant/get?PRODUCT_ID=${productId}&VARIANT_ID=-1&LIMIT=10&OFFSET=0`;
}

/** One product_variant/get row with null optional fields, like the sample response. */
function variantRow(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    VARIANT_ID: id, VARIANT_NAME: `Variant ${id}`, SKU: `SKU000${id}`, BARCODE: null,
    SIZE: null, SIZE_NAME: null, COLOR: null, COLOUR_NAME: null, MATERIAL: null, MATERIAL_NAME: null,
    WEIGHT: null, PRICE: '40000.00', STOCK_QUANTITY: 0, VARIANT_IMAGE: null, PRODUCT_ID: 5,
    SELLER_ID: 44, SELLER_NAME: 'Arun Kumar', STATUS: 'ACTIVE', CREATED_BY: 73,
    ...overrides,
  };
}

/** Variants for product 5: two in stock, one out of stock, plus one INACTIVE and one of another product. */
// CHANGED: 31 and 33 also have colour / size / material names, for the swatches and chips.
const PRODUCT_5_VARIANTS = [
  variantRow(31, {
    VARIANT_NAME: 'Black Leather dongle', SKU: 'SKU00021', VARIANT_IMAGE: 'Screenshot 2026-10-21 151737.png',
    COLOUR_NAME: 'Black', MATERIAL_NAME: 'Leather',
  }),
  variantRow(32, {
    VARIANT_NAME: 'Brown', PRICE: '899.00', STOCK_QUANTITY: 3, BARCODE: '8901234',
    SIZE: 2, SIZE_NAME: 'M', COLOR: 4, COLOUR_NAME: 'Brown', MATERIAL: 3, MATERIAL_NAME: 'Leather', WEIGHT: '0.25',
  }),
  variantRow(33, {
    VARIANT_NAME: 'Grey', PRICE: '850.00', STOCK_QUANTITY: 10, SELLER_ID: null, SELLER_NAME: null,
    COLOUR_NAME: 'Grey', SIZE_NAME: 'L',
  }),
  variantRow(34, { VARIANT_NAME: 'Retired colour', STOCK_QUANTITY: 9, STATUS: 'INACTIVE' }),
  variantRow(35, { VARIANT_NAME: 'Other product variant', STOCK_QUANTITY: 9, PRODUCT_ID: 6 }),
];

/** products/get rows: the full catalog ("You may also like"), and each product's own row. */
const PRODUCT_ROWS: Record<string, unknown>[] = [
  { PRODUCT_ID: 3, VARIANT_ID: 14, SELLER_ID: 24, PRODUCT_NAME: 'Samsung Galaxy S25', PRODUCT_DESCRIPTION: 'Samsung smartphone', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 5, CATEGORY_ID: 1, IS_ACTIVE: 1 },
  { PRODUCT_ID: 4, VARIANT_ID: 15, SELLER_ID: 25, PRODUCT_NAME: 'Wireless Mouse Updated', PRICE: '999.00', SELLING_PRICE: '749.00', STOCK_QUANTITY: 90, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
  { PRODUCT_ID: 5, VARIANT_ID: 16, SELLER_ID: 26, PRODUCT_NAME: 'Wireless Mouse', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
  { PRODUCT_ID: 6, VARIANT_ID: 17, SELLER_ID: 27, PRODUCT_NAME: 'laptop', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
  { PRODUCT_ID: 10, VARIANT_ID: 18, SELLER_ID: 28, PRODUCT_NAME: 'lenovo S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
];

// CHANGED (new): the viewed product's own request.
function productUrl(productId: number): string {
  return `/api/products/get?PRODUCT_ID=${productId}`;
}

describe('ProductDetail', () => {
  let fixture: ComponentFixture<ProductDetail>;
  let component: ProductDetailHarness;
  let http: HttpTestingController;

  /** Answers products/get?PRODUCT_ID=<id> with that product's row (the API sends one per variant). */
  function flushProduct(productId: number): void {
    http.expectOne(productUrl(productId)).flush({
      status: 'SUCCESS',
      data: PRODUCT_ROWS.filter((row) => row['PRODUCT_ID'] === productId),
    });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProductDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('id', '3');
    fixture.detectChanges();
    // CHANGED: the full catalog (for "You may also like") and the viewed product are separate requests.
    http.expectOne((request) => request.url.endsWith('/products/get') && !request.params.has('PRODUCT_ID'))
      .flush({ status: 'SUCCESS', data: PRODUCT_ROWS });
    flushProduct(3);
    // CHANGED: product 3 has no variants, so the existing tests below see today's page.
    http.expectOne(variantUrl(3)).flush({ status: 'SUCCESS', data: [] });
    // CHANGED: the category name comes from the public (cached) category lookup.
    http.expectOne((request) => request.url.endsWith('/all_category/get')).flush({
      status: 'SUCCESS',
      data: [{ CATEGORY_ID: 1, CATEGORY_NAME: 'Electronics' }, { CATEGORY_ID: 3, CATEGORY_NAME: 'Fashion' }],
    });
    fixture.detectChanges();
    component = fixture.componentInstance as unknown as ProductDetailHarness;
  });

  // CHANGED (new): DOM helpers for the variant tests.
  const text = (selector: string): string =>
    (fixture.nativeElement.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector) as NodeListOf<HTMLElement>, (element) =>
      (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  const cards = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('app-product-variant-selector .variant-selector__card'));
  /** [name, stock note] of each variant card. */
  const cardLabels = (): [string, string][] =>
    cards().map((card) => [
      card.querySelector('.variant-selector__card-name')?.textContent?.trim() ?? '',
      card.querySelector('.variant-selector__card-stock')?.textContent?.trim() ?? '',
    ]);
  const optionButtons = (key: string): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(`[aria-labelledby="variant-option-${key}"] button`));
  /** [value, state] of each colour swatch / size or material chip. */
  const optionChoices = (key: string): [string, string][] =>
    optionButtons(key).map((button) => [
      (button.querySelector('.variant-selector__swatch-name') ?? button).textContent?.replace('(out of stock)', '').trim() ?? '',
      ['is-active', 'is-out', 'is-unavailable'].filter((name) => button.classList.contains(name)).join(' ') || 'available',
    ]);
  const chooseOption = (key: string, value: string): void => {
    optionButtons(key).find((button) => button.textContent?.includes(value))?.click();
    fixture.detectChanges();
  };
  /** [price, struck-through price, discount badge] of the buy box. */
  const priceParts = (): string[] =>
    ['.product-detail__price strong', '.product-detail__price del', '.product-detail__price app-badge'].map(text);
  const actionButtons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.product-detail__actions button'));
  const mainImage = (): string =>
    (fixture.nativeElement.querySelector('app-product-gallery .gallery__main img') as HTMLImageElement).getAttribute('src') ?? '';
  const openTab = (id: string): void => {
    (fixture.nativeElement.querySelector(`#tab-${id}`) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  /** Opens product 5 ("Wireless Mouse", ₹799, seller 26) and answers its variants request. */
  function openProduct5(response: object = { status: 'SUCCESS', data: PRODUCT_5_VARIANTS }): void {
    fixture.componentRef.setInput('id', '5');
    fixture.detectChanges();
    flushProduct(5);
    http.expectOne(variantUrl(5)).flush(response);
    fixture.detectChanges();
  }

  it('renders the product with price, discount and four related products', () => {
    expect(fixture.nativeElement.textContent).toContain('Samsung Galaxy S25');
    expect(component.discountPercent()).toBe(6);
    expect(component.related().length).toBe(4);
    expect(component.related().some((item) => item.id === '3')).toBe(false);
  });

  it('inserts the selected product and its actual variant ID into the cart', () => {
    const auth = TestBed.inject(AuthService);
    auth.setSession(
      { id: '3', email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
      tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 4 }),
    );

    component.addToCart();
    const insert = http.expectOne('/api/shopping_cart/insert');
    expect(insert.request.body).toMatchObject({
      PRODUCT_ID: 3,
      SELLER_ID: 24,
      PRODUCT_VARIANT_ID: 14,
      CUSTOMER_ID: 4,
      UNIT_PRICE: 75000,
    });
    insert.flush('Shopping cart item added successfully');
    http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=4').flush({ success: true, data: [] });

    expect(component.addedToCart()).toBe(true);
  });

  it('keeps quantity between 1 and the units left', () => {
    component.changeQuantity(-1);
    expect(component.quantity()).toBe(1);
    for (let i = 0; i < 10; i++) component.changeQuantity(1);
    expect(component.quantity()).toBe(5);
  });

  it('validates the delivery pincode', () => {
    component.updatePincode(inputEvent('12ab'));
    component.checkDelivery();
    expect(component.deliveryMessage()?.ok).toBe(false);
    component.updatePincode(inputEvent('632004'));
    component.checkDelivery();
    expect(component.deliveryMessage()?.ok).toBe(true);
  });

  it('turns the gallery heart red and back when toggling the wishlist', () => {
    const heart = (): HTMLElement => fixture.nativeElement.querySelector('app-product-gallery .gallery__wish');
    expect(heart().classList.contains('is-active')).toBe(false);

    component.toggleWishlist();
    fixture.detectChanges();
    expect(heart().classList.contains('is-active')).toBe(true);
    expect(heart().textContent).toContain('♥');

    component.toggleWishlist();
    fixture.detectChanges();
    expect(heart().classList.contains('is-active')).toBe(false);
    expect(heart().textContent).toContain('♡');
  });

  it('renders related cards with an add-to-cart button each', () => {
    const cards = fixture.nativeElement.querySelectorAll('app-product-card .product-card--aligned');
    expect(cards.length).toBe(4);
  });

  it('shows a not-found state for an unknown product', () => {
    fixture.componentRef.setInput('id', 'does-not-exist');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Product not found');
  });

  // CHANGED (new): the viewed product comes from its own request, not from the full catalog.
  describe('product request', () => {
    const PRODUCT_17_ROW = {
      PRODUCT_ID: 17, SELLER_ID: 24, PRODUCT_NAME: 'Leather Strap Watch', PRICE: '60000.00', SELLING_PRICE: '56666.00',
      STOCK_QUANTITY: 10, MAXIMUM_ORDER_QUANTITY: 5, CATEGORY_ID: 3, IS_ACTIVE: 'ACTIVE',
    };

    function openProduct(id: string): void {
      fixture.componentRef.setInput('id', id);
      fixture.detectChanges();
    }

    it('shows a product that is not in the full catalog, with the variants from product_variant/get', () => {
      openProduct('17');
      expect(text('main[role="status"]')).toBe('Loading product…');

      // One row per variant, as the API sends them.
      http.expectOne(productUrl(17)).flush({
        status: true,
        data: [{ ...PRODUCT_17_ROW, VARIANT_ID: 26 }, { ...PRODUCT_17_ROW, VARIANT_ID: 27 }],
      });
      fixture.detectChanges();
      http.expectOne(variantUrl(17)).flush({
        status: 'SUCCESS',
        message: 'Product variant details fetched successfully',
        data: [variantRow(27, {
          VARIANT_NAME: 'Black Leather Strong', SKU: 'SKU00027', PRICE: '56666.00', STOCK_QUANTITY: 66666,
          PRODUCT_ID: 17, SELLER_ID: 24, SELLER_NAME: 'Arun Kumar', STATUS: 'ACTIVE',
        })],
      });
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('Product not found');
      expect(text('h1')).toBe('Leather Strap Watch');
      expect(fixture.nativeElement.textContent).toContain('Black Leather Strong');
    });

    it('shows "Product not found" only when the API returns no active product with that ID', () => {
      openProduct('42');
      http.expectOne(productUrl(42)).flush({ status: 'SUCCESS', data: [] });
      http.expectOne(variantUrl(42)).flush({ status: 'SUCCESS', data: [] });
      fixture.detectChanges();
      expect(text('main h1')).toBe('Product not found');

      openProduct('17');
      http.expectOne(productUrl(17)).flush({ status: 'SUCCESS', data: [{ ...PRODUCT_17_ROW, IS_ACTIVE: 'INACTIVE' }] });
      http.expectOne(variantUrl(17)).flush({ status: 'SUCCESS', data: [] });
      fixture.detectChanges();
      expect(text('main h1')).toBe('Product not found');
    });

    it('shows the API error with Try again, and loads the product on retry', () => {
      openProduct('17');
      http.expectOne(productUrl(17)).flush({ message: 'Products are unavailable.' }, { status: 500, statusText: 'Server Error' });
      http.expectOne(variantUrl(17)).flush({ status: 'SUCCESS', data: [] });
      fixture.detectChanges();
      expect(text('main app-alert')).toContain('Products are unavailable.');

      (fixture.nativeElement.querySelector('.product-detail__retry') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(productUrl(17)).flush({ status: true, data: [{ ...PRODUCT_17_ROW, VARIANT_ID: 26 }] });
      fixture.detectChanges();
      expect(text('h1')).toBe('Leather Strap Watch');
    });
  });

  // CHANGED (new): Product Variant Details.
  describe('variants', () => {
    // CHANGED: no Variants tab any more; the page simply shows no variant picker or variant details.
    it('keeps today\'s page for a product without variants', () => {
      expect(fixture.nativeElement.querySelector('app-product-variant-selector, app-product-variant-details')).toBeNull();
      expect(priceParts()).toEqual(['₹75,000', '₹80,000', '6% OFF']);
    });

    it('loads only the viewed product\'s ACTIVE variants and selects the first one in stock', () => {
      openProduct5();

      expect(cardLabels()).toEqual([
        ['Black Leather dongle', 'Out of stock'],
        ['Brown', 'Only 3 left'],
        ['Grey', 'In stock'],
      ]);
      expect(cards().map((card) => card.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
      // The variant's PRICE, without the product's struck-through price or "% OFF".
      expect(priceParts()).toEqual(['₹899', '', '']);
      expect(text('.product-detail__quantity app-badge')).toBe('In stock (Only 3 left)');
      // Quantity is limited by the variant's stock.
      for (let i = 0; i < 10; i++) component.changeQuantity(1);
      expect(component.quantity()).toBe(3);
    });

    it('shows colour swatches, size and material chips built from the variants, with the selected values', () => {
      openProduct5();

      expect(texts('app-product-variant-selector .variant-selector__label')).toEqual([
        'Colour: Brown', 'Size: M', 'Material: Leather', 'Variant: Brown (3 available)',
      ]);
      // Black (with Brown's material) is out of stock; Grey only comes in size L, so it is not offered with M.
      expect(optionChoices('colour')).toEqual([['Black', 'is-out'], ['Brown', 'is-active'], ['Grey', 'is-unavailable']]);
      expect(optionChoices('size')).toEqual([['M', 'is-active'], ['L', 'is-unavailable']]);
      expect(optionChoices('material')).toEqual([['Leather', 'is-active']]);
    });

    it('chooses the matching variant from a colour or size and updates the page', () => {
      openProduct5();

      chooseOption('colour', 'Grey');
      expect(priceParts()).toEqual(['₹850', '', '']);
      expect(texts('app-product-variant-selector .variant-selector__label').slice(0, 3)).toEqual([
        'Colour: Grey', 'Size: L', 'Material: -',
      ]);
      expect(cards().map((card) => card.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true']);

      chooseOption('size', 'M');
      expect(priceParts()).toEqual(['₹899', '', '']);
      expect(text('app-product-variant-details .variant-details__name')).toBe('Brown');

      chooseOption('colour', 'Black');
      expect(text('.product-detail__quantity app-badge')).toBe('Out of stock');
      expect(actionButtons().map((button) => button.disabled)).toEqual([true, true]);
    });

    it('updates price, image and stock for the clicked variant and disables the buttons when it is out of stock', () => {
      openProduct5();

      cards()[0].click();
      fixture.detectChanges();

      expect(text('.product-detail__price')).toBe('₹40,000');
      expect(mainImage()).toBe('/uploads/Screenshot%202026-10-21%20151737.png');
      expect(text('.product-detail__quantity app-badge')).toBe('Out of stock');
      expect(actionButtons().map((button) => button.disabled)).toEqual([true, true]);

      // A variant image missing on the server falls back to the product image.
      (fixture.nativeElement.querySelector('app-product-gallery .gallery__main img') as HTMLImageElement)
        .dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(mainImage()).toBe('/images/latest-gadgets.svg');

      cards()[2].click();
      fixture.detectChanges();
      expect(text('.product-detail__price')).toBe('₹850');
      expect(actionButtons().map((button) => button.disabled)).toEqual([false, false]);
    });

    it('adds the selected variant with its VARIANT_ID, PRICE and SELLER_ID, else the product\'s seller', () => {
      TestBed.inject(AuthService).setSession(
        { id: '3', email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
        tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 4 }),
      );
      openProduct5();

      component.changeQuantity(1);
      component.addToCart();
      const insert = http.expectOne('/api/shopping_cart/insert');
      expect(insert.request.body).toMatchObject({
        PRODUCT_ID: 5, SELLER_ID: 44, PRODUCT_VARIANT_ID: 32, QUANTITY: 2, UNIT_PRICE: 899, TOTAL_AMOUNT: 1798,
      });
      insert.flush('Shopping cart item added successfully');
      http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=4').flush({ success: true, data: [] });
      fixture.detectChanges();

      // "Grey" has no SELLER_ID, so the product's seller (26) is sent.
      cards()[2].click();
      fixture.detectChanges();
      component.addToCart();
      expect(http.expectOne('/api/shopping_cart/insert').request.body).toMatchObject({
        PRODUCT_ID: 5, SELLER_ID: 26, PRODUCT_VARIANT_ID: 33, UNIT_PRICE: 850,
      });
    });

    it('disables the buttons while loading, then shows an error with Retry and today\'s cart behaviour', () => {
      fixture.componentRef.setInput('id', '5');
      fixture.detectChanges();
      flushProduct(5);
      expect(text('.product-detail__info > p[role="status"]')).toBe('Loading variants…');
      expect(actionButtons().map((button) => button.disabled)).toEqual([true, true]);

      http.expectOne(variantUrl(5)).flush({ status: 'FAILURE', message: 'Variants are unavailable' });
      fixture.detectChanges();
      expect(text('.product-detail__info app-alert')).toBe('Variants are unavailable Try again');
      expect(cards()).toHaveLength(0);
      expect(priceParts()).toEqual(['₹799', '₹999', '20% OFF']);
      expect(actionButtons().map((button) => button.disabled)).toEqual([false, false]);

      (fixture.nativeElement.querySelector('.product-detail__info app-alert button') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(variantUrl(5)).flush({ status: 'SUCCESS', data: PRODUCT_5_VARIANTS });
      fixture.detectChanges();
      expect(cards()).toHaveLength(3);
    });

    // CHANGED (new): replaces the Variants tab table test.
    it('shows the selected variant\'s details with "-" for empty values and image fallbacks', () => {
      openProduct5();
      const facts = (): string[] => texts('app-product-variant-details .variant-details__facts dt, app-product-variant-details .variant-details__facts dd');
      const detailsImage = (): HTMLImageElement => fixture.nativeElement.querySelector('app-product-variant-details img');
      const cardImages = (): (string | null)[] =>
        cards().map((card) => card.querySelector('img')?.getAttribute('src') ?? null);

      expect(text('app-product-variant-details .variant-details__name')).toBe('Brown');
      expect(text('app-product-variant-details .variant-details__options')).toBe('Brown / M / Leather');
      expect(text('app-product-variant-details .variant-details__price')).toBe('₹899');
      expect(text('app-product-variant-details app-badge')).toBe('Only 3 left');
      expect(facts()).toEqual(['SKU', 'SKU00032', 'Barcode', '8901234', 'Weight', '0.25', 'Sold by', 'Arun Kumar']);
      // Brown has no VARIANT_IMAGE, so the product image is shown.
      expect(detailsImage().getAttribute('src')).toBe('/images/latest-gadgets.svg');
      expect(cardImages()).toEqual([
        '/uploads/Screenshot%202026-10-21%20151737.png',
        '/images/latest-gadgets.svg',
        '/images/latest-gadgets.svg',
      ]);

      cards()[2].click();
      fixture.detectChanges();
      expect(facts()).toEqual(['SKU', 'SKU00033', 'Barcode', '-', 'Weight', '-', 'Sold by', '-']);
      expect(text('app-product-variant-details app-badge')).toBe('In stock');

      // A variant image missing on the server falls back to the product image (details card and variant card).
      cards()[0].click();
      fixture.detectChanges();
      expect(detailsImage().getAttribute('src')).toBe('/uploads/Screenshot%202026-10-21%20151737.png');
      detailsImage().dispatchEvent(new Event('error'));
      cards()[0].querySelector('img')?.dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(detailsImage().getAttribute('src')).toBe('/images/latest-gadgets.svg');
      expect(cardImages()[0]).toBe('/images/latest-gadgets.svg');
    });

    it('shows the product facts and the selected variant in Specifications', () => {
      openProduct5();
      openTab('specifications');

      const specs = Array.from(
        fixture.nativeElement.querySelectorAll('app-product-info-tabs .tabs__specs') as NodeListOf<HTMLElement>,
        (list) => Array.from(list.children, (cell) => cell.textContent?.trim()),
      );
      expect(specs).toEqual([
        ['Category', 'Fashion', 'Subcategory', '-', 'Brand', '-'],
        [
          'Variant', 'Brown', 'SKU', 'SKU00032', 'Barcode', '8901234', 'Size', 'M', 'Colour', 'Brown',
          'Material', 'Leather', 'Weight', '0.25', 'Price', '₹899', 'Stock', '3', 'Status', 'Active',
          'Seller', 'Arun Kumar',
        ],
      ]);
    });
  });

  afterEach(() => http.verify());
});
