import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { ProductVariants } from './product-variants';

interface VariantRow {
  id: string;
  name: string;
  imageUrl: string;
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
  page(): number;
  setPage(page: number): void;
  loadStatus(): 'loading' | 'success' | 'error';
  totalCount(): number | null;
}

describe('ProductVariants edit action', () => {
  let fixture: ComponentFixture<ProductVariants>;
  let component: ProductVariantsHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductVariants],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductVariants);
    component = fixture.componentInstance as unknown as ProductVariantsHarness;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const request = http.expectOne((req) => req.url.endsWith('/product_variant/get'));
    expect(request.request.params.get('LIMIT')).toBe('5');
    expect(request.request.params.get('OFFSET')).toBe('0');
    request.flush({
      status: 'SUCCESS',
      data: [
        {
          VARIANT_ID: 21,
          VARIANT_NAME: 'Black - Regular',
          VARIANT_SKU: 'MLEX-001',
          BARCODE: '8901234567890',
          COLOR: 'Black',
          MATERIAL: 'Plastic',
          SIZE: 'M',
          WEIGHT: '0.2',
          STOCK_QUANTITY: 120,
          SELLING_PRICE: 2500,
        },
      ],
      pagination: { totalRecords: 22 },
    });
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('displays the variants returned by the listing API', () => {
    expect(component.loadStatus()).toBe('success');
    expect(component.totalCount()).toBe(22);
    expect(component.variants()).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('variants');
    expect(Array.from(fixture.nativeElement.querySelectorAll('.pagination__nav button') as NodeListOf<HTMLButtonElement>)
      .map((button) => button.textContent?.trim())
      .filter(Boolean)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('loads the next result page with the matching offset', () => {
    component.setPage(2);
    fixture.detectChanges();

    const request = http.expectOne((req) => req.url.endsWith('/product_variant/get'));
    expect(request.request.params.get('LIMIT')).toBe('5');
    expect(request.request.params.get('OFFSET')).toBe('5');
    request.flush({ status: 'SUCCESS', data: [], pagination: { totalRecords: 22 } });

    expect(component.page()).toBe(2);
  });

  it('prefills all variant details and saves the selected row', () => {
    const selected = component.variants()[0];
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
