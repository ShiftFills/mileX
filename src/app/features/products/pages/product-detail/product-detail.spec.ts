import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProductDetail } from './product-detail';

interface ProductDetailHarness {
  quantity(): number;
  selectionError(): string;
  addedToCart(): boolean;
  selectedSize(): string | null;
  deliveryMessage(): { ok: boolean; text: string } | null;
  discountPercent(): number;
  related(): { id: string }[];
  addToCart(): boolean;
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

describe('ProductDetail', () => {
  let fixture: ComponentFixture<ProductDetail>;
  let component: ProductDetailHarness;
  let http: HttpTestingController;

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
    http.expectOne((request) => request.url.endsWith('/products/get')).flush({
      status: 'SUCCESS',
      data: [
        { PRODUCT_ID: 3, PRODUCT_NAME: 'Samsung Galaxy S25', PRODUCT_DESCRIPTION: 'Samsung smartphone', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 5, CATEGORY_ID: 1, IS_ACTIVE: 1 },
        { PRODUCT_ID: 4, PRODUCT_NAME: 'Wireless Mouse Updated', PRICE: '999.00', SELLING_PRICE: '749.00', STOCK_QUANTITY: 90, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
        { PRODUCT_ID: 5, PRODUCT_NAME: 'Wireless Mouse', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
        { PRODUCT_ID: 6, PRODUCT_NAME: 'laptop', PRICE: '999.00', SELLING_PRICE: '799.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 3, IS_ACTIVE: 1 },
        { PRODUCT_ID: 10, PRODUCT_NAME: 'lenovo S25', PRICE: '80000.00', SELLING_PRICE: '75000.00', STOCK_QUANTITY: 100, MAXIMUM_ORDER_QUANTITY: 10, CATEGORY_ID: 1, IS_ACTIVE: 1 },
      ],
    });
    fixture.detectChanges();
    component = fixture.componentInstance as unknown as ProductDetailHarness;
  });

  it('renders the product with price, discount and four related products', () => {
    expect(fixture.nativeElement.textContent).toContain('Samsung Galaxy S25');
    expect(component.discountPercent()).toBe(6);
    expect(component.related().length).toBe(4);
    expect(component.related().some((item) => item.id === '3')).toBe(false);
  });

  it('allows adding products when the API does not include variant fields', () => {
    expect(component.addToCart()).toBe(true);
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

  afterEach(() => http.verify());
});
