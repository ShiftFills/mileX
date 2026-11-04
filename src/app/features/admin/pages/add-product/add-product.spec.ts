import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ProductCatalogService, ProductLookupOption } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';
import { AddProduct } from './add-product';

interface ValidationHarness {
  attemptedSave: { set(value: boolean): void };
  values: { set(value: Record<string, string>): void };
  fieldError(name: string): string | null;
  categoryLookup(): { options: ProductLookupOption[]; status: string };
  brandLookup(): { options: ProductLookupOption[]; status: string };
  taxRateLookup(): { options: ProductLookupOption[]; status: string };
  updateValue(name: string, event: Event): void;
}

describe('AddProduct Pricing & Inventory validation', () => {
  let fixture: ComponentFixture<AddProduct>;
  let validation: ValidationHarness;
  let productCatalog: {
    loadCategories: ReturnType<typeof vi.fn>;
    loadBrands: ReturnType<typeof vi.fn>;
    loadTaxRates: ReturnType<typeof vi.fn>;
    getErrorMessage: ReturnType<typeof vi.fn>;
  };
  let toast: { showError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    productCatalog = {
      loadCategories: vi.fn(() => of([{ id: '1', label: 'Electronics' }])),
      loadBrands: vi.fn(() => of([{ id: '3', label: 'Samsung' }])),
      loadTaxRates: vi.fn(() => of([{ id: '4', label: '18%' }])),
      getErrorMessage: vi.fn((error: unknown) =>
        error instanceof Error ? error.message : 'Lookup failed',
      ),
    };
    toast = { showError: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AddProduct],
      providers: [
        { provide: ProductCatalogService, useValue: productCatalog },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AddProduct);
    validation = fixture.componentInstance as unknown as ValidationHarness;
    validation.attemptedSave.set(true);
    fixture.detectChanges();
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
      taxRate: '4',
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
      hsnCode: '1234', taxRate: '4', sellingPrice: '1200', mrp: '1000',
      stockQuantity: '10', minimumOrderQuantity: '4', maximumOrderQuantity: '2',
    });
    expect(validation.fieldError('sellingPrice')).toBe('Selling price cannot exceed MRP.');
    expect(validation.fieldError('maximumOrderQuantity')).toBe('Maximum order quantity must be at least the minimum order quantity.');
  });

  it('loads master dropdown options and stores the selected ID values', () => {
    expect(productCatalog.loadCategories).toHaveBeenCalledTimes(1);
    expect(productCatalog.loadBrands).toHaveBeenCalledTimes(1);
    expect(productCatalog.loadTaxRates).toHaveBeenCalledTimes(1);
    expect(validation.categoryLookup()).toMatchObject({
      status: 'success',
      options: [{ id: '1', label: 'Electronics' }],
    });
    expect(validation.brandLookup()).toMatchObject({
      status: 'success',
      options: [{ id: '3', label: 'Samsung' }],
    });
    expect(validation.taxRateLookup()).toMatchObject({
      status: 'success',
      options: [{ id: '4', label: '18%' }],
    });

    const categorySelect = fixture.nativeElement.querySelector(
      '#product-category',
    ) as HTMLSelectElement;
    expect(categorySelect.querySelector('option[value="1"]')?.textContent?.trim()).toBe('Electronics');
    categorySelect.value = '1';
    categorySelect.dispatchEvent(new Event('change'));

    const brandSelect = fixture.nativeElement.querySelector('#product-brand') as HTMLSelectElement;
    brandSelect.value = '3';
    brandSelect.dispatchEvent(new Event('change'));
    const taxRateSelect = fixture.nativeElement.querySelector('#product-tax') as HTMLSelectElement;
    expect(taxRateSelect.querySelector('option[value="4"]')?.textContent?.trim()).toBe('18%');
    taxRateSelect.value = '4';
    taxRateSelect.dispatchEvent(new Event('change'));

    expect((fixture.componentInstance as unknown as { valueFor(name: string): string }).valueFor('category')).toBe('1');
    expect((fixture.componentInstance as unknown as { valueFor(name: string): string }).valueFor('brand')).toBe('3');
    expect((fixture.componentInstance as unknown as { valueFor(name: string): string }).valueFor('taxRate')).toBe('4');
  });

  it('shows a lookup error and toast when a master API fails', () => {
    productCatalog.loadCategories.mockReturnValue(throwError(() => new Error('Categories unavailable')));
    const errorFixture = TestBed.createComponent(AddProduct);
    errorFixture.detectChanges();

    const errorComponent = errorFixture.componentInstance as unknown as ValidationHarness;
    expect(errorComponent.categoryLookup()).toMatchObject({
      status: 'error',
      error: 'Categories unavailable',
    });
    expect(toast.showError).toHaveBeenCalledWith('Categories unavailable');
  });
});
