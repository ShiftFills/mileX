import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AllProducts } from './all-products';

interface ProductRow {
  id: number;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: number;
  status: 'Active' | 'Inactive';
  image: string;
}

interface ProductForm {
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: string;
  status: 'Active' | 'Inactive';
}

interface AllProductsHarness {
  products: WritableSignal<ProductRow[]>;
  visibleRows(): ProductRow[];
  editingProduct(): ProductRow | null;
  editForm: WritableSignal<ProductForm | null>;
  editError(): string;
  openEdit(product: ProductRow): void;
  toggleActionMenu(id: number): void;
  saveEdit(): void;
  closeEdit(): void;
}

describe('AllProducts edit action', () => {
  let fixture: ComponentFixture<AllProducts>;
  let component: AllProductsHarness;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllProducts],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(AllProducts);
    component = fixture.componentInstance as unknown as AllProductsHarness;
  });

  it('opens an edit draft prefilled with the selected product and saves only that product', () => {
    const [selected, untouched] = component.visibleRows();
    component.toggleActionMenu(selected.id);
    component.openEdit(selected);

    expect(component.editingProduct()?.id).toBe(selected.id);
    expect(component.editForm()).toEqual({
      name: selected.name,
      sku: selected.sku,
      category: selected.category,
      brand: selected.brand,
      price: '2500',
      stock: String(selected.stock),
      status: selected.status,
    });

    component.editForm.update((form) => form ? {
      ...form,
      name: 'Edited Earbuds',
      price: '2999',
      stock: '75',
      status: 'Inactive',
    } : form);
    component.saveEdit();

    expect(component.products().find((product) => product.id === selected.id)).toMatchObject({
      name: 'Edited Earbuds',
      price: '₹2,999',
      stock: 75,
      status: 'Inactive',
    });
    expect(component.products().find((product) => product.id === untouched.id)).toEqual(untouched);
    expect(component.editingProduct()).toBeNull();
  });

  it('cancels without changing the product and rejects invalid data', () => {
    const selected = component.visibleRows()[0];
    const original = component.products().find((product) => product.id === selected.id);

    component.openEdit(selected);
    component.editForm.update((form) => form ? { ...form, name: 'Unsaved name' } : form);
    component.closeEdit();
    expect(component.products().find((product) => product.id === selected.id)).toEqual(original);

    component.openEdit(selected);
    component.editForm.update((form) => form ? { ...form, stock: '-1' } : form);
    component.saveEdit();
    expect(component.editError()).toBeTruthy();
    expect(component.editingProduct()?.id).toBe(selected.id);
    expect(component.products().find((product) => product.id === selected.id)).toEqual(original);
  });
});
