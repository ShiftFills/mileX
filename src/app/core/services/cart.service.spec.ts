import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { ProductCatalogService } from './product-catalog.service';
import { CartService } from './cart.service';

const PRODUCTS_RESPONSE = {
  status: 'SUCCESS',
  data: [
    { PRODUCT_ID: 3, PRODUCT_NAME: 'Samsung Galaxy S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 5, CATEGORY_ID: 1, IS_ACTIVE: 1 },
    { PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse Updated', PRICE: '999.00', SELLING_PRICE: '749.00', STOCK_QUANTITY: 90, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
    { PRODUCT_ID: 5, PRODUCT_NAME: 'Wireless Mouse', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
    { PRODUCT_ID: 6, PRODUCT_NAME: 'laptop', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
    { PRODUCT_ID: 10, PRODUCT_NAME: 'lenovo S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
  ],
};

function productById(catalog: ProductCatalogService, id: string) {
  const product = catalog.findById(id);
  if (!product) throw new Error(`Expected product "${id}" in the catalog.`);
  return product;
}

describe('CartService', () => {
  let cart: CartService;
  let catalog: ProductCatalogService;
  let http: HttpTestingController;

  // CHANGED: CartService no longer loads the catalog itself; a page does, so the tests load it here.
  function loadProducts(): void {
    catalog.load();
    http.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);
  }

  /** Answers the product-status lookup CartService sends for an API cart row's product (CHANGED (new)). */
  function answerStatus(productId: number, isActive: 'ACTIVE' | 'INACTIVE' = 'ACTIVE'): void {
    http.expectOne(`/api/products/get?PRODUCT_ID=${productId}`).flush({
      status: true,
      data: [{ PRODUCT_ID: productId, PRODUCT_NAME: 'Product', SELLING_PRICE: '749.00', IS_ACTIVE: isActive }],
    });
  }

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.cart);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    cart = TestBed.inject(CartService);
    catalog = TestBed.inject(ProductCatalogService);
    http = TestBed.inject(HttpTestingController);
    loadProducts();
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(STORAGE_KEYS.cart);
  });

  it('keeps cart state and derived totals synchronized after add, quantity update, and remove', () => {
    const product = productById(catalog, '4');

    cart.add(product, 2);
    expect(cart.count()).toBe(2);
    expect(cart.subtotal()).toBe(1498);
    expect(cart.shippingCost()).toBe(0);
    expect(cart.total()).toBe(1498);

    cart.add(product);
    expect(cart.items()).toHaveLength(1);
    expect(cart.count()).toBe(3);

    cart.setQuantity(product.id, 1);
    expect(cart.count()).toBe(1);
    expect(cart.subtotal()).toBe(749);

    cart.remove(product.id);
    expect(cart.items()).toEqual([]);
    expect(cart.count()).toBe(0);
    expect(cart.total()).toBe(0);
  });

  it('restores persisted item IDs using the latest API product values', () => {
    const product = productById(catalog, '4');
    cart.add(product, 2);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) ?? 'null') as {
      product: { id: string; price: number };
      quantity: number;
    }[];
    expect(stored).toHaveLength(1);
    stored[0]!.product.price = 1;
    localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(stored));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restoredCart = TestBed.inject(CartService);
    const controller = TestBed.inject(HttpTestingController);
    TestBed.inject(ProductCatalogService).load();
    controller.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);

    expect(restoredCart.count()).toBe(2);
    expect(restoredCart.items()[0]?.product.id).toBe(product.id);
    expect(restoredCart.subtotal()).toBe(product.price * 2);
    controller.verify();
  });

  // CHANGED (new): the storefront header creates CartService on every page, including the Home page.
  it('does not request the product catalog by itself, but counts saved rows for the header badge', () => {
    localStorage.setItem(
      STORAGE_KEYS.cart,
      JSON.stringify([{ product: { id: '4' }, quantity: 2 }, { product: { id: '5' }, quantity: 1 }]),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restoredCart = TestBed.inject(CartService);
    const controller = TestBed.inject(HttpTestingController);

    controller.expectNone((request) => request.url.endsWith('/products/get'));
    expect(restoredCart.badgeCount()).toBe(3);
    // Totals only include restored rows, so they are unchanged until the catalog is loaded.
    expect(restoredCart.count()).toBe(0);
    expect(restoredCart.items()).toEqual([]);

    // A page that shows the cart loads the catalog, which restores the rows with the latest values.
    TestBed.inject(ProductCatalogService).load();
    controller.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);
    expect(restoredCart.items().map((item) => [item.product.id, item.quantity])).toEqual([['4', 2], ['5', 1]]);
    expect(restoredCart.count()).toBe(3);
    expect(restoredCart.badgeCount()).toBe(3);
    controller.verify();
  });

  it('ignores invalid quantities, out-of-stock products, and quantities above order limits', () => {
    const product = productById(catalog, '3');

    cart.add(product, 6);
    expect(cart.items()).toEqual([]);

    cart.add(product, 5);
    cart.add({ ...product, inStock: false });
    cart.setQuantity(product.id, 6);
    cart.setQuantity(product.id, 0);

    expect(cart.items()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.cart)).toBe('[]');
  });

  it('waives shipping above the free shipping threshold', () => {
    cart.add(productById(catalog, '3'));
    expect(cart.shippingCost()).toBe(0);
    expect(cart.total()).toBe(75000);
  });

  it('drops persisted cart entries that are no longer in the API catalog', () => {
    localStorage.setItem(
      STORAGE_KEYS.cart,
      JSON.stringify([{ product: { id: 'legacy-demo-product' }, quantity: 1 }]),
    );

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const restoredCart = TestBed.inject(CartService);
    const controller = TestBed.inject(HttpTestingController);
    TestBed.inject(ProductCatalogService).load();
    controller.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);

    expect(restoredCart.items()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) ?? 'null')).toEqual([]);
    controller.verify();
  });

  it('merges fetched cart items with existing local items and replaces local duplicates', () => {
    const localProduct = productById(catalog, '4');
    const fetchedItem = {
      product: { ...localProduct, name: 'Server product', price: 600 },
      quantity: 2,
      apiDetails: {
        cartId: '70',
        sellerId: 12,
        customerId: 3,
        originalQuantity: 2,
        unitPrice: 600,
        cartDiscount: 50,
        productDiscount: 0,
        tax: 45,
        totalAmount: 945,
        saveForLater: false,
      },
    };

    cart.mergeFetchedItems([fetchedItem]);
    answerStatus(4);

    expect(cart.items()).toEqual([fetchedItem]);
    expect(cart.count()).toBe(2);
    expect(cart.subtotal()).toBe(1200);
  });

  // CHANGED (new): an inactive (delisted) product already in the cart.
  describe('delisted products', () => {
    function apiRow(productId: string, cartId: string, quantity: number) {
      const product = productById(catalog, productId);
      return {
        product,
        quantity,
        apiDetails: {
          cartId, sellerId: 12, customerId: 3, originalQuantity: quantity, unitPrice: product.price,
          cartDiscount: 0, productDiscount: 0, tax: 0, totalAmount: product.price * quantity, saveForLater: false,
        },
      };
    }

    it('marks an inactive product\'s row, leaves it out of the totals and blocks checkout until it is removed', () => {
      cart.mergeFetchedItems([apiRow('4', '70', 2), apiRow('5', '71', 1)]);
      expect(cart.subtotal()).toBe(749 * 2 + 799);
      answerStatus(4);
      answerStatus(5, 'INACTIVE');

      const delisted = cart.items().find((item) => item.product.id === '5');
      expect(delisted?.product).toMatchObject({ isActive: false, inStock: false });
      expect(cart.hasDelistedItems()).toBe(true);
      expect(cart.hasUnavailableItems()).toBe(true);
      expect(cart.purchasableItems().map((item) => item.product.id)).toEqual(['4']);
      expect(cart.purchasableCount()).toBe(2);
      expect(cart.subtotal()).toBe(749 * 2);
      expect(cart.total()).toBe(749 * 2 + cart.shippingCost());
      // The header badge still counts the row until it is removed.
      expect(cart.count()).toBe(3);

      // The status is remembered: a later cart load marks the row at once, without asking again.
      cart.mergeFetchedItems([apiRow('4', '70', 2), apiRow('5', '71', 1)]);
      http.expectNone((request) => request.params.has('PRODUCT_ID'));
      expect(cart.hasDelistedItems()).toBe(true);

      cart.remove('5', '71');
      expect(cart.hasDelistedItems()).toBe(false);
      expect(cart.hasUnavailableItems()).toBe(false);
    });

    it('keeps a row whose status lookup failed, and asks again on the next cart load', () => {
      cart.mergeFetchedItems([apiRow('4', '70', 1)]);
      http.expectOne('/api/products/get?PRODUCT_ID=4').flush('Server error', { status: 500, statusText: 'Server Error' });
      expect(cart.hasDelistedItems()).toBe(false);
      expect(cart.subtotal()).toBe(749);

      cart.mergeFetchedItems([apiRow('4', '70', 1)]);
      answerStatus(4);
    });
  });

  it('updates and removes an API cart row by CART_ID when product IDs are shared', () => {
    const product = productById(catalog, '4');
    cart.mergeFetchedItems([
      {
        product,
        quantity: 2,
        apiDetails: {
          cartId: '70',
          sellerId: 12,
          customerId: 3,
          originalQuantity: 2,
          unitPrice: product.price,
          cartDiscount: 0,
          productDiscount: 0,
          tax: 0,
          totalAmount: product.price * 2,
          saveForLater: false,
        },
      },
      {
        product: { ...product, variantDetails: 'Blue' },
        quantity: 1,
        apiDetails: {
          cartId: '71',
          sellerId: 12,
          customerId: 3,
          originalQuantity: 1,
          unitPrice: product.price,
          cartDiscount: 0,
          productDiscount: 0,
          tax: 0,
          totalAmount: product.price,
          saveForLater: false,
        },
      },
    ]);
    // One status lookup for the product both rows share.
    answerStatus(4);

    cart.setQuantity(product.id, 3, '71');
    expect(cart.items().map((item) => item.quantity)).toEqual([2, 3]);

    cart.remove(product.id, '70');
    expect(cart.items().map((item) => item.apiDetails?.cartId)).toEqual(['71']);
  });
});
