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

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProductDetail],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductDetail);
    fixture.componentRef.setInput('id', 'women-printed-maxi-dress-1');
    fixture.detectChanges();
    component = fixture.componentInstance as unknown as ProductDetailHarness;
  });

  it('renders the product with price, discount and four related products', () => {
    expect(fixture.nativeElement.textContent).toContain('Women Printed Maxi Dress');
    expect(component.discountPercent()).toBe(33);
    expect(component.related().length).toBe(4);
    expect(component.related().some((item) => item.id === 'women-printed-maxi-dress-1')).toBe(false);
  });

  it('requires a size before adding to cart', () => {
    expect(component.addToCart()).toBe(false);
    expect(component.selectionError()).toBe('Please select a size.');
    component.selectSize('M');
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
});
