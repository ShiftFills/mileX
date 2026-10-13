import { TestBed } from '@angular/core/testing';
import { STORAGE_KEYS } from '@core/constants/storage-keys';
import { ProductCatalogService } from './product-catalog.service';
import { CartService } from './cart.service';

function productById(catalog: ProductCatalogService, id: string) {
  const product = catalog.findById(id);
  if (!product) throw new Error(`Expected product "${id}" in the catalog.`);
  return product;
}

describe('CartService', () => {
  let cart: CartService;
  let catalog: ProductCatalogService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.cart);
    TestBed.configureTestingModule({});
    cart = TestBed.inject(CartService);
    catalog = TestBed.inject(ProductCatalogService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEYS.cart);
  });

  it('keeps cart state and derived totals synchronized after add, quantity update, and remove', () => {
    const product = productById(catalog, 'mens-cotton-t-shirt-1');

    cart.add(product, 2);
    expect(cart.count()).toBe(2);
    expect(cart.subtotal()).toBe(998);
    expect(cart.shippingCost()).toBe(99);
    expect(cart.total()).toBe(1097);

    cart.add(product);
    expect(cart.items()).toHaveLength(1);
    expect(cart.count()).toBe(3);

    cart.setQuantity(product.id, 1);
    expect(cart.count()).toBe(1);
    expect(cart.subtotal()).toBe(499);

    cart.remove(product.id);
    expect(cart.items()).toEqual([]);
    expect(cart.count()).toBe(0);
    expect(cart.total()).toBe(0);
  });

  it('persists guest cart data and restores it in a new service instance', () => {
    const product = productById(catalog, 'smart-watch-1');

    cart.add(product, 2);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) ?? 'null') as unknown[];
    expect(stored).toHaveLength(1);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const restoredCart = TestBed.inject(CartService);

    expect(restoredCart.count()).toBe(2);
    expect(restoredCart.items()[0]?.product.id).toBe(product.id);
    expect(restoredCart.subtotal()).toBe(product.price * 2);
  });

  it('ignores invalid quantities and out-of-stock products', () => {
    const product = productById(catalog, 'smart-watch-1');

    cart.add(product, 0);
    cart.add({ ...product, inStock: false });
    cart.setQuantity(product.id, 0);

    expect(cart.items()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEYS.cart)).toBe('[]');
  });
});
