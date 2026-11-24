import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { WishlistService } from '@core/services/wishlist.service';
import { ProductDetail } from './product-detail';

interface ProductDetailHarness {
  quantity(): number;
  selectionError(): string;
  addedToCart(): boolean;
  selectedSize(): string | null;
  deliveryMessage(): { ok: boolean; text: string } | null;
  discountLabel(): string;
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
// CHANGED: the Product View asks for active products only (STATUS=ACTIVE).
function productUrl(productId: number): string {
  return `/api/products/get?PRODUCT_ID=${productId}&STATUS=ACTIVE`;
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

  // CHANGED (new): product, variant and related-product images from S3 (s3/images/<key> on the S3 API base).
  describe('S3 images', () => {
    const SIGNED = (key: string, version = 1) =>
      `https://bucket.s3.ap-south-1.amazonaws.com/${key}?X-Amz-Signature=sig${version}`;
    const flushImage = (key: string, version = 1) => {
      http.expectOne(`/api/s3/images/${key}`).flush({
        success: true, folderName: key.split('/')[0], fileName: key.split('/')[1], imageKey: key,
        imageUrl: SIGNED(key, version), expiresIn: 3600,
      });
      fixture.detectChanges();
    };
    const openS3Product = (variants: Record<string, unknown>[] = []) => {
      fixture.componentRef.setInput('id', '7');
      fixture.detectChanges();
      http.expectOne(productUrl(7)).flush({
        status: 'SUCCESS',
        data: [{ ...PRODUCT_ROWS[0], PRODUCT_ID: 7, PRODUCT_NAME: 'iPhone 16 Pro', PRODUCT_IMAGE: 'products/9210.png' }],
      });
      fixture.detectChanges();
      http.expectOne(variantUrl(7)).flush({ status: 'SUCCESS', data: variants });
      fixture.detectChanges();
    };
    const galleryPlaceholder = () =>
      fixture.nativeElement.querySelector('app-product-gallery .gallery__placeholder') as HTMLElement | null;

    it('shows the product\'s own S3 image in the gallery, with a loading placeholder until its URL arrives', () => {
      openS3Product();
      expect(galleryPlaceholder()?.classList.contains('is-loading')).toBe(true);
      expect(galleryPlaceholder()?.getAttribute('aria-label')).toBe('Loading image of iPhone 16 Pro');

      flushImage('products/9210.png');

      expect(mainImage()).toBe(SIGNED('products/9210.png'));
      expect(mainImage()).not.toContain('latest-gadgets');
    });

    it('shows a selected variant\'s own S3 image first, and in its variant card and details', () => {
      openS3Product([
        variantRow(71, { PRODUCT_ID: 7, VARIANT_NAME: 'Blue', STOCK_QUANTITY: 4, VARIANT_IMAGE: 'variants/blue.png' }),
        variantRow(72, { PRODUCT_ID: 7, VARIANT_NAME: 'Plain', STOCK_QUANTITY: 4 }),
      ]);
      flushImage('products/9210.png');
      flushImage('variants/blue.png');

      expect(mainImage()).toBe(SIGNED('variants/blue.png'));
      const cardImages = cards().map((card) => card.querySelector('img')?.getAttribute('src'));
      // The variant without an image shows the product's own image.
      expect(cardImages).toEqual([SIGNED('variants/blue.png'), SIGNED('products/9210.png')]);
      expect((fixture.nativeElement.querySelector('app-product-variant-details img') as HTMLImageElement).getAttribute('src'))
        .toBe(SIGNED('variants/blue.png'));
    });

    it('gets one fresh URL when the gallery image fails to display, then shows the placeholder', () => {
      openS3Product();
      flushImage('products/9210.png');

      (fixture.nativeElement.querySelector('app-product-gallery .gallery__main img') as HTMLImageElement)
        .dispatchEvent(new Event('error'));
      fixture.detectChanges();
      flushImage('products/9210.png', 2);
      expect(mainImage()).toBe(SIGNED('products/9210.png', 2));

      (fixture.nativeElement.querySelector('app-product-gallery .gallery__main img') as HTMLImageElement)
        .dispatchEvent(new Event('error'));
      fixture.detectChanges();
      http.expectNone((request) => request.url.includes('/s3/images/'));
      expect(galleryPlaceholder()?.getAttribute('aria-label')).toBe('No image for iPhone 16 Pro');
    });

    it('shows the placeholder when the image API fails', () => {
      openS3Product();
      http.expectOne('/api/s3/images/products/9210.png').flush('Server error', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(galleryPlaceholder()?.getAttribute('aria-label')).toBe('No image for iPhone 16 Pro');
    });
  });

  it('renders the product with price, discount and four related products', () => {
    expect(fixture.nativeElement.textContent).toContain('Samsung Galaxy S25');
    // The same "N% OFF" the listing cards show: PRICE 80000, SELLING_PRICE 75000 -> 6% OFF.
    expect(component.discountLabel()).toBe('6% OFF');
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

  // CHANGED: the heart goes through the wishlist API; a signed-out visitor is sent to Login first.
  it('sends a signed-out visitor to Login from the gallery heart', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const heart = (): HTMLElement => fixture.nativeElement.querySelector('app-product-gallery .gallery__wish');

    component.toggleWishlist();
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledWith(['/auth/login'], expect.objectContaining({ queryParams: expect.any(Object) }));
    expect(heart().classList.contains('is-active')).toBe(false);
  });

  it('turns the gallery heart red after wishlist/save_for_later and back after the saved row is removed', () => {
    TestBed.inject(AuthService).setSession(
      { id: '3', email: '', firstName: 'pooja123', lastName: '', userType: 'CUSTOMER' },
      tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 4 }),
    );
    const heart = (): HTMLElement => fixture.nativeElement.querySelector('app-product-gallery .gallery__wish');
    // Product 3 (no variants) is in the customer's cart as CART_ID 81 (read once by the hearts).
    TestBed.inject(WishlistService).sync();
    http.expectOne('/api/shopping_cart/get?CUSTOMER_ID=4').flush({
      success: true,
      data: [{ CART_ID: 81, PRODUCT_ID: 3, SELLER_ID: 24, CART_QUANTITY: 1, UNIT_PRICE: '75000.00', CUSTOMER_ID: 4, SAVE_FOR_LATER: 0, PRODUCT_NAME: 'Samsung Galaxy S25' }],
    });
    http.expectOne('/api/products/get?PRODUCT_ID=3').flush({ status: 'SUCCESS', data: [PRODUCT_ROWS[0]] });
    fixture.detectChanges();
    expect(heart().classList.contains('is-active')).toBe(false);

    // wishlist/save_for_later with that row's CART_ID and its VARIANT_ID (null: no variant); no cart insert.
    component.toggleWishlist();
    http.expectNone('/api/shopping_cart/insert');
    const save = http.expectOne('/api/wishlist/save_for_later');
    expect(save.request.body).toEqual({ CART_ID: 81, VARIANT_ID: null });
    save.flush('Saved for later');
    fixture.detectChanges();
    expect(heart().classList.contains('is-active')).toBe(true);
    expect(heart().textContent).toContain('♥');

    component.toggleWishlist();
    const remove = http.expectOne('/api/shopping_cart/delete');
    expect(remove.request.body).toEqual({ CART_ID: 81, PRODUCT_ID: 3, SELLER_ID: 24, CUSTOMER_ID: 4 });
    remove.flush('Cart item deleted successfully');
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
      // CHANGED: product 5 has no image, so the gallery shows its placeholder (it used to show the stock image).
      (fixture.nativeElement.querySelector('app-product-gallery .gallery__main img') as HTMLImageElement)
        .dispatchEvent(new Event('error'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-product-gallery .gallery__placeholder')?.getAttribute('aria-label'))
        .toBe('No image for Wireless Mouse');

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

    // CHANGED (new): the gallery heart sends PUT wishlist/save_for_later { CART_ID, VARIANT_ID } only (no cart insert),
    // with the variant chosen on this page (it could send VARIANT_ID null).
    describe('gallery heart', () => {
      const heartButton = (): HTMLButtonElement =>
        fixture.nativeElement.querySelector('app-product-gallery .gallery__wish button');
      const CART_URL = '/api/shopping_cart/get?CUSTOMER_ID=4';

      /** Reads the customer's cart (shopping_cart/get) with these rows of product 5. */
      function syncCart(rows: Record<string, unknown>[]): void {
        TestBed.inject(WishlistService).sync();
        http.expectOne(CART_URL).flush({
          success: true,
          data: rows.map((row) => ({
            PRODUCT_ID: 5, SELLER_ID: 44, CART_QUANTITY: 1, UNIT_PRICE: '899.00', CUSTOMER_ID: 4, SAVE_FOR_LATER: 0,
            PRODUCT_NAME: 'Wireless Mouse', ...row,
          })),
        });
        // The cart's product-status lookup (once per product).
        for (const lookup of http.match('/api/products/get?PRODUCT_ID=5')) lookup.flush({ status: true, data: [PRODUCT_ROWS[2]] });
      }

      /** Taps the heart and returns the PUT wishlist/save_for_later body; no other cart call is made first. */
      function tapHeart(): unknown {
        component.toggleWishlist();
        http.expectNone('/api/shopping_cart/insert');
        const save = http.expectOne('/api/wishlist/save_for_later');
        expect(save.request.method).toBe('PUT');
        const body = save.request.body as { CART_ID: number | null };
        save.flush('Saved for later');
        // Sent without a CART_ID: the cart is read again to see whether it was saved (here it was not).
        if (body.CART_ID === null) http.expectOne(CART_URL).flush({ success: true, data: [] });
        fixture.detectChanges();
        return body;
      }

      beforeEach(() => {
        TestBed.inject(AuthService).setSession(
          { id: '3', email: '', firstName: 'customer', lastName: '', userType: 'CUSTOMER' },
          tokenWithClaims({ USER_ID: 3, CUSTOMER_ID: 4 }),
        );
      });

      it('sends the CART_ID of the selected variant\'s cart row with its VARIANT_ID', () => {
        openProduct5();
        syncCart([{ CART_ID: 59, VARIANT_ID: 32 }]);
        // Brown (32), the first in stock, is in the cart as CART_ID 59.
        expect(tapHeart()).toEqual({ CART_ID: 59, VARIANT_ID: 32 });
      });

      it('sends the variant the customer picks; CART_ID null when that variant is not in the cart', () => {
        openProduct5();
        syncCart([{ CART_ID: 59, VARIANT_ID: 32 }]);
        cards()[2].click();
        fixture.detectChanges();
        // Grey (33) is not in the cart (the row of Brown is not used for it).
        expect(tapHeart()).toEqual({ CART_ID: null, VARIANT_ID: 33 });
      });

      it('sends the only variant of a product that has one, even when it is out of stock', () => {
        openProduct5({ status: 'SUCCESS', data: [PRODUCT_5_VARIANTS[0]] });
        syncCart([]);
        expect(tapHeart()).toEqual({ CART_ID: null, VARIANT_ID: 31 });
      });

      it('is off while the variants load, and uses the product\'s own VARIANT_ID when they cannot be loaded', () => {
        fixture.componentRef.setInput('id', '5');
        fixture.detectChanges();
        flushProduct(5);
        syncCart([]);
        expect(heartButton().disabled).toBe(true);
        component.toggleWishlist();
        http.expectNone('/api/wishlist/save_for_later');

        http.expectOne(variantUrl(5)).flush({ status: 'FAILURE', message: 'Variants are unavailable' });
        fixture.detectChanges();
        expect(heartButton().disabled).toBe(false);
        // Product 5's products/get row: VARIANT_ID 16 (the variant Add to Cart sends too).
        expect(tapHeart()).toEqual({ CART_ID: null, VARIANT_ID: 16 });
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
