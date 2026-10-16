import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { ProductVariants } from './product-variants';

interface VariantRow {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  color: string;
  material: string;
  size: string;
  weight: string;
  stock: number;
  price: number;
}

interface VariantForm {
  name: string;
  sku: string;
  barcode: string;
  size: string;
  color: string;
  material: string;
  weight: string;
  price: string;
  stock: string;
}

interface ProductVariantsHarness {
  variants: WritableSignal<VariantRow[]>;
  selected(): VariantRow | null;
  dialog(): 'add' | 'edit' | 'delete' | null;
  form: WritableSignal<VariantForm>;
  openEdit(row: VariantRow): void;
  save(): void;
  close(): void;
}

describe('ProductVariants edit action', () => {
  let fixture: ComponentFixture<ProductVariants>;
  let component: ProductVariantsHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProductVariants] }).compileComponents();
    fixture = TestBed.createComponent(ProductVariants);
    component = fixture.componentInstance as unknown as ProductVariantsHarness;
  });

  it('prefills all variant details and saves the selected row', () => {
    const [selected, untouched] = component.variants();
    component.openEdit(selected);

    expect(component.dialog()).toBe('edit');
    expect(component.form()).toMatchObject({
      name: selected.name,
      sku: selected.sku,
      barcode: selected.barcode,
      size: selected.size,
      color: selected.color,
      material: selected.material,
      weight: selected.weight,
      price: String(selected.price),
      stock: String(selected.stock),
    });

    component.form.update((form) => ({ ...form, name: 'Blue - Large', size: 'L', weight: '0.4', price: '3200', stock: '80' }));
    component.save();

    expect(component.variants().find((variant) => variant.id === selected.id)).toMatchObject({
      name: 'Blue - Large',
      size: 'L',
      weight: '0.4',
      price: 3200,
      stock: 80,
    });
    expect(component.variants().find((variant) => variant.id === untouched.id)).toEqual(untouched);
    expect(component.dialog()).toBeNull();
  });

  it('closes on cancel without changing the selected variant', () => {
    const selected = component.variants()[0];
    component.openEdit(selected);
    component.form.update((form) => ({ ...form, name: 'Unsaved variant' }));
    component.close();

    expect(component.variants().find((variant) => variant.id === selected.id)).toEqual(selected);
    expect(component.dialog()).toBeNull();
  });
});
