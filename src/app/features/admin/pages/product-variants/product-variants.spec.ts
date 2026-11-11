import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { of } from 'rxjs';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';
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
  status: string;
}

interface VariantForm {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  size: string;
  sizeId: number | null;
  color: string;
  colorId: number | null;
  material: string;
  materialId: number | null;
  weight: string;
  price: string;
  stock: string;
  status: string;
}

interface ProductVariantsHarness {
  variants: WritableSignal<VariantRow[]>;
  products: WritableSignal<{ id: string; name: string }[]>;
  selectedImage: WritableSignal<File | null>;
  selected(): VariantRow | null;
  dialog(): 'add' | 'edit' | 'delete' | null;
  form: WritableSignal<VariantForm>;
  openAdd(): void;
  openEdit(row: VariantRow): void;
  openDelete(row: VariantRow): void;
  save(): void;
  confirmDelete(): void;
  close(): void;
  isSubmitting(): boolean;
  page(): number;
  setPage(page: number): void;
  loadStatus(): 'loading' | 'success' | 'error';
  totalCount(): number | null;
  sizeDropdownValue(): string;
  setSizeField(event: Event): void;
  colorDropdownValue(): string;
  setColorField(event: Event): void;
  materialDropdownValue(): string;
  setMaterialField(event: Event): void;
  variantLookups(): Record<
    'colours' | 'sizes' | 'materials',
    { status: 'idle' | 'loading' | 'success' | 'error'; options: { id: string; name: string }[]; error: string | null }
  >;
}

function flushVariantLookups(http: HttpTestingController): void {
  const lookups = [
    { path: '/colours/get', idParameter: 'COLOUR_ID', id: 1, nameField: 'COLOUR_NAME', name: 'Black' },
    { path: '/sizes/get', idParameter: 'SIZE_ID', id: 2, nameField: 'SIZE_NAME', name: 'Medium' },
    { path: '/materials/get', idParameter: 'MATERIAL_ID', id: 3, nameField: 'MATERIAL_NAME', name: 'Leather' },
  ];
  for (const lookup of lookups) {
    const request = http.expectOne((req) => req.url.endsWith(lookup.path));
    expect(request.request.params.get(lookup.idParameter)).toBe('-1');
    expect(request.request.params.get('LIMIT')).toBe('10');
    expect(request.request.params.get('OFFSET')).toBe('0');
    request.flush({
      status: 'SUCCESS',
      data: [{ [lookup.idParameter]: lookup.id, [lookup.nameField]: lookup.name }],
    });
  }
}

