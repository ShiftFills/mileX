import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, Observable, Subscription, catchError, finalize, of, switchMap, tap, throwError } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { FileUpload } from '@shared/components/file-upload/file-upload';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';
import { ProductCatalogService, ProductInsertPayload, ProductLookupOption } from '@core/services/product-catalog.service';
import { PRODUCT_IMAGE_FOLDER, S3FileUpload, S3ImageService } from '@core/services/s3-image.service';
import { ToastService } from '@core/services/toast.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';

export const REQUIRED_FIELDS = [
  'productName', 'sku', 'category', 'subcategory', 'brand', 'description', 'hsnCode', 'taxRate',
  'sellingPrice', 'mrp', 'stockQuantity', 'minimumOrderQuantity', 'maximumOrderQuantity',
] as const;
const ADD_PRODUCT_REQUIRED_FIELDS = REQUIRED_FIELDS.filter((field) => field !== 'sku');
const PRODUCT_SELLER_ID = 1;
// CHANGED (new): product image rules (the types and size limit are unchanged).
export const PRODUCT_IMAGE_TYPES = 'image/png,image/jpeg,image/webp';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ProductLookupName = 'category' | 'brand' | 'taxRate' | 'subcategory';
type ProductLookupStatus = 'loading' | 'success' | 'error';
/** Which request a save is waiting for (the button label follows it). */
// CHANGED (new)
export type ProductSaveStage = 'idle' | 'uploading' | 'saving';

// CHANGED (new): "245 KB" / "1.2 MB" for the selected image.
function fileSizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ProductLookupState {
  status: ProductLookupStatus;
  options: ProductLookupOption[];
  error: string | null;
}

