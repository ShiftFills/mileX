import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
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
        { provide: AuthService, useValue: { userId: () => 60, user: () => ({ userType: 'ADMIN' }) } },
        { provide: ProductCatalogService, useValue: catalog },
        { provide: SellerOnboardingService, useValue: { getSellerIdForCurrentUser: (id: number) => of(id) } },
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

  // CHANGED (new): the product dropdown is the shared searchable select (its list scrolls inside the dialog).
  it('picks the Add Variant product from a searchable list', () => {
    catalog.loadPage.mockReturnValueOnce(of({
      items: [
        { id: '4', name: 'Lenovo 110', sellerId: 1 },
        { id: '7', name: 'Dell Inspiron 15', sellerId: 1 },
        { id: '9', name: 'Lenovo Tab M10', sellerId: 1 },
      ],
      hasNext: false,
    }));
    component.openAdd();
    flushVariantLookups(http);
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('#variant-product') as HTMLButtonElement;
    const options = (): HTMLButtonElement[] =>
      Array.from(fixture.nativeElement.querySelectorAll('#variant-product-options [role="option"]'));

    expect(fixture.nativeElement.querySelector('select[name="productId"]')).toBeNull();
    expect(trigger.textContent?.trim()).toBe('Select product');
    trigger.click();
    fixture.detectChanges();
    expect(options().map((option) => option.textContent?.trim())).toEqual(['Lenovo 110', 'Dell Inspiron 15', 'Lenovo Tab M10']);

    const search = fixture.nativeElement.querySelector('.searchable-select__search') as HTMLInputElement;
    search.value = 'lenovo';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(options().map((option) => option.textContent?.trim())).toEqual(['Lenovo 110', 'Lenovo Tab M10']);

    options()[1].click();
    fixture.detectChanges();
    expect(component.form().productId).toBe('9');
    expect(trigger.textContent?.trim()).toBe('Lenovo Tab M10');
    expect(fixture.nativeElement.querySelector('#variant-product-options')).toBeNull();
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
    expect(fixture.nativeElement.querySelector('#variant-sku')).not.toBeNull();
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
    expect(fixture.nativeElement.querySelector('#variant-sku')).not.toBeNull();
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
      CREATED_BY: 60,
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
      CREATED_BY: 60,
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
    expect(fixture.nativeElement.querySelector('#variant-sku')).toBeNull();
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
      sku: '',
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
    expect(request.request.body).not.toHaveProperty('SKU');
    expect(request.request.body).toEqual({
      VARIANT_NAME: 'Black Leather Medium',
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
      CREATED_BY: 60,
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
      CREATED_BY: 60,
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

// CHANGED (new): the listing request depends on the signed-in role.
describe('ProductVariants listing by role', () => {
  let fixture: ComponentFixture<ProductVariants>;
  let http: HttpTestingController;
  let getCurrentSellerId: Mock<() => Observable<number>>;

  /**
   * Renders the page for a session of `userType` whose access token carries `sellerId` (if any).
   * The real ProductCatalogService is used, so the Add Variant product requests can be checked.
   * `recordSellerId` is the SELLER_ID of the seller's record (getCurrentSellerId).
   */
  async function render(userType: string, sellerId?: number, recordSellerId = 31): Promise<void> {
    getCurrentSellerId = vi.fn(() => of(recordSellerId));
    await TestBed.configureTestingModule({
      imports: [ProductVariants],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { userId: () => 60, user: () => ({ userType }), sellerId: () => sellerId } },
        {
          provide: SellerOnboardingService,
          // Like the real service: the given default for an Admin, the seller's record for a Seller.
          useValue: {
            getSellerIdForCurrentUser: (id: number) => (userType === 'SELLER' ? getCurrentSellerId() : of(id)),
            getCurrentSellerId,
          },
        },
        { provide: ToastService, useValue: { showError: vi.fn(), showSuccess: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductVariants);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  /** A listing row like the API sends it. */
  function variantRow(id: number, sellerId: number): Record<string, unknown> {
    return {
      VARIANT_ID: id, VARIANT_NAME: `Variant ${id}`, SKU: `SKU000${id}`, PRICE: '6000.00', STOCK_QUANTITY: 5,
      VARIANT_IMAGE: null, PRODUCT_ID: 16, SELLER_ID: sellerId, SELLER_NAME: 'Arun Kumar', STATUS: 'ACTIVE',
    };
  }

  afterEach(() => http.verify());

  it('keeps the Admin request unchanged: LIMIT=5 with no product, variant or seller filter', async () => {
    await render('ADMIN');
    const request = http.expectOne((req) => req.url.endsWith('/product_variant/get'));
    expect(request.request.urlWithParams).toBe('/api/product_variant/get?LIMIT=5&OFFSET=0');
    request.flush({ status: 'SUCCESS', data: [variantRow(1, 24), variantRow(2, 49)] });
    fixture.detectChanges();

    expect(getCurrentSellerId).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Variant 1');
    expect(fixture.nativeElement.textContent).toContain('Variant 2');
  });

  it('sends the Seller request with the session SELLER_ID and LIMIT=10, and pages by 10', async () => {
    await render('SELLER', 24);
    const request = http.expectOne((req) => req.url.endsWith('/product_variant/get'));
    expect(request.request.urlWithParams).toBe(
      '/api/product_variant/get?PRODUCT_ID=-1&VARIANT_ID=-1&SELLER_ID=24&LIMIT=10&OFFSET=0',
    );
    request.flush({ status: 'SUCCESS', data: [variantRow(25, 24)], pagination: { totalRecords: 15 } });
    fixture.detectChanges();
    expect(getCurrentSellerId).not.toHaveBeenCalled();

    (fixture.componentInstance as unknown as { setPage(page: number): void }).setPage(2);
    fixture.detectChanges();
    http.expectOne('/api/product_variant/get?PRODUCT_ID=-1&VARIANT_ID=-1&SELLER_ID=24&LIMIT=10&OFFSET=10')
      .flush({ status: 'SUCCESS', data: [], pagination: { totalRecords: 15 } });
  });

  it('never shows another seller\'s variant to a Seller', async () => {
    await render('SELLER', 24);
    http.expectOne((req) => req.url.endsWith('/product_variant/get'))
      .flush({ status: 'SUCCESS', data: [variantRow(25, 24), variantRow(26, 49)] });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Variant 25');
    expect(fixture.nativeElement.textContent).not.toContain('Variant 26');
  });

  it('resolves the SELLER_ID from the seller record when the session token has none', async () => {
    await render('SELLER');
    expect(getCurrentSellerId).toHaveBeenCalledTimes(1);
    http.expectOne('/api/product_variant/get?PRODUCT_ID=-1&VARIANT_ID=-1&SELLER_ID=31&LIMIT=10&OFFSET=0')
      .flush({ status: 'SUCCESS', data: [] });
  });

  // CHANGED (new): the Add Variant product dropdown for each role.
  describe('Add Variant product dropdown', () => {
    interface DropdownHarness {
      openAdd(): void;
      save(): void;
      productOptions(): { label: string; value: string }[];
      productPlaceholder(): string;
      form: WritableSignal<VariantForm>;
      selectedImage: WritableSignal<File | null>;
    }
    const page = (): DropdownHarness => fixture.componentInstance as unknown as DropdownHarness;
    // CHANGED: the Seller's dropdown request also sends STATUS=ACTIVE.
    const SELLER_PRODUCTS_URL =
      '/api/products/get?PRODUCT_ID=-1&CATEGORY_ID=-1&BRAND_ID=-1&SELLER_ID=24&STATUS=ACTIVE&LIMIT=100&OFFSET=0';

    /** A products/get row (the API sends one per product variant). */
    function productRow(id: number, name: string, sellerId: number, status = 'ACTIVE'): Record<string, unknown> {
      return { PRODUCT_ID: id, PRODUCT_NAME: name, SELLING_PRICE: '100.00', SELLER_ID: sellerId, IS_ACTIVE: status };
    }

    async function openSellerDropdown(): Promise<void> {
      await render('SELLER', 24, 24);
      http.expectOne((req) => req.url.endsWith('/product_variant/get')).flush({ status: 'SUCCESS', data: [] });
      fixture.detectChanges();
      page().openAdd();
      fixture.detectChanges();
      flushVariantLookups(http);
    }

    // CHANGED: only active products (STATUS=ACTIVE); an inactive row the API still returns is not listed either.
    it('lists only the logged-in Seller\'s active products, once each, from the products API with their SELLER_ID', async () => {
      await openSellerDropdown();
      expect(page().productPlaceholder()).toBe('Loading products…');

      http.expectOne(SELLER_PRODUCTS_URL).flush({
        status: 'SUCCESS',
        data: [
          productRow(16, 'Head Set', 24), productRow(16, 'Head Set', 24),
          productRow(17, 'Dell Inspiron 15', 24), productRow(18, 'Other seller product', 49),
          productRow(19, 'Retired product', 24, 'INACTIVE'),
        ],
      });
      fixture.detectChanges();

      expect(page().productOptions()).toEqual([
        { label: 'Head Set', value: '16' },
        { label: 'Dell Inspiron 15', value: '17' },
      ]);
      expect(page().productPlaceholder()).toBe('Select product');
    });

    it('creates the variant with the selected product\'s PRODUCT_ID and the Seller\'s SELLER_ID', async () => {
      await openSellerDropdown();
      http.expectOne(SELLER_PRODUCTS_URL).flush({ status: 'SUCCESS', data: [productRow(17, 'Dell Inspiron 15', 24)] });
      fixture.detectChanges();

      page().form.update((form) => ({ ...form, productId: '17', name: 'Silver - 8GB', price: '45000', stock: '5' }));
      page().selectedImage.set(new File(['image'], 'silver.png', { type: 'image/png' }));
      page().save();

      const insert = http.expectOne((req) => req.url.endsWith('/product_variant/insert'));
      expect(insert.request.body).toMatchObject({ PRODUCT_ID: 17, SELLER_ID: 24, VARIANT_NAME: 'Silver - 8GB' });
      insert.flush({ status: 'SUCCESS', message: 'Product variant inserted successfully' });
      fixture.detectChanges();
      http.expectOne('/api/product_variant/get?PRODUCT_ID=-1&VARIANT_ID=-1&SELLER_ID=24&LIMIT=10&OFFSET=0')
        .flush({ status: 'SUCCESS', data: [] });
    });

    it('shows the empty state, and the API error with a retry, for the Seller\'s products', async () => {
      await openSellerDropdown();
      http.expectOne(SELLER_PRODUCTS_URL).flush({ message: 'Products are unavailable.' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      const alert = fixture.nativeElement.querySelector('.variant-dialog [role="alert"]') as HTMLElement;
      expect(alert.textContent).toContain('Products are unavailable.');

      (alert.querySelector('app-button button') as HTMLButtonElement).click();
      fixture.detectChanges();
      http.expectOne(SELLER_PRODUCTS_URL).flush({ status: 'SUCCESS', data: [] });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('No products are available for variants.');
      expect(page().productPlaceholder()).toBe('No products available');
    });

    it('keeps the Admin product request unchanged', async () => {
      await render('ADMIN');
      http.expectOne((req) => req.url.endsWith('/product_variant/get')).flush({ status: 'SUCCESS', data: [] });
      fixture.detectChanges();
      page().openAdd();
      flushVariantLookups(http);

      http.expectOne('/api/products/get?PRODUCT_ID=-1&LIMIT=100&OFFSET=0')
        .flush({ status: 'SUCCESS', data: [productRow(16, 'Head Set', 24), productRow(18, 'Other seller product', 49)] });
      fixture.detectChanges();
      expect(page().productOptions().map((option) => option.value)).toEqual(['16', '18']);
      expect(getCurrentSellerId).not.toHaveBeenCalled();
    });
  });

  it('sends no listing request for a Seller without a seller account', async () => {
    await TestBed.configureTestingModule({
      imports: [ProductVariants],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { userId: () => 60, user: () => ({ userType: 'SELLER' }), sellerId: () => undefined } },
        { provide: ProductCatalogService, useValue: { loadPage: vi.fn(), getErrorMessage: vi.fn() } },
        {
          provide: SellerOnboardingService,
          useValue: {
            getSellerIdForCurrentUser: (id: number) => of(id),
            getCurrentSellerId: () => throwError(() => new Error('The authenticated user does not have a valid seller account.')),
          },
        },
        { provide: ToastService, useValue: { showError: vi.fn(), showSuccess: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProductVariants);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectNone((req) => req.url.endsWith('/product_variant/get'));
    expect(fixture.nativeElement.textContent).toContain('The authenticated user does not have a valid seller account.');
  });
});