describe('ProductVariants edit action', () => {
  let fixture: ComponentFixture<ProductVariants>;
  let component: ProductVariantsHarness;
  let http: HttpTestingController;
  let catalog: { loadPage: ReturnType<typeof vi.fn>; getErrorMessage: ReturnType<typeof vi.fn> };
  let toast: { showError: ReturnType<typeof vi.fn>; showSuccess: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    catalog = {
      loadPage: vi.fn(() => of({
        items: [{ id: '4', name: 'Lenovo 110', sellerId: 1 }],
        hasNext: false,
      })),
      getErrorMessage: vi.fn((error: unknown) => error instanceof Error ? error.message : 'Products unavailable'),
    };
    toast = { showError: vi.fn(), showSuccess: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ProductVariants],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProductCatalogService, useValue: catalog },
        { provide: ToastService, useValue: toast },
      ],
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
          PRODUCT_ID: 4,
          SELLER_ID: 6,
          SELLER_NAME: 'Arun Kumar',
          CREATED_BY: 1,
          STATUS: 'ACTIVE',
          VARIANT_SKU: 'MLEX-001',
          VARIANT_IMAGE: 'black_leather.png',
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

  it('loads API-backed dropdown options and maps empty results without static options', () => {
    component.openAdd();
    expect(component.variantLookups().colours.status).toBe('loading');
    expect(component.variantLookups().sizes.status).toBe('loading');
    expect(component.variantLookups().materials.status).toBe('loading');

    for (const path of ['/colours/get', '/sizes/get', '/materials/get']) {
      const request = http.expectOne((req) => req.url.endsWith(path));
      expect(request.request.params.get('LIMIT')).toBe('10');
      expect(request.request.params.get('OFFSET')).toBe('0');
      request.flush({ status: 'SUCCESS', data: [] });
    }

    fixture.detectChanges();
    expect(component.variantLookups().colours).toMatchObject({ status: 'success', options: [] });
    expect(component.variantLookups().sizes).toMatchObject({ status: 'success', options: [] });
    expect(component.variantLookups().materials).toMatchObject({ status: 'success', options: [] });
    expect(fixture.nativeElement.textContent).toContain('No colours available');
    expect(fixture.nativeElement.textContent).toContain('No sizes available');
    expect(fixture.nativeElement.textContent).toContain('No materials available');
  });

  it('loads the API options, displays their names, and preserves existing edit values', () => {
    component.openAdd();
    flushVariantLookups(http);
    fixture.detectChanges();

    expect(component.variantLookups().colours.options).toEqual([{ id: '1', name: 'Black' }]);
    expect(component.variantLookups().sizes.options).toEqual([{ id: '2', name: 'Medium' }]);
    expect(component.variantLookups().materials.options).toEqual([{ id: '3', name: 'Leather' }]);
    expect(fixture.nativeElement.textContent).toContain('Black');
    expect(fixture.nativeElement.textContent).toContain('Medium');
    expect(fixture.nativeElement.textContent).toContain('Leather');

    component.close();
    component.openEdit(component.variants()[0]);
    fixture.detectChanges();
    expect(component.form()).toMatchObject({ size: 'M', color: 'Black', material: 'Plastic' });
    expect(fixture.nativeElement.textContent).toContain('Plastic');
  });

  it('shows lookup errors and retries a failed dropdown request', () => {
    component.openAdd();
    const colours = http.expectOne((req) => req.url.endsWith('/colours/get'));
    const sizes = http.expectOne((req) => req.url.endsWith('/sizes/get'));
    const materials = http.expectOne((req) => req.url.endsWith('/materials/get'));
    colours.flush({ status: 'FAILURE', message: 'Colours unavailable' });
    sizes.flush({ status: 'SUCCESS', data: [] });
    materials.flush({ status: 'SUCCESS', data: [] });
    fixture.detectChanges();

    expect(component.variantLookups().colours.status).toBe('error');
    expect(fixture.nativeElement.textContent).toContain('Colours unavailable');
    const retryButtons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    const retry = Array.from(retryButtons)
      .find((button) => button.textContent?.includes('Retry colours')) as HTMLButtonElement;
    retry.click();

    const retryRequest = http.expectOne((req) => req.url.endsWith('/colours/get'));
    expect(retryRequest.request.params.get('COLOUR_ID')).toBe('-1');
    retryRequest.flush({
      status: 'SUCCESS',
      data: [{ COLOUR_ID: 1, COLOUR_NAME: 'Black' }],
    });
    fixture.detectChanges();
    expect(component.variantLookups().colours).toMatchObject({
      status: 'success',
      options: [{ id: '1', name: 'Black' }],
      error: null,
    });
  });

  it('opens the row menu and routes the selected record to its edit dialog', () => {
    const action = fixture.nativeElement.querySelector('.more') as HTMLButtonElement;
    action.click();
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('.action-menu') as HTMLElement;
    expect(menu).not.toBeNull();
    expect(menu.style.top).not.toBe('');
    expect(menu.style.right).not.toBe('');

    const edit = menu.querySelector('[role="menuitem"]') as HTMLButtonElement;
    edit.click();
    fixture.detectChanges();
    flushVariantLookups(http);
    fixture.detectChanges();
    expect(component.dialog()).toBe('edit');
    expect(component.selected()?.id).toBe('21');
    expect((fixture.nativeElement.querySelector('#variant-name') as HTMLInputElement).value)
      .toBe('Black - Regular');
    expect(fixture.nativeElement.querySelector('.action-menu')).toBeNull();
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

  it('prefills the selected variant and sends its ID and edited values to the update API', () => {
    const selected = component.variants()[0];
    component.openEdit(selected);
    flushVariantLookups(http);
    fixture.detectChanges();

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
      status: selected.status,
    });

    component.form.update((form) => ({
      ...form,
      name: 'Blue - Large',
      barcode: '',
      size: 'L',
      color: 'Blue',
      material: 'Cotton',
      weight: '0.4',
      price: '3200',
      stock: '80',
      status: 'INACTIVE',
    }));
    component.selectedImage.set(new File(['image'], 'variant-new.png', { type: 'image/png' }));
    component.save();
    expect(component.isSubmitting()).toBe(true);
    component.save();
    const request = http.expectOne((req) => req.url.endsWith('/product_variant/update'));
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      VARIANT_ID: 21,
      PRODUCT_ID: 4,
      VARIANT_NAME: 'Blue - Large',
      BARCODE: null,
      SIZE: 'L',
      COLOR: 'Blue',
      MATERIAL: 'Cotton',
      WEIGHT: 0.4,
      PRICE: 3200,
      STOCK_QUANTITY: 80,
      VARIANT_IMAGE: 'variant-new.png',
      SELLER_ID: 1,
      SELLER_NAME: 'Arun Kumar',
      STATUS: 'INACTIVE',
      CREATED_BY: 42,
    });
    request.flush({ status: 'SUCCESS', message: 'Product variant updated successfully' });
    expect(component.dialog()).toBeNull();
    expect(component.isSubmitting()).toBe(false);
    expect(toast.showSuccess).toHaveBeenCalledWith('Product variant updated successfully');
    fixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/product_variant/get')).flush({ status: 'SUCCESS', data: [] });
  });

  it('sends dropdown IDs instead of size, color, and material strings when IDs are available', () => {
    component.openEdit(component.variants()[0]);
    flushVariantLookups(http);
    fixture.detectChanges();

    const dropdowns = [
      { selector: '#variant-size', id: '2' },
      { selector: '#variant-color', id: '1' },
      { selector: '#variant-material', id: '3' },
    ];
    for (const { selector, id } of dropdowns) {
      const dropdown = fixture.nativeElement.querySelector(selector) as HTMLSelectElement;
      dropdown.value = id;
      dropdown.dispatchEvent(new Event('change', { bubbles: true }));
    }

    component.save();
    const request = http.expectOne((req) => req.url.endsWith('/product_variant/update'));
    expect(request.request.body).toMatchObject({
      VARIANT_ID: 21,
      PRODUCT_ID: 4,
      SIZE_ID: 2,
      COLOR_ID: 1,
      MATERIAL_ID: 3,
      SELLER_ID: 1,
      CREATED_BY: 42,
    });
    expect(request.request.body).not.toHaveProperty('SIZE');
    expect(request.request.body).not.toHaveProperty('COLOR');
    expect(request.request.body).not.toHaveProperty('MATERIAL');
    request.flush({ status: 'SUCCESS', message: 'Product variant updated successfully' });
    fixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/product_variant/get')).flush({ status: 'SUCCESS', data: [] });
  });

  it('omits empty and placeholder size, color, and material values from edit payloads', () => {
    component.openEdit(component.variants()[0]);
    flushVariantLookups(http);
    component.form.update((form) => ({
      ...form,
      size: '—',
      sizeId: null,
      color: '-',
      colorId: null,
      material: '_',
      materialId: null,
    }));

    component.save();
    const request = http.expectOne((req) => req.url.endsWith('/product_variant/update'));
    for (const field of ['SIZE', 'SIZE_ID', 'COLOR', 'COLOR_ID', 'MATERIAL', 'MATERIAL_ID']) {
      expect(request.request.body).not.toHaveProperty(field);
    }
    request.flush({ status: 'SUCCESS', message: 'Product variant updated successfully' });
    fixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/product_variant/get')).flush({ status: 'SUCCESS', data: [] });
  });

  it('keeps the edit dialog open and reports a failed update without refreshing', () => {
    component.openEdit(component.variants()[0]);
    flushVariantLookups(http);
    component.save();

    http.expectOne((req) => req.url.endsWith('/product_variant/update')).flush({
      status: 'FAILURE',
      message: 'Variant could not be updated.',
    });

    expect(component.dialog()).toBe('edit');
    expect(component.isSubmitting()).toBe(false);
    expect(toast.showError).toHaveBeenCalledWith('Variant could not be updated.');
    http.expectNone((req) => req.url.endsWith('/product_variant/get'));
  });

  it('closes on cancel without changing the selected variant', () => {
    const selected = component.variants()[0];
    component.openEdit(selected);
    flushVariantLookups(http);
    component.form.update((form) => ({ ...form, name: 'Unsaved variant' }));
    component.close();

    expect(component.dialog()).toBeNull();
    http.expectNone((req) => req.url.endsWith('/product_variant/update'));
    http.expectNone((req) => req.url.endsWith('/product_variant/delete'));
  });

  it('shows the selected variant in the delete confirmation and closes without a request on cancel', () => {
    const selected = component.variants()[0];
    component.openDelete(selected);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(`Are you sure you want to delete “${selected.name}”?`);
    expect(fixture.nativeElement.textContent).toContain(`SKU: ${selected.sku}`);
    expect(fixture.nativeElement.textContent).toContain(`Size: ${selected.size}`);
    const dialog = fixture.nativeElement.querySelector('.delete-dialog') as HTMLElement;
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.dialog()).toBe('delete');
    const cancel = fixture.nativeElement.querySelector('.delete-dialog .dialog-actions app-button button') as HTMLButtonElement;
    cancel.click();

    expect(component.dialog()).toBeNull();
    http.expectNone((req) => req.url.endsWith('/product_variant/delete'));
  });

  it('closes the confirmation through the close icon and backdrop without deleting', () => {
    component.openDelete(component.variants()[0]);
    fixture.detectChanges();
    const close = fixture.nativeElement.querySelector('.delete-dialog .close') as HTMLButtonElement;
    close.click();
    expect(component.dialog()).toBeNull();
    http.expectNone((req) => req.url.endsWith('/product_variant/delete'));

    component.openDelete(component.variants()[0]);
    fixture.detectChanges();
    const backdrop = fixture.nativeElement.querySelector('app-dialog .dialog-backdrop') as HTMLElement;
    backdrop.click();
    expect(component.dialog()).toBeNull();
    http.expectNone((req) => req.url.endsWith('/product_variant/delete'));
  });

  it('deletes the selected variant using its product and variant IDs, then refreshes the listing', () => {
    const selected = component.variants()[0];
    component.openDelete(selected);
    component.confirmDelete();
    expect(component.isSubmitting()).toBe(true);
    component.confirmDelete();

    const request = http.expectOne((req) => req.url.endsWith('/product_variant/delete'));
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ PRODUCT_ID: 4, VARIANT_ID: 21 });
    request.flush({ status: 'SUCCESS', message: 'Product variant deleted successfully' });

    expect(component.dialog()).toBeNull();
    expect(component.isSubmitting()).toBe(false);
    expect(component.variants()).toEqual([]);
    expect(component.totalCount()).toBe(21);
    expect(toast.showSuccess).toHaveBeenCalledWith('Product variant deleted successfully');
    fixture.detectChanges();
    const refresh = http.expectOne((req) => req.url.endsWith('/product_variant/get'));
    expect(refresh.request.params.get('OFFSET')).toBe('0');
    refresh.flush({ status: 'SUCCESS', data: [] });
  });

  it('keeps delete confirmation open when the delete API fails', () => {
    component.openDelete(component.variants()[0]);
    component.confirmDelete();

    http.expectOne((req) => req.url.endsWith('/product_variant/delete')).flush({
      status: 'FAILURE',
      message: 'Variant is associated with an order.',
    });

    expect(component.dialog()).toBe('delete');
    expect(component.variants()).toHaveLength(1);
    expect(component.totalCount()).toBe(22);
    expect(toast.showError).toHaveBeenCalledWith('Variant is associated with an order.');
    http.expectNone((req) => req.url.endsWith('/product_variant/get'));
  });

  it('posts the selected product and variant values, then refreshes and closes', () => {
    component.openAdd();
    flushVariantLookups(http);
    fixture.detectChanges();
    const sizeSelect = fixture.nativeElement.querySelector('#variant-size') as HTMLSelectElement;
    expect(Array.from(sizeSelect.options).some((option) => option.value === '2' && option.textContent === 'Medium')).toBe(true);
    sizeSelect.value = '2';
    sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.form().sizeId).toBe(2);
    expect(typeof component.form().sizeId).toBe('number');
    const colorSelect = fixture.nativeElement.querySelector('#variant-color') as HTMLSelectElement;
    expect(Array.from(colorSelect.options).some((option) => option.value === '1' && option.textContent === 'Black')).toBe(true);
    colorSelect.value = '1';
    colorSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.form().colorId).toBe(1);
    expect(typeof component.form().colorId).toBe('number');
    const materialSelect = fixture.nativeElement.querySelector('#variant-material') as HTMLSelectElement;
    expect(Array.from(materialSelect.options).some((option) => option.value === '3' && option.textContent === 'Leather')).toBe(true);
    materialSelect.value = '3';
    materialSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.form().materialId).toBe(3);
    expect(typeof component.form().materialId).toBe('number');
    component.form.set({
      productId: '4',
      name: ' Black Leather Medium ',
      sku: 'SKU-LEATHER-M',
      barcode: '',
      size: '',
      sizeId: component.form().sizeId,
      color: 'Black',
      colorId: component.form().colorId,
      material: 'Leather',
      materialId: component.form().materialId,
      weight: '1.2',
      price: '2499',
      stock: '50',
      status: 'ACTIVE',
    });
    component.selectedImage.set(new File(['image'], 'black_leather.png', { type: 'image/png' }));

    component.save();
    expect(component.isSubmitting()).toBe(true);

    const request = http.expectOne((req) => req.url.endsWith('/product_variant/insert'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      VARIANT_NAME: 'Black Leather Medium',
      SKU: 'SKU-LEATHER-M',
      BARCODE: null,
      SIZE_ID: 2,
      COLOUR_ID: 1,
      MATERIAL_ID: 3,
      WEIGHT: 1.2,
      PRICE: 2499,
      STOCK_QUANTITY: 50,
      VARIANT_IMAGE: 'black_leather.png',
      PRODUCT_ID: 4,
      SELLER_ID: 1,
      SELLER_NAME: 'Arun Kumar',
      CREATED_BY: 2,
    });

    component.save();
    http.expectNone((req) => req.url.endsWith('/product_variant/insert'));
    request.flush({
      status: 'SUCCESS',
      message: 'Product variant inserted successfully',
      data: { SUCCES: 'SUCCES' },
    });

    expect(component.isSubmitting()).toBe(false);
    expect(component.dialog()).toBeNull();
    expect(toast.showSuccess).toHaveBeenCalledWith('Product variant inserted successfully');
    fixture.detectChanges();
    const refresh = http.expectOne((req) => req.url.endsWith('/product_variant/get'));
    expect(refresh.request.params.get('OFFSET')).toBe('0');
    refresh.flush({ status: 'SUCCESS', data: [] });
  });

  it('omits size, color, and material when none are selected for Add Variant', () => {
    component.openAdd();
    flushVariantLookups(http);
    component.form.set({
      productId: '4',
      name: 'Black Leather',
      sku: 'SKU-LEATHER',
      barcode: '',
      size: '—',
      sizeId: null,
      color: '-',
      colorId: null,
      material: '_',
      materialId: null,
      weight: '',
      price: '40000',
      stock: '34',
      status: 'ACTIVE',
    });
    component.selectedImage.set(new File(['image'], 'variant.png', { type: 'image/png' }));

    component.save();
    const request = http.expectOne((req) => req.url.endsWith('/product_variant/insert'));
    for (const field of ['SIZE_ID', 'COLOUR_ID', 'MATERIAL_ID', 'SIZE', 'COLOR', 'MATERIAL']) {
      expect(request.request.body).not.toHaveProperty(field);
    }
    request.flush({
      status: 'SUCCESS',
      message: 'Product variant inserted successfully',
      data: { SUCCES: 'SUCCES' },
    });
    fixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/product_variant/get')).flush({ status: 'SUCCESS', data: [] });
  });

  it('reports an API error and keeps the Add Variant dialog open', () => {
    component.openAdd();
    flushVariantLookups(http);
    component.form.set({
      productId: '4',
      name: 'Black Leather Medium',
      sku: 'SKU-LEATHER-M',
      barcode: '',
      size: '',
      sizeId: 2,
      color: 'Black',
      colorId: 1,
      material: 'Leather',
      materialId: 3,
      weight: '1.2',
      price: '2499',
      stock: '50',
      status: 'ACTIVE',
    });
    component.selectedImage.set(new File(['image'], 'black_leather.png', { type: 'image/png' }));
    component.save();

    http.expectOne((req) => req.url.endsWith('/product_variant/insert')).flush({
      status: 'FAILURE',
      message: 'Product variant already exists.',
    });

    expect(toast.showError).toHaveBeenCalledWith('Product variant already exists.');
    expect(component.dialog()).toBe('add');
    expect(component.isSubmitting()).toBe(false);
    http.expectNone((req) => req.url.endsWith('/product_variant/get'));
  });

  it('uses the configured seller identity without an authenticated session', () => {
    component.openAdd();
    flushVariantLookups(http);
    component.form.set({
      productId: '4',
      name: 'Black Leather Medium',
      sku: 'SKU-LEATHER-M',
      barcode: '',
      size: '',
      sizeId: 2,
      color: 'Black',
      colorId: 1,
      material: 'Leather',
      materialId: 3,
      weight: '1.2',
      price: '2499',
      stock: '50',
      status: 'ACTIVE',
    });
    component.selectedImage.set(new File(['image'], 'black_leather.png', { type: 'image/png' }));

    component.save();

    const request = http.expectOne((req) => req.url.endsWith('/product_variant/insert'));
    expect(request.request.body).toMatchObject({
      PRODUCT_ID: 4,
      SELLER_ID: 1,
      SELLER_NAME: 'Arun Kumar',
      CREATED_BY: 2,
    });
    request.flush({
      status: 'SUCCESS',
      message: 'Product variant inserted successfully',
      data: { SUCCES: 'SUCCES' },
    });
    expect(toast.showError).not.toHaveBeenCalled();
    fixture.detectChanges();
    http.expectOne((req) => req.url.endsWith('/product_variant/get')).flush({ status: 'SUCCESS', data: [] });
  });
});
