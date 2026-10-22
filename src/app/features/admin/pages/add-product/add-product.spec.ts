import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddProduct } from './add-product';

interface ValidationHarness {
  attemptedSave: { set(value: boolean): void };
  values: { set(value: Record<string, string>): void };
  fieldError(name: string): string | null;
}

describe('AddProduct Pricing & Inventory validation', () => {
  let fixture: ComponentFixture<AddProduct>;
  let validation: ValidationHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AddProduct] }).compileComponents();
    fixture = TestBed.createComponent(AddProduct);
    validation = fixture.componentInstance as unknown as ValidationHarness;
    validation.attemptedSave.set(true);
  });

  it('shows required messages for empty required pricing fields', () => {
    for (const field of [
      'hsnCode', 'taxRate', 'sellingPrice', 'mrp', 'stockQuantity',
      'minimumOrderQuantity', 'maximumOrderQuantity',
    ]) {
      expect(validation.fieldError(field)).toBe('This field is required.');
    }
    expect(validation.fieldError('discount')).toBeNull();
  });

  it('shows format and range messages for invalid values', () => {
    validation.values.set({
      hsnCode: '12A45',
      taxRate: '7%',
      sellingPrice: '-2',
      mrp: '1',
      discount: '101',
      stockQuantity: '1.5',
      minimumOrderQuantity: '0',
      maximumOrderQuantity: '0',
    });

    expect(validation.fieldError('hsnCode')).toContain('valid 4, 6, or 8 digit HSN');
    expect(validation.fieldError('taxRate')).toBe('Please select a valid tax rate.');
    expect(validation.fieldError('sellingPrice')).toBe('Enter a valid selling price greater than 0.');
    expect(validation.fieldError('mrp')).toBeNull();
    expect(validation.fieldError('discount')).toBe('Enter a discount between 0 and 100.');
    expect(validation.fieldError('stockQuantity')).toContain('whole stock quantity');
    expect(validation.fieldError('minimumOrderQuantity')).toContain('minimum order quantity of at least 1');
    expect(validation.fieldError('maximumOrderQuantity')).toContain('maximum order quantity of at least 1');

    validation.values.set({ sellingPrice: '5', mrp: '3' });
    expect(validation.fieldError('mrp')).toBe('MRP must be greater than or equal to the selling price.');
  });

  it('clears errors for valid values and rechecks cross-field price constraints', () => {
    validation.values.set({
      hsnCode: '12345678',
      taxRate: '18%',
      sellingPrice: '800',
      mrp: '1000',
      discount: '0',
      stockQuantity: '0',
      minimumOrderQuantity: '1',
      maximumOrderQuantity: '5',
    });

    for (const field of [
      'hsnCode', 'taxRate', 'sellingPrice', 'mrp', 'discount', 'stockQuantity',
      'minimumOrderQuantity', 'maximumOrderQuantity',
    ]) {
      expect(validation.fieldError(field)).toBeNull();
    }

    validation.values.set({
      hsnCode: '1234', taxRate: '5%', sellingPrice: '1200', mrp: '1000',
      stockQuantity: '10', minimumOrderQuantity: '4', maximumOrderQuantity: '2',
    });
    expect(validation.fieldError('sellingPrice')).toBe('Selling price cannot exceed MRP.');
    expect(validation.fieldError('maximumOrderQuantity')).toBe('Maximum order quantity must be at least the minimum order quantity.');
  });
});
