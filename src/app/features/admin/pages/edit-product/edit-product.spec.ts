import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EditProduct } from './edit-product';

interface EditProductHarness {
  valueFor(name: string): string;
  updateValue(name: string, event: Event): void;
  fieldError(name: string): string | null;
  gallery(): { id: number }[];
  hasVariants(): boolean;
  hasVideo(): boolean;
  saved(): boolean;
  attemptedSave(): boolean;
  saveProduct(): void;
  removeImage(image: { id: number }): void;
  removeVideo(): void;
}

function inputEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
}

describe('EditProduct', () => {
  let fixture: ComponentFixture<EditProduct>;
  let component: EditProductHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditProduct],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(EditProduct);
    fixture.componentRef.setInput('id', '1');
    fixture.detectChanges();
    component = fixture.componentInstance as unknown as EditProductHarness;
  });

  it('prefills the form from the selected product', () => {
    expect(component.valueFor('productName')).toBe('Wireless Earbuds');
    expect(component.valueFor('sku')).toBe('MLEX-001');
    expect(component.valueFor('sellingPrice')).toBe('2500');
    expect(component.valueFor('stockQuantity')).toBe('120');
    expect(component.gallery().length).toBe(3);
    expect(component.hasVariants()).toBe(true);
  });

  it('shows a not-found state for an unknown product id', () => {
    fixture.componentRef.setInput('id', '99999');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Product not found');
  });

  it('updates the product when the form is valid', () => {
    component.saveProduct();
    expect(component.saved()).toBe(true);
  });

  it('rejects an invalid selling price and missing dimensions', () => {
    component.updateValue('sellingPrice', inputEvent('9999'));
    component.updateValue('weight', inputEvent(''));
    component.saveProduct();
    expect(component.attemptedSave()).toBe(true);
    expect(component.fieldError('sellingPrice')).toBe('Selling price cannot exceed MRP.');
    expect(component.fieldError('weight')).toBe('This field is required.');
    expect(component.saved()).toBe(false);
  });

  it('requires at least one image but treats the video as optional', () => {
    for (const image of [...component.gallery()]) component.removeImage(image);
    component.removeVideo();
    component.saveProduct();
    expect(component.hasVideo()).toBe(false);
    expect(component.saved()).toBe(false);
  });
});
