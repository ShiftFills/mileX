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

  function loadProducts(): void {
    http.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);
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
    controller.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);

    expect(restoredCart.count()).toBe(2);
    expect(restoredCart.items()[0]?.product.id).toBe(product.id);
    expect(restoredCart.subtotal()).toBe(product.price * 2);
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
    controller.expectOne((request) => request.url.endsWith('/products/get')).flush(PRODUCTS_RESPONSE);

    expect(restoredCart.items()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) ?? 'null')).toEqual([]);
    controller.verify();
  });
});
