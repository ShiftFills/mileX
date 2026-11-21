import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { ProductCatalogService, ProductDetails } from '@core/services/product-catalog.service';
import { S3ImageService } from '@core/services/s3-image.service';
import { ToastService } from '@core/services/toast.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import { EditProduct } from './edit-product';

// CHANGED (new): S3 product images.
const SAVED_KEY = 'products/earbuds-1.png';
const NEW_KEY = 'products/9b2e.png';
const SIGNED_URL = 'https://bucket.s3.ap-south-1.amazonaws.com/products/earbuds-1.png?X-Amz-Signature=abc';

interface EditProductHarness {
  valueFor(name: string): string;
  updateValue(name: string, event: Event): void;
  updateCategory(event: Event): void;
  updateSubcategory(event: Event): void;
  productCodeLookup(): { status: string; options: { id: string; label: string }[] };
  productDetailsStatus(): string;
  existingVideoUrl(): string | null;
  fieldError(name: string): string | null;
  gallery(): { id: number }[];
  hasVariants(): boolean;
  hasVideo(): boolean;
  saved(): boolean;
  isSubmitting(): boolean;
  attemptedSave(): boolean;
  productImages: { set(files: File[]): void };
  productVideo: { set(file: File | null): void };
  saveProduct(): void;
  // CHANGED: one image, so no argument.
  removeImage(): void;
  removeVideo(): void;
  addProductImage(file: File): void;
  savedImage(): { path: string; src: string | null; status: string } | null;
  hasProductImage(): boolean;
  imageError(): string;
  saveStage(): string;
}

function inputEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
}

function selectEvent(value: string): Event {
  const select = document.createElement('select');
  const option = document.createElement('option');
  option.value = value;
  select.append(option);
  select.value = value;
  return { target: select } as unknown as Event;
}

function productDetails(productId: number): ProductDetails {
  return {
    PRODUCT_ID: productId,
    PRODUCT_NAME: 'Wireless Earbuds',
    CATEGORY_ID: '3',
    SUB_CATEGORY_ID: '5',
    BRAND_ID: '4',
    PRODUCT_CODE_SKU: productId === 21 ? 'SKU0014' : 'SKU0001',
    PRODUCT_IMAGE: 'uploads/products/earbuds.png',
    PRODUCT_VIDEO: 'uploads/videos/earbuds.mp4',
    PRODUCT_DESCRIPTION: 'Noise cancelling earbuds',
    HSN_CODE: '851762',
    TAX_RATE: '5.00',
    SELLING_PRICE: '2500',
    PRICE: '4999',
    DISCOUNT: '50',
    STOCK_QUANTITY: '120',
    MINIMUM_ORDER_QUANTITY: '1',
    MAXIMUM_ORDER_QUANTITY: '10',
    WEIGHT: '0.25',
    LENGTH: '5',
    WIDTH: '5',
    HEIGHT: '3',
    HAS_VARIANTS: true,
  };
}

