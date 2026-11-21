import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { ProductCatalogService, ProductLookupOption } from '@core/services/product-catalog.service';
import { S3ImageService } from '@core/services/s3-image.service';
import { ToastService } from '@core/services/toast.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import { AddProduct } from './add-product';

// CHANGED (new): the product image is uploaded through S3ImageService before products/insert.
// CHANGED: product images are uploaded to the "products" folder under a generated unique file name.
const IMAGE_KEY = 'products/0f3a.png';
const UNIQUE_PNG_NAME = expect.stringMatching(/^[0-9a-f]{32}\.png$/);

type LookupSetter = { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };

interface SubmitHarness {
  values: { set(value: Record<string, string>): void };
  productImages: { set(files: File[]): void };
  categoryLookup: LookupSetter;
  subcategoryLookup: LookupSetter;
  brandLookup: LookupSetter;
  taxRateLookup: LookupSetter;
  valueFor(name: string): string;
  saveProduct(): void;
  addProductImage(file: File): void;
  removeProductImage(): void;
  previewFailed(): void;
  imagePreview(): string | null;
  selectedImage(): File | null;
  imageError(): string;
  isSubmitting(): boolean;
  saveStage(): string;
}

/** A valid form with one selected image, ready to save. */
function fillValidForm(submit: SubmitHarness, image = new File(['image'], 'headphones.png', { type: 'image/png' })): File {
  submit.values.set({
    productName: 'Bluetooth Headphones', category: '1', subcategory: '11', brand: '3',
    description: 'Wireless audio', hsnCode: '851830', taxRate: '4', sellingPrice: '1800',
    mrp: '2200', discount: '400', stockQuantity: '18', minimumOrderQuantity: '1',
    maximumOrderQuantity: '4',
  });
  submit.categoryLookup.set({ status: 'success', options: [{ id: '1', label: 'Electronics' }], error: null });
  submit.subcategoryLookup.set({ status: 'success', options: [{ id: '11', label: 'Audio' }], error: null });
  submit.brandLookup.set({ status: 'success', options: [{ id: '3', label: 'Milex' }], error: null });
  submit.taxRateLookup.set({ status: 'success', options: [{ id: '4', label: '18%' }], error: null });
  submit.addProductImage(image);
  return image;
}

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
    loadSubCategories: ReturnType<typeof vi.fn>;
    loadBrands: ReturnType<typeof vi.fn>;
    loadTaxRates: ReturnType<typeof vi.fn>;
    getErrorMessage: ReturnType<typeof vi.fn>;
    insertProduct: ReturnType<typeof vi.fn>;
  };
  let toast: { showError: ReturnType<typeof vi.fn>; showSuccess: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let s3Images: { uploadImage: ReturnType<typeof vi.fn>; uploadErrorMessage: ReturnType<typeof vi.fn> };
  const createObjectURL = vi.fn((file: File) => `blob:${file.name}`);
  const revokeObjectURL = vi.fn();

  beforeEach(async () => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    s3Images = {
      uploadImage: vi.fn(() => of(IMAGE_KEY)),
      uploadErrorMessage: vi.fn(() => 'The product image could not be uploaded. Bucket unavailable.'),
    };
    router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    productCatalog = {
      loadCategories: vi.fn(() => of([{ id: '1', label: 'Electronics' }])),
      loadSubCategories: vi.fn(() => of([{ id: '11', label: 'Phones' }])),
      loadBrands: vi.fn(() => of([{ id: '3', label: 'Samsung' }])),
      loadTaxRates: vi.fn(() => of([{ id: '4', label: '18%' }])),
      getErrorMessage: vi.fn((error: unknown) =>
        error instanceof Error ? error.message : 'Lookup failed',
      ),
      insertProduct: vi.fn(() => of('Product inserted successfully')),
    };
    toast = { showError: vi.fn(), showSuccess: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AddProduct],
      providers: [
        { provide: ProductCatalogService, useValue: productCatalog },
        { provide: SellerOnboardingService, useValue: { getSellerIdForCurrentUser: (id: number) => of(id) } },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
        { provide: S3ImageService, useValue: s3Images },
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
    expect(validation.fieldError('sku')).toBeNull();
  });

  it('shows format and range messages for invalid values', () => {
    validation.values.set({
      hsnCode: '12A45',
      taxRate: '7%',
      sellingPrice: '-2',
      mrp: '1',
      discount: '-1',
      stockQuantity: '1.5',
      minimumOrderQuantity: '0',
      maximumOrderQuantity: '0',
    });

    expect(validation.fieldError('hsnCode')).toContain('valid 4, 6, or 8 digit HSN');
    expect(validation.fieldError('taxRate')).toBe('Please select a valid tax rate.');
    expect(validation.fieldError('sellingPrice')).toBe('Enter a valid selling price greater than 0.');
    expect(validation.fieldError('mrp')).toBeNull();
    expect(validation.fieldError('discount')).toBe('Enter a valid discount amount of 0 or more.');
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
    expect(productCatalog.loadBrands).not.toHaveBeenCalled();
    expect(productCatalog.loadTaxRates).toHaveBeenCalledTimes(1);
    expect(validation.categoryLookup()).toMatchObject({
      status: 'success',
      options: [{ id: '1', label: 'Electronics' }],
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
    expect(brandSelect.disabled).toBe(true);
    const taxRateSelect = fixture.nativeElement.querySelector('#product-tax') as HTMLSelectElement;
    expect(taxRateSelect.querySelector('option[value="4"]')?.textContent?.trim()).toBe('18%');
    taxRateSelect.value = '4';
    taxRateSelect.dispatchEvent(new Event('change'));

    expect((fixture.componentInstance as unknown as { valueFor(name: string): string }).valueFor('category')).toBe('1');
    expect((fixture.componentInstance as unknown as { valueFor(name: string): string }).valueFor('brand')).toBe('');
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

  it('loads category specific subcategories and clears the previous selection on category change', () => {
    const component = fixture.componentInstance as unknown as {
      updateCategory(event: Event): void;
      updateValue(name: string, event: Event): void;
      valueFor(name: string): string;
      subcategoryLookup(): { options: ProductLookupOption[]; status: string };
    };
    validation.values.set({ category: '1', subcategory: 'old-subcategory' });
    const category = document.createElement('select');
    Object.defineProperty(category, 'value', { value: '1' });
    component.updateCategory({ target: category } as unknown as Event);

    expect(productCatalog.loadSubCategories).toHaveBeenCalledWith('1');
    expect(component.valueFor('subcategory')).toBe('');
    expect(component.subcategoryLookup()).toMatchObject({
      status: 'success', options: [{ id: '11', label: 'Phones' }],
    });
  });

  it('loads brands only after both category and subcategory are selected and clears brand on dependency changes', () => {
    const component = fixture.componentInstance as unknown as {
      updateCategory(event: Event): void;
      updateSubcategory(event: Event): void;
      valueFor(name: string): string;
      brandLookup(): { options: ProductLookupOption[]; status: string };
    };
    const select = (id: string) => {
      const element = document.createElement('select');
      Object.defineProperty(element, 'value', { value: id });
      return { target: element } as unknown as Event;
    };

    component.updateCategory(select('1'));
    expect(productCatalog.loadBrands).not.toHaveBeenCalled();
    component.updateSubcategory(select('11'));

    expect(productCatalog.loadBrands).toHaveBeenCalledWith('1', '11');
    expect(component.brandLookup()).toMatchObject({
      status: 'success', options: [{ id: '3', label: 'Samsung' }],
    });
    validation.values.set({ category: '1', subcategory: '11', brand: '3' });
    component.updateSubcategory(select('12'));
    expect(component.valueFor('brand')).toBe('');
    expect(productCatalog.loadBrands).toHaveBeenLastCalledWith('1', '12');

    validation.values.set({ category: '1', subcategory: '12', brand: '3' });
    component.updateCategory(select('2'));
    expect(component.valueFor('brand')).toBe('');
  });

  it('builds product fields from the form and keeps only seller and creator IDs static', () => {
    const submit = fixture.componentInstance as unknown as {
      values: { set(value: Record<string, string>): void };
      productImages: { set(files: File[]): void };
      categoryLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      subcategoryLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      brandLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      taxRateLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      saveProduct(): void;
    };
    submit.values.set({
      productName: 'Bluetooth Headphones', category: '1', subcategory: '11', brand: '3',
      description: 'Wireless audio', hsnCode: '851830', taxRate: '4', sellingPrice: '1800',
      mrp: '2200', discount: '400', stockQuantity: '18', minimumOrderQuantity: '1',
      maximumOrderQuantity: '4', weight: '0.3', length: '18', width: '8', height: '4',
    });
    submit.categoryLookup.set({ status: 'success', options: [{ id: '1', label: 'Electronics' }], error: null });
    submit.subcategoryLookup.set({ status: 'success', options: [{ id: '11', label: 'Audio' }], error: null });
    submit.brandLookup.set({ status: 'success', options: [{ id: '3', label: 'Milex' }], error: null });
    submit.taxRateLookup.set({ status: 'success', options: [{ id: '4', label: '18%' }], error: null });
    const image = new File(['image'], 'headphones.png', { type: 'image/png' });
    submit.productImages.set([image]);
    submit.saveProduct();

    // CHANGED: PRODUCT_IMAGE is the key s3/upload returned (was "uploads/products/<local file name>").
    expect(s3Images.uploadImage).toHaveBeenCalledWith(image, UNIQUE_PNG_NAME, 'products');
    expect(productCatalog.insertProduct).toHaveBeenCalledWith({
      PRODUCT_NAME: 'Bluetooth Headphones', CATEGORY_ID: 1, SUB_CATEGORY_ID: 11, BRAND_ID: 3,
      PRODUCT_IMAGE: IMAGE_KEY, PRODUCT_VIDEO: null,
      PRODUCT_DESCRIPTION: 'Wireless audio', HSN_CODE: '851830', TAX_RATE: 18,
      SELLING_PRICE: 1800, PRICE: 2200, DISCOUNT: 400,
      STOCK_QUANTITY: 18, MINIMUM_ORDER_QUANTITY: 1, MAXIMUM_ORDER_QUANTITY: 4,
      WEIGHT: 0.3, LENGTH: 18, WIDTH: 8, HEIGHT: 4, SELLER_ID: 1,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('Product inserted successfully');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin/products/new');
    expect((fixture.componentInstance as unknown as {
      valueFor(name: string): string;
      productImages(): File[];
      productVideo(): File | null;
      attemptedSave(): boolean;
    }).valueFor('productName')).toBe('');
    expect((fixture.componentInstance as unknown as { productImages(): File[] }).productImages()).toEqual([]);
    expect((fixture.componentInstance as unknown as { productVideo(): File | null }).productVideo()).toBeNull();
    expect((fixture.componentInstance as unknown as { attemptedSave(): boolean }).attemptedSave()).toBe(false);
  });

  it('does not navigate, clear the form, or show success when product creation fails', () => {
    productCatalog.insertProduct.mockReturnValue(throwError(() => new Error('Create failed')));
    const submit = fixture.componentInstance as unknown as {
      values: { set(value: Record<string, string>): void };
      productImages: { set(files: File[]): void };
      categoryLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      subcategoryLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      brandLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      taxRateLookup: { set(state: { status: string; options: ProductLookupOption[]; error: string | null }): void };
      valueFor(name: string): string;
      saveProduct(): void;
    };
    submit.values.set({
      productName: 'Bluetooth Headphones', category: '1', subcategory: '11', brand: '3',
      description: 'Wireless audio', hsnCode: '851830', taxRate: '4', sellingPrice: '1800',
      mrp: '2200', discount: '400', stockQuantity: '18', minimumOrderQuantity: '1',
      maximumOrderQuantity: '4',
    });
    submit.categoryLookup.set({ status: 'success', options: [{ id: '1', label: 'Electronics' }], error: null });
    submit.subcategoryLookup.set({ status: 'success', options: [{ id: '11', label: 'Audio' }], error: null });
    submit.brandLookup.set({ status: 'success', options: [{ id: '3', label: 'Milex' }], error: null });
    submit.taxRateLookup.set({ status: 'success', options: [{ id: '4', label: '18%' }], error: null });
    submit.productImages.set([new File(['image'], 'headphones.png', { type: 'image/png' })]);

    submit.saveProduct();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(toast.showError).toHaveBeenCalledWith('Create failed');
    expect(submit.valueFor('productName')).toBe('Bluetooth Headphones');
  });

  // CHANGED (new): image selection, preview, validation and the S3 upload.
  describe('product image', () => {
    let submit: SubmitHarness;
    const render = () => {
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };

    beforeEach(() => {
      submit = fixture.componentInstance as unknown as SubmitHarness;
      validation.attemptedSave.set(false);
    });

    it('previews the selected image before uploading it and replaces it with a new pick', () => {
      submit.addProductImage(new File(['a'], 'front.png', { type: 'image/png' }));
      let element = render();

      const preview = element.querySelector('.upload-zone__preview img') as HTMLImageElement;
      expect(preview.getAttribute('src')).toBe('blob:front.png');
      expect(preview.alt).toBe('Preview of front.png');
      expect(element.querySelector('.upload-zone__filename')?.textContent).toContain('front.png · 1 KB');
      expect(element.querySelector('app-file-upload label')?.textContent).toContain('Change image');
      expect(s3Images.uploadImage).not.toHaveBeenCalled();

      submit.addProductImage(new File(['b'], 'side.webp', { type: 'image/webp' }));
      element = render();
      expect(submit.selectedImage()?.name).toBe('side.webp');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:front.png');
      expect((element.querySelector('.upload-zone__preview img') as HTMLImageElement).getAttribute('src')).toBe('blob:side.webp');
    });

    it('rejects files that are not a PNG, JPG or WEBP image, are empty or are over 5 MB', () => {
      submit.addProductImage(new File(['a'], 'notes.pdf', { type: 'application/pdf' }));
      expect(submit.imageError()).toBe('Choose a PNG, JPG, or WEBP image.');
      submit.addProductImage(new File([], 'empty.png', { type: 'image/png' }));
      expect(submit.imageError()).toBe('The selected image is empty. Choose another file.');
      submit.addProductImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' }));
      expect(submit.imageError()).toBe('The image must be 5 MB or smaller.');

      expect(submit.selectedImage()).toBeNull();
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('drops a file the browser cannot display and explains why', () => {
      submit.addProductImage(new File(['not really a png'], 'broken.png', { type: 'image/png' }));
      submit.previewFailed();

      expect(submit.selectedImage()).toBeNull();
      expect(submit.imagePreview()).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:broken.png');
      expect(submit.imageError()).toBe('This file could not be read as an image. Choose another file.');
    });

    it('removes the selected image and requires one before saving', () => {
      fillValidForm(submit);
      submit.removeProductImage();
      submit.saveProduct();
      const element = render();

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:headphones.png');
      expect(s3Images.uploadImage).not.toHaveBeenCalled();
      expect(productCatalog.insertProduct).not.toHaveBeenCalled();
      expect(element.textContent).toContain('Please upload a product image.');
    });

    it('uploads the image first and creates the product only after the upload succeeds', () => {
      const upload = new Subject<string>();
      s3Images.uploadImage.mockReturnValue(upload);
      fillValidForm(submit);

      submit.saveProduct();
      let element = render();
      expect(submit.isSubmitting()).toBe(true);
      expect(submit.saveStage()).toBe('uploading');
      expect(element.textContent).toContain('Uploading image…');
      expect(productCatalog.insertProduct).not.toHaveBeenCalled();

      upload.next(IMAGE_KEY);
      upload.complete();
      element = render();
      expect(productCatalog.insertProduct).toHaveBeenCalledWith(expect.objectContaining({ PRODUCT_IMAGE: IMAGE_KEY }));
      expect(submit.isSubmitting()).toBe(false);
      expect(submit.selectedImage()).toBeNull();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:headphones.png');
    });

    it('does not create the product when the upload fails and keeps the image for a retry', () => {
      s3Images.uploadImage.mockReturnValue(throwError(() => new Error('Bucket unavailable')));
      fillValidForm(submit);

      submit.saveProduct();
      const element = render();

      expect(productCatalog.insertProduct).not.toHaveBeenCalled();
      expect(toast.showError).toHaveBeenCalledWith('The product image could not be uploaded. Bucket unavailable.');
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('could not be uploaded');
      expect(submit.selectedImage()?.name).toBe('headphones.png');
      expect(submit.isSubmitting()).toBe(false);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });

    it('reuses the uploaded image when only the product insert failed', () => {
      productCatalog.insertProduct.mockReturnValueOnce(throwError(() => new Error('Create failed')));
      fillValidForm(submit);

      submit.saveProduct();
      submit.saveProduct();

      expect(s3Images.uploadImage).toHaveBeenCalledTimes(1);
      expect(productCatalog.insertProduct).toHaveBeenCalledTimes(2);
      expect(productCatalog.insertProduct).toHaveBeenLastCalledWith(expect.objectContaining({ PRODUCT_IMAGE: IMAGE_KEY }));
      expect(toast.showSuccess).toHaveBeenCalledWith('Product inserted successfully');
    });

    it('ignores a second save while the image is uploading', () => {
      s3Images.uploadImage.mockReturnValue(new Subject<string>());
      fillValidForm(submit);

      submit.saveProduct();
      submit.saveProduct();

      expect(s3Images.uploadImage).toHaveBeenCalledTimes(1);
    });

    // CHANGED (new): one unique file name per selected image, used for its upload; the key the upload returns
    // is what products/insert receives.
    it('generates the image\'s unique file name when it is selected and uploads it under that name to "products"', () => {
      const image = new File(['a'], 'photo.png', { type: 'image/png' });
      submit.addProductImage(image);
      const nameAtSelection = (submit as unknown as { imageFileName(file: File): string }).imageFileName(image);
      expect(nameAtSelection).toMatch(/^[0-9a-f]{32}\.png$/);
      expect(nameAtSelection).not.toBe('photo.png');

      s3Images.uploadImage.mockImplementation((_file: File, fileName: string, folder: string) => of(`${folder}/${fileName}`));
      fillValidForm(submit, image);
      submit.saveProduct();

      expect(s3Images.uploadImage).toHaveBeenCalledWith(image, nameAtSelection, 'products');
      expect(productCatalog.insertProduct)
        .toHaveBeenCalledWith(expect.objectContaining({ PRODUCT_IMAGE: `products/${nameAtSelection}` }));
    });

    it('retries a failed upload under the same file name, and gives a newly selected image a new one', () => {
      s3Images.uploadImage.mockReturnValueOnce(throwError(() => new Error('Bucket unavailable')));
      const first = fillValidForm(submit);
      submit.saveProduct();
      submit.saveProduct();
      const [failedName, retriedName] = s3Images.uploadImage.mock.calls.map((call) => call[1] as string);
      expect(retriedName).toBe(failedName);

      fillValidForm(submit, new File(['b'], first.name, { type: 'image/png' }));
      productCatalog.insertProduct.mockReturnValueOnce(throwError(() => new Error('Create failed')));
      submit.saveProduct();
      expect(s3Images.uploadImage.mock.calls.at(-1)?.[1]).not.toBe(failedName);
    });

    it('gives each product created in a row its own image file name, even for files with the same name', () => {
      s3Images.uploadImage.mockImplementation((_file: File, fileName: string, folder: string) => of(`${folder}/${fileName}`));
      for (let product = 0; product < 3; product++) {
        fillValidForm(submit, new File([`image ${product}`], 'products.jpg', { type: 'image/jpeg' }));
        submit.saveProduct();
      }

      const sentImages = productCatalog.insertProduct.mock.calls.map((call) => (call[0] as { PRODUCT_IMAGE: string }).PRODUCT_IMAGE);
      expect(sentImages).toHaveLength(3);
      expect(new Set(sentImages).size).toBe(3);
      for (const key of sentImages) expect(key).toMatch(/^products\/[0-9a-f]{32}\.jpg$/);
    });
  });
});