@Component({
  selector: 'app-add-product',
  imports: [Button, Card, FileUpload, Input, Select, Textarea],
  templateUrl: './add-product.html',
  styleUrl: './add-product.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddProduct implements OnInit {
  private readonly productCatalog = inject(ProductCatalogService);
  protected readonly sellerOnboarding = inject(SellerOnboardingService);
  // CHANGED (new): uploads the product image to S3 before the product is saved.
  protected readonly s3Images = inject(S3ImageService);
  private readonly toast = inject(ToastService);
  private readonly addProductRouter = inject(Router);
  private readonly dropdownDestroyRef = inject(DestroyRef);
  private subcategoryRequest?: Subscription;
  private brandRequest?: Subscription;
  /**
   * The image uploads of this form ("products/<unique file name>"): the name is fixed when the image is selected,
   * and retrying a failed save does not upload the same file again.
   */
  // CHANGED: the shared S3FileUpload (this form used to keep its own file names and last upload).
  private readonly imageUpload = new S3FileUpload(this.s3Images, PRODUCT_IMAGE_FOLDER);
  protected readonly loadDropdownLookups: boolean = true;
  protected readonly values = signal<Record<string, string>>({});
  protected readonly attemptedSave = signal(false);
  protected readonly saved = signal(false);
  protected readonly isSubmitting = signal(false);
  // CHANGED (new)
  protected readonly saveStage = signal<ProductSaveStage>('idle');
  protected readonly hasVariants = signal(false);
  // CHANGED: holds at most one image (the products API stores a single PRODUCT_IMAGE); a new pick replaces it.
  protected readonly productImages = signal<File[]>([]);
  // CHANGED (new): object URL of the selected image, shown before it is uploaded.
  protected readonly imagePreview = signal<string | null>(null);
  protected readonly selectedImage = computed(() => this.productImages()[0] ?? null);
  protected readonly selectedImageSize = computed(() => {
    const image = this.selectedImage();
    return image ? fileSizeLabel(image.size) : '';
  });
  protected readonly imageTypes = PRODUCT_IMAGE_TYPES;
  protected readonly productVideo = signal<File | null>(null);
  protected readonly imageError = signal('');
  protected readonly videoError = signal('');
  protected readonly categoryLookup = signal<ProductLookupState>({
    status: 'loading',
    options: [],
    error: null,
  });
  protected readonly brandLookup = signal<ProductLookupState>({
    status: 'success',
    options: [],
    error: null,
  });
  protected readonly taxRateLookup = signal<ProductLookupState>({
    status: 'loading',
    options: [],
    error: null,
  });
  protected readonly subcategoryLookup = signal<ProductLookupState>({
    status: 'success', options: [], error: null,
  });

  // Retained for the existing Edit Product screen, which reuses this component's validation.
  protected readonly categories = ['Electronics', 'Fashion', 'Home & Living', 'Beauty & Personal Care'];
  protected readonly subCategories = ['Mobile Phones', 'Laptops', 'Accessories', 'Wearables', 'Audio'];
  protected readonly brands = ['MileX', 'Samsung', 'Apple', 'Other'];
  protected readonly taxRates = ['0%', '5%', '12%', '18%', '28%'];

  constructor() {
    // CHANGED (new): releases the preview's object URL when the screen closes.
    this.dropdownDestroyRef.onDestroy(() => this.setImagePreview(null));
  }

  ngOnInit(): void {
    if (!this.loadDropdownLookups) return;
    this.loadLookup('category');
    this.loadLookup('taxRate');
  }

  protected valueFor(name: string): string {
    return this.values()[name] ?? '';
  }

  protected updateValue(name: string, event: Event): void {
    const control = event.target;
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
    this.values.update((values) => ({ ...values, [name]: control.value }));
    this.saved.set(false);
  }

  protected updateSubcategory(event: Event): void {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement)) return;
    const subcategoryId = control.value;
    this.brandRequest?.unsubscribe();
    this.brandRequest = undefined;
    this.values.update((values) => ({ ...values, subcategory: subcategoryId, brand: '' }));
    this.saved.set(false);
    const categoryId = this.valueFor('category');
    this.brandLookup.set({
      status: categoryId && subcategoryId ? 'loading' : 'success', options: [], error: null,
    });
    if (categoryId && subcategoryId) this.loadLookup('brand', categoryId, subcategoryId);
  }

  protected updateCategory(event: Event): void {
    const control = event.target;
    if (!(control instanceof HTMLSelectElement)) return;
    const categoryId = control.value;
    this.subcategoryRequest?.unsubscribe();
    this.subcategoryRequest = undefined;
    this.brandRequest?.unsubscribe();
    this.brandRequest = undefined;
    this.values.update((values) => ({ ...values, category: categoryId, subcategory: '', brand: '' }));
    this.saved.set(false);
    this.subcategoryLookup.set({
      status: categoryId ? 'loading' : 'success', options: [], error: null,
    });
    this.brandLookup.set({ status: 'success', options: [], error: null });
    if (categoryId) this.loadLookup('subcategory', categoryId);
  }

  protected fieldError(name: string): string | null {
    if (!this.attemptedSave()) return null;
    const value = this.valueFor(name).trim();
    const requiredFields: readonly string[] = this.loadDropdownLookups
      ? ADD_PRODUCT_REQUIRED_FIELDS
      : REQUIRED_FIELDS;
    const required = requiredFields.includes(name);
    if (!value) return required ? 'This field is required.' : null;

    const number = Number(value);
    const validNumber = Number.isFinite(number);

    switch (name) {
      case 'category':
        return this.loadDropdownLookups
          ? this.validLookupId(this.categoryLookup().options, value)
          : null;
      case 'brand':
        return this.loadDropdownLookups
          ? this.validLookupId(this.brandLookup().options, value)
          : null;
      case 'subcategory':
        return this.loadDropdownLookups
          ? this.validLookupId(this.subcategoryLookup().options, value)
          : null;
      case 'hsnCode':
        return /^(?:\d{4}|\d{6}|\d{8})$/.test(value)
          ? null
          : 'Enter a valid 4, 6, or 8 digit HSN code.';
      case 'taxRate':
        return this.loadDropdownLookups
          ? this.taxRateLookup().options.some((option) => option.id === value)
            ? null
            : 'Please select a valid tax rate.'
          : this.taxRates.includes(value) ? null : 'Please select a valid tax rate.';
      case 'sellingPrice':
        if (!validNumber || number <= 0) return 'Enter a valid selling price greater than 0.';
        return this.isValidPositiveNumber(this.valueFor('mrp')) && number > Number(this.valueFor('mrp'))
          ? 'Selling price cannot exceed MRP.'
          : null;
      case 'mrp':
        if (!validNumber || number <= 0) return 'Enter a valid MRP greater than 0.';
        return this.isValidPositiveNumber(this.valueFor('sellingPrice')) && number < Number(this.valueFor('sellingPrice'))
          ? 'MRP must be greater than or equal to the selling price.'
          : null;
      case 'discount':
        return validNumber && number >= 0
          ? null
          : 'Enter a valid discount amount of 0 or more.';
      case 'weight':
      case 'length':
      case 'width':
      case 'height':
        return value && (!validNumber || number < 0)
          ? 'Enter a valid dimension of 0 or more.'
          : null;
      case 'stockQuantity':
        return validNumber && Number.isInteger(number) && number >= 0
          ? null
          : 'Enter a whole stock quantity of 0 or more.';
      case 'minimumOrderQuantity':
        return validNumber && Number.isInteger(number) && number >= 1
          ? null
          : 'Enter a whole minimum order quantity of at least 1.';
      case 'maximumOrderQuantity': {
        if (!validNumber || !Number.isInteger(number) || number < 1) {
          return 'Enter a whole maximum order quantity of at least 1.';
        }
        const minimum = Number(this.valueFor('minimumOrderQuantity'));
        return Number.isInteger(minimum) && minimum > 0 && number < minimum
          ? 'Maximum order quantity must be at least the minimum order quantity.'
          : null;
      }
      default:
        return null;
    }
  }

  private isValidPositiveNumber(value: string): boolean {
    const number = Number(value);
    return value.trim() !== '' && Number.isFinite(number) && number > 0;
  }

  protected selectedFileName(file: File | null): string {
    return file?.name ?? '';
  }

  protected lookupDisabled(state: ProductLookupState): boolean {
    return state.status !== 'success' || state.options.length === 0;
  }

  protected retryLookup(name: ProductLookupName): void {
    if (name === 'subcategory') {
      const categoryId = this.valueFor('category');
      if (categoryId) this.loadLookup(name, categoryId);
      return;
    }
    if (name === 'brand') {
      const categoryId = this.valueFor('category');
      const subcategoryId = this.valueFor('subcategory');
      if (categoryId && subcategoryId) this.loadLookup(name, categoryId, subcategoryId);
      return;
    }
    this.loadLookup(name);
  }

  private validLookupId(options: readonly ProductLookupOption[], id: string): string | null {
    return options.some((option) => option.id === id)
      ? null
      : 'Please select a valid option.';
  }

  protected loadLookup(name: ProductLookupName, categoryId?: string, subcategoryId?: string): void {
    if (name === 'subcategory') this.subcategoryRequest?.unsubscribe();
    if (name === 'brand') this.brandRequest?.unsubscribe();
    const state = this.lookupStateFor(name);
    state.set({ ...state(), status: 'loading', error: null });
    const request = this.lookupRequest(name, categoryId, subcategoryId);
    const subscription = request
      .pipe(
        catchError((error: unknown) => {
          const message = this.productCatalog.getErrorMessage(error);
          state.set({ status: 'error', options: [], error: message });
          this.toast.showError(message);
          return EMPTY;
        }),
        takeUntilDestroyed(this.dropdownDestroyRef),
      )
      .subscribe((options) => state.set({ status: 'success', options, error: null }));
    if (name === 'subcategory') this.subcategoryRequest = subscription;
    if (name === 'brand') this.brandRequest = subscription;
  }

  private lookupStateFor(name: ProductLookupName) {
    switch (name) {
      case 'category': return this.categoryLookup;
      case 'brand': return this.brandLookup;
      case 'taxRate': return this.taxRateLookup;
      case 'subcategory': return this.subcategoryLookup;
    }
  }

  private lookupRequest(name: ProductLookupName, categoryId?: string, subcategoryId?: string): Observable<ProductLookupOption[]> {
    switch (name) {
      case 'category': return this.productCatalog.loadCategories();
      case 'brand': return this.productCatalog.loadBrands(categoryId ?? '', subcategoryId ?? '');
      case 'taxRate': return this.productCatalog.loadTaxRates();
      case 'subcategory': return this.productCatalog.loadSubCategories(categoryId ?? '');
    }
  }

  // CHANGED: one image that replaces the previous pick (was: up to 5, of which only the first was ever saved),
  // with an empty-file check and a preview.
  protected addProductImage(file: File): void {
    if (this.isSubmitting()) return;
    const error = this.productImageError(file);
    if (error) {
      this.imageError.set(error);
      return;
    }
    this.imageError.set('');
    // CHANGED (new): the image's own S3 file name is fixed now, so every upload attempt of it uses the same name.
    this.imageFileName(file);
    this.setImagePreview(URL.createObjectURL(file));
    this.productImages.set([file]);
    this.saved.set(false);
  }

  /** The unique S3 file name of a selected image (generated once per selected file). */
  // CHANGED (new)
  protected imageFileName(file: File): string {
    return this.imageUpload.fileName(file);
  }

  /** The reason a file cannot be the product image, or null when it can. */
  // CHANGED (new): the type and size checks moved here from addProductImage, plus an empty-file check.
  // The size message now speaks of one image ("Each image…" before).
  protected productImageError(file: File): string | null {
    if (!PRODUCT_IMAGE_TYPES.split(',').includes(file.type)) return 'Choose a PNG, JPG, or WEBP image.';
    if (file.size === 0) return 'The selected image is empty. Choose another file.';
    if (file.size > MAX_IMAGE_BYTES) return 'The image must be 5 MB or smaller.';
    return null;
  }

  // CHANGED (new)
  protected removeProductImage(): void {
    if (this.isSubmitting()) return;
    this.clearProductImage();
    this.imageError.set('');
    this.saved.set(false);
  }

  /** The browser could not show the selected file, so it is not a usable image. */
  // CHANGED (new)
  protected previewFailed(): void {
    this.clearProductImage();
    this.imageError.set('This file could not be read as an image. Choose another file.');
  }

  protected clearProductImage(): void {
    this.setImagePreview(null);
    this.productImages.set([]);
  }

  /**
   * S3 key of the image, "products/<its unique file name>": uploads it with that file name and folder (the key is
   * returned once the upload confirms it), or reuses the key when this same file was already uploaded by an
   * earlier attempt (for example when the upload worked but saving the product failed). The file name is the one
   * generated when the image was selected, so the upload and PRODUCT_IMAGE always name the same file.
   */
  // CHANGED: sends the file name generated at selection and the product image folder.
  protected uploadProductImage(file: File): Observable<string> {
    const uploadedKey = this.imageUpload.uploadedKey(file);
    if (uploadedKey) return of(uploadedKey);
    this.saveStage.set('uploading');
    return this.imageUpload.upload(file).pipe(
      catchError((error: unknown) => {
        const message = this.s3Images.uploadErrorMessage(error);
        this.imageError.set(message);
        return throwError(() => new Error(message));
      }),
    );
  }

  private setImagePreview(url: string | null): void {
    const previous = this.imagePreview();
    if (previous) URL.revokeObjectURL(previous);
    this.imagePreview.set(url);
  }

  protected setProductVideo(file: File): void {
    if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
      this.videoError.set('Choose an MP4 or MOV video.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      this.videoError.set('The video must be 20 MB or smaller.');
      return;
    }
    this.videoError.set('');
    this.productVideo.set(file);
    this.saved.set(false);
  }

  protected saveProduct(): void {
    if (this.isSubmitting()) return;
    this.attemptedSave.set(true);
    const validationFields = [...ADD_PRODUCT_REQUIRED_FIELDS, 'discount'];
    const image = this.selectedImage();
    if (validationFields.some((field) => this.fieldError(field) !== null) || !image) return;
    const payload = this.createProductPayload();
    this.isSubmitting.set(true);
    this.sellerOnboarding.getSellerIdForCurrentUser(payload.SELLER_ID).pipe(
      // CHANGED: the image is uploaded to S3 first; the product is created only with the returned key.
      switchMap((sellerId) =>
        this.uploadProductImage(image).pipe(
          switchMap((imageKey) => {
            this.saveStage.set('saving');
            return this.productCatalog.insertProduct({ ...payload, PRODUCT_IMAGE: imageKey, SELLER_ID: sellerId });
          }),
        ),
      ),
      tap((message) => {
        this.cancel();
        this.saved.set(true);
        this.toast.showSuccess(message);
        void this.addProductRouter.navigateByUrl(APP_ROUTES.addProduct);
      }),
      catchError((error: unknown) => {
        this.toast.showError(this.productCatalog.getErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => {
        this.isSubmitting.set(false);
        this.saveStage.set('idle');
      }),
      takeUntilDestroyed(this.dropdownDestroyRef),
    ).subscribe();
  }

  protected createProductPayload(
    media: { imagePath?: string; videoPath?: string | null } = {},
  ): Omit<ProductInsertPayload, 'CREATED_BY'> {
    const values = this.values();
    const taxRateLabel = this.taxRateLookup().options.find((option) => option.id === values['taxRate'])?.label ?? '';
    const numeric = (name: string): number => Number(values[name]);
    const optionalNumeric = (name: string): number | null =>
      values[name]?.trim() ? Number(values[name]) : null;
    const videoName = this.productVideo()?.name.split(/[\\/]/).pop();

    return {
      PRODUCT_NAME: values['productName'].trim(),
      CATEGORY_ID: numeric('category'),
      SUB_CATEGORY_ID: numeric('subcategory'),
      BRAND_ID: numeric('brand'),
      // CHANGED: the S3 key returned by s3/upload (or the product's saved image). It used to be made up from
      // the local file name ("uploads/products/<name>"), a file that was never uploaded anywhere.
      PRODUCT_IMAGE: media.imagePath ?? '',
      // The S3 API accepts images only, so the video keeps its existing path format.
      PRODUCT_VIDEO: media.videoPath !== undefined
        ? media.videoPath
        : videoName ? `uploads/videos/${videoName}` : null,
      PRODUCT_DESCRIPTION: values['description'].trim(),
      HSN_CODE: values['hsnCode'].trim(),
      TAX_RATE: Number(taxRateLabel.replace('%', '').trim()),
      SELLING_PRICE: numeric('sellingPrice'),
      PRICE: numeric('mrp'),
      DISCOUNT: optionalNumeric('discount') ?? 0,
      STOCK_QUANTITY: numeric('stockQuantity'),
      MINIMUM_ORDER_QUANTITY: numeric('minimumOrderQuantity'),
      MAXIMUM_ORDER_QUANTITY: numeric('maximumOrderQuantity'),
      WEIGHT: optionalNumeric('weight'),
      LENGTH: optionalNumeric('length'),
      WIDTH: optionalNumeric('width'),
      HEIGHT: optionalNumeric('height'),
      SELLER_ID: PRODUCT_SELLER_ID,
    };
  }

  protected cancel(): void {
    this.values.set({});
    // CHANGED: also releases the preview (uploads are remembered per selected file, so none carries over).
    this.clearProductImage();
    this.productVideo.set(null);
    this.imageError.set('');
    this.videoError.set('');
    this.hasVariants.set(false);
    this.attemptedSave.set(false);
    this.saved.set(false);
  }
}