describe('EditProduct', () => {
  let fixture: ComponentFixture<EditProduct>;
  let component: EditProductHarness;
  let catalog: {
    loadCategories: ReturnType<typeof vi.fn>;
    loadSubCategories: ReturnType<typeof vi.fn>;
    loadBrands: ReturnType<typeof vi.fn>;
    loadTaxRates: ReturnType<typeof vi.fn>;
    loadProductCodes: ReturnType<typeof vi.fn>;
    loadProductById: ReturnType<typeof vi.fn>;
    updateProduct: ReturnType<typeof vi.fn>;
    getErrorMessage: ReturnType<typeof vi.fn>;
  };
  let toast: { showError: ReturnType<typeof vi.fn>; showSuccess: ReturnType<typeof vi.fn> };
  let s3Images: {
    imageUrl: ReturnType<typeof vi.fn>;
    uploadImage: ReturnType<typeof vi.fn>;
    uploadErrorMessage: ReturnType<typeof vi.fn>;
  };
  const revokeObjectURL = vi.fn();

  beforeEach(async () => {
    Object.assign(URL, { createObjectURL: vi.fn((file: File) => `blob:${file.name}`), revokeObjectURL });
    revokeObjectURL.mockClear();
    s3Images = {
      imageUrl: vi.fn(() => of(SIGNED_URL)),
      uploadImage: vi.fn(() => of(NEW_KEY)),
      uploadErrorMessage: vi.fn(() => 'The product image could not be uploaded. Bucket unavailable.'),
    };
    toast = { showError: vi.fn(), showSuccess: vi.fn() };
    catalog = {
      loadCategories: vi.fn(() => of([
        { id: '3', label: 'Electronics' },
        { id: '9', label: 'Fashion' },
      ])),
      loadSubCategories: vi.fn((categoryId: string | number) => of(
        String(categoryId) === '3'
          ? [{ id: '5', label: 'Audio' }]
          : [{ id: '10', label: 'Clothing' }],
      )),
      loadBrands: vi.fn((_categoryId: string | number, subcategoryId: string | number) => of(
        String(subcategoryId) === '5'
          ? [{ id: '4', label: 'Samsung' }]
          : [{ id: '11', label: 'MileX' }],
      )),
      loadTaxRates: vi.fn(() => of([
        { id: '2', label: '5%' },
        { id: '4', label: '18%' },
      ])),
      loadProductCodes: vi.fn((productId: string | number) => of(
        String(productId) === '-1'
          ? [
            { id: '1', label: 'SKU0001' },
            { id: '14', label: 'SKU0014' },
          ]
          : String(productId) === '21'
            ? [{ id: '14', label: 'SKU0014' }]
            : [{ id: String(productId), label: `SKU${String(productId).padStart(4, '0')}` }],
      )),
      loadProductById: vi.fn((productId: string | number) => of(
        Number(productId) === 99999 ? null : productDetails(Number(productId)),
      )),
      updateProduct: vi.fn(() => of('Product updated successfully')),
      getErrorMessage: vi.fn(() => 'Lookup failed'),
    };
    await TestBed.configureTestingModule({
      imports: [EditProduct],
      providers: [
        provideRouter([]),
        { provide: ProductCatalogService, useValue: catalog },
        { provide: SellerOnboardingService, useValue: { getSellerIdForCurrentUser: (id: number) => of(id) } },
        { provide: ToastService, useValue: toast },
        { provide: S3ImageService, useValue: s3Images },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(EditProduct);
    fixture.componentRef.setInput('id', '1');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    component = fixture.componentInstance as unknown as EditProductHarness;
  });

  it('prefills the form from the selected product', () => {
    expect(catalog.loadProductCodes).toHaveBeenCalledTimes(2);
    expect(catalog.loadProductCodes).toHaveBeenNthCalledWith(1, -1);
    expect(catalog.loadProductCodes).toHaveBeenNthCalledWith(2, 1);
    expect(catalog.loadProductById).toHaveBeenCalledWith('1');
    expect(component.productDetailsStatus()).toBe('success');
    expect(component.valueFor('productName')).toBe('Wireless Earbuds');
    expect(component.valueFor('sku')).toBe('1');
    expect(component.valueFor('sellingPrice')).toBe('2500');
    expect(component.valueFor('stockQuantity')).toBe('120');
    expect(component.gallery()).toEqual([{ id: expect.any(Number), src: '/uploads/products/earbuds.png', alt: 'Wireless Earbuds' }]);
    expect(component.existingVideoUrl()).toBe('/uploads/videos/earbuds.mp4');
    expect(component.hasVariants()).toBe(true);
    expect(component.valueFor('category')).toBe('3');
    expect(component.valueFor('subcategory')).toBe('5');
    expect(component.valueFor('brand')).toBe('4');
    expect(component.valueFor('taxRate')).toBe('2');
    expect(fixture.nativeElement.querySelector('#product-tax').value).toBe('2');
    expect(component.valueFor('description')).toBe('Noise cancelling earbuds');
    expect(component.valueFor('hsnCode')).toBe('851762');
    expect(component.valueFor('sellingPrice')).toBe('2500');
    expect(component.valueFor('mrp')).toBe('4999');
    expect(component.valueFor('discount')).toBe('50');
    expect(component.valueFor('stockQuantity')).toBe('120');
    expect(component.valueFor('minimumOrderQuantity')).toBe('1');
    expect(component.valueFor('maximumOrderQuantity')).toBe('10');
    expect(component.valueFor('weight')).toBe('0.25');
    expect(component.valueFor('length')).toBe('5');
    expect(component.valueFor('width')).toBe('5');
    expect(component.valueFor('height')).toBe('3');
    expect(component.productCodeLookup()).toMatchObject({
      status: 'success', options: [
        { id: '1', label: 'SKU0001' },
        { id: '14', label: 'SKU0014' },
      ],
    });
    expect(catalog.loadSubCategories).toHaveBeenCalledWith('3');
    expect(catalog.loadBrands).toHaveBeenCalledWith('3', '5');
  });

  it('reloads dependent options and clears previous IDs when selections change', () => {
    component.updateCategory(selectEvent('9'));
    expect(component.valueFor('category')).toBe('9');
    expect(component.valueFor('subcategory')).toBe('');
    expect(component.valueFor('brand')).toBe('');
    expect(catalog.loadSubCategories).toHaveBeenLastCalledWith('9');

    component.updateSubcategory(selectEvent('10'));
    expect(component.valueFor('subcategory')).toBe('10');
    expect(component.valueFor('brand')).toBe('');
    expect(catalog.loadBrands).toHaveBeenLastCalledWith('9', '10');
  });

  it('loads product-code options again for the newly selected product record', async () => {
    fixture.componentRef.setInput('id', '21');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(catalog.loadProductCodes).toHaveBeenCalledTimes(4);
    expect(catalog.loadProductCodes).toHaveBeenNthCalledWith(3, -1);
    expect(catalog.loadProductCodes).toHaveBeenNthCalledWith(4, 21);
    expect(component.valueFor('sku')).toBe('14');
    expect(catalog.loadProductById).toHaveBeenLastCalledWith('21');
  });

  it('shows a not-found state for an unknown product id', () => {
    fixture.componentRef.setInput('id', '99999');
    fixture.detectChanges();
    expect(catalog.loadProductById).toHaveBeenLastCalledWith('99999');
    expect(fixture.nativeElement.textContent).toContain('Product not found');
  });

  it('sends the selected product ID and retained media with updated form fields', () => {
    component.updateValue('productName', inputEvent('Updated earbuds'));
    component.updateValue('sellingPrice', inputEvent('2300'));
    component.updateValue('stockQuantity', inputEvent('64'));
    component.saveProduct();
    expect(component.saved()).toBe(true);
    expect(catalog.updateProduct).toHaveBeenCalledWith({
      PRODUCT_ID: 1,
      PRODUCT_NAME: 'Updated earbuds',
      CATEGORY_ID: 3,
      SUB_CATEGORY_ID: 5,
      BRAND_ID: 4,
      PRODUCT_IMAGE: 'uploads/products/earbuds.png',
      PRODUCT_VIDEO: 'uploads/videos/earbuds.mp4',
      PRODUCT_DESCRIPTION: 'Noise cancelling earbuds',
      HSN_CODE: '851762',
      TAX_RATE: 5,
      SELLING_PRICE: 2300,
      PRICE: 4999,
      DISCOUNT: 50,
      STOCK_QUANTITY: 64,
      MINIMUM_ORDER_QUANTITY: 1,
      MAXIMUM_ORDER_QUANTITY: 10,
      WEIGHT: 0.25,
      LENGTH: 5,
      WIDTH: 5,
      HEIGHT: 3,
      SELLER_ID: 1,
    });
    expect(toast.showSuccess).toHaveBeenCalledWith('Product updated successfully');
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/admin/products/all');
  });

  it('prevents a second update while the first request is processing', () => {
    const response = new Subject<string>();
    catalog.updateProduct.mockReturnValue(response);

    component.saveProduct();
    component.saveProduct();

    expect(catalog.updateProduct).toHaveBeenCalledTimes(1);
    expect(component.isSubmitting()).toBe(true);
    response.next('Product updated successfully');
    response.complete();
    expect(component.isSubmitting()).toBe(false);
  });

  // CHANGED: a new image is uploaded to S3 and its key is sent (was "uploads/products/<local file name>").
  it('uploads a newly selected image and sends its key with the new video path', () => {
    const image = new File(['image'], 'replacement.png', { type: 'image/png' });
    component.productImages.set([image]);
    component.productVideo.set(new File(['video'], 'replacement.mp4', { type: 'video/mp4' }));
    component.saveProduct();

    // CHANGED: uploaded to the "products" folder under a generated unique file name.
    expect(s3Images.uploadImage).toHaveBeenCalledWith(image, expect.stringMatching(/^[0-9a-f]{32}\.png$/), 'products');
    expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({
      PRODUCT_IMAGE: NEW_KEY,
      PRODUCT_VIDEO: 'uploads/videos/replacement.mp4',
    }));
  });

  it('keeps the saved image and uploads nothing when no new image is selected', () => {
    component.saveProduct();

    expect(s3Images.uploadImage).not.toHaveBeenCalled();
    expect(s3Images.imageUrl).not.toHaveBeenCalled(); // a legacy path is not an S3 key
    expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({
      PRODUCT_IMAGE: 'uploads/products/earbuds.png',
    }));
  });

  it('sends the selected tax percentage when the tax-rate dropdown changes', () => {
    component.updateValue('taxRate', selectEvent('4'));
    component.saveProduct();

    expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({
      TAX_RATE: 18,
    }));
  });

  it('clears the video path only when the user removes the existing video', () => {
    component.removeVideo();
    component.saveProduct();

    expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({
      PRODUCT_IMAGE: 'uploads/products/earbuds.png',
      PRODUCT_VIDEO: null,
    }));
  });

  it('notifies on update failure and leaves the form available for retry', () => {
    catalog.updateProduct.mockReturnValue(throwError(() => new Error('Update rejected')));
    component.saveProduct();

    expect(toast.showError).toHaveBeenCalledWith('Lookup failed');
    expect(component.saved()).toBe(false);
    expect(component.isSubmitting()).toBe(false);
    expect(TestBed.inject(Router).navigateByUrl).not.toHaveBeenCalled();
  });

  it('keeps the selected product ID dynamic when the route changes', async () => {
    fixture.componentRef.setInput('id', '21');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    component.saveProduct();
    expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ PRODUCT_ID: 21 }));
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
    component.removeImage();
    component.removeVideo();
    component.saveProduct();
    expect(component.hasVideo()).toBe(false);
    expect(component.saved()).toBe(false);
    // CHANGED (new)
    expect(catalog.updateProduct).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Please upload a product image.');
  });

  // CHANGED (new): products whose PRODUCT_IMAGE is an S3 key.
  describe('with an image stored in S3', () => {
    const loadS3Product = async (productId = '7') => {
      catalog.loadProductById.mockImplementation((id: string | number) =>
        of({ ...productDetails(Number(id)), PRODUCT_IMAGE: SAVED_KEY }),
      );
      fixture.componentRef.setInput('id', productId);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const mainImage = () => fixture.nativeElement.querySelector('.gallery-main img') as HTMLImageElement | null;

    it('shows the saved image from its signed URL', async () => {
      await loadS3Product();

      expect(s3Images.imageUrl).toHaveBeenCalledWith(SAVED_KEY);
      expect(component.savedImage()).toEqual({ path: SAVED_KEY, src: SIGNED_URL, status: 'ready' });
      expect(mainImage()?.getAttribute('src')).toBe(SIGNED_URL);
      expect(fixture.nativeElement.querySelector('.video-actions__change')?.textContent).toContain('Change image');
    });

    it('shows a loading state until the URL arrives, and the key is still saved meanwhile', async () => {
      s3Images.imageUrl.mockReturnValue(new Subject<string>());
      await loadS3Product();

      expect(fixture.nativeElement.querySelector('.gallery-main')?.textContent).toContain('Loading image…');
      component.saveProduct();
      expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ PRODUCT_IMAGE: SAVED_KEY }));
    });

    it('explains when the saved image cannot be displayed and keeps it on update', async () => {
      s3Images.imageUrl.mockReturnValue(throwError(() => new Error('Not found')));
      await loadS3Product();

      expect(component.savedImage()?.status).toBe('error');
      expect(fixture.nativeElement.querySelector('.gallery-main')?.textContent)
        .toContain('The saved image could not be displayed. It is kept unless you change it.');
      component.saveProduct();
      expect(s3Images.uploadImage).not.toHaveBeenCalled();
      expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ PRODUCT_IMAGE: SAVED_KEY }));
    });

    it('previews a new image in place of the saved one, and discarding it shows the saved image again', async () => {
      await loadS3Product();
      component.addProductImage(new File(['new'], 'new-look.jpg', { type: 'image/jpeg' }));
      fixture.detectChanges();

      expect(mainImage()?.getAttribute('src')).toBe('blob:new-look.jpg');
      expect(fixture.nativeElement.querySelector('.gallery-caption')?.textContent)
        .toContain('It is uploaded when you update the product.');
      expect(s3Images.uploadImage).not.toHaveBeenCalled();

      component.removeImage();
      fixture.detectChanges();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:new-look.jpg');
      expect(mainImage()?.getAttribute('src')).toBe(SIGNED_URL);
      expect(component.hasProductImage()).toBe(true);
    });

    it('replaces the saved image with the uploaded one', async () => {
      await loadS3Product();
      const image = new File(['new'], 'new-look.jpg', { type: 'image/jpeg' });
      component.addProductImage(image);
      component.saveProduct();

      // CHANGED: the file name generated when the image was selected, in the "products" folder.
      expect(s3Images.uploadImage).toHaveBeenCalledWith(image, expect.stringMatching(/^[0-9a-f]{32}\.jpg$/), 'products');
      expect(catalog.updateProduct).toHaveBeenCalledWith(expect.objectContaining({ PRODUCT_ID: 7, PRODUCT_IMAGE: NEW_KEY }));
      expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/admin/products/all');
    });

    it('does not update the product when the new image fails to upload', async () => {
      s3Images.uploadImage.mockReturnValue(throwError(() => new Error('Bucket unavailable')));
      await loadS3Product();
      component.addProductImage(new File(['new'], 'new-look.jpg', { type: 'image/jpeg' }));
      component.saveProduct();
      fixture.detectChanges();

      expect(catalog.updateProduct).not.toHaveBeenCalled();
      expect(component.imageError()).toBe('The product image could not be uploaded. Bucket unavailable.');
      expect(toast.showError).toHaveBeenCalled();
      expect(component.saveStage()).toBe('idle');
      expect(TestBed.inject(Router).navigateByUrl).not.toHaveBeenCalled();
    });

    it('requires a new image after the saved one is removed', async () => {
      await loadS3Product();
      component.removeImage();
      component.saveProduct();

      expect(component.hasProductImage()).toBe(false);
      expect(catalog.updateProduct).not.toHaveBeenCalled();
    });
  });
});
