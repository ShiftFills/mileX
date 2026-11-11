import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, Observable, Subscription, catchError, finalize, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { FileUpload } from '@shared/components/file-upload/file-upload';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';
import { ProductCatalogService, ProductInsertPayload, ProductLookupOption } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';

export const REQUIRED_FIELDS = [
  'productName', 'sku', 'category', 'subcategory', 'brand', 'description', 'hsnCode', 'taxRate',
  'sellingPrice', 'mrp', 'stockQuantity', 'minimumOrderQuantity', 'maximumOrderQuantity',
] as const;
const ADD_PRODUCT_REQUIRED_FIELDS = REQUIRED_FIELDS.filter((field) => field !== 'sku');
const PRODUCT_SELLER_ID = 1;
const PRODUCT_CREATED_BY = 2;

type ProductLookupName = 'category' | 'brand' | 'taxRate' | 'subcategory';
type ProductLookupStatus = 'loading' | 'success' | 'error';

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
  private readonly toast = inject(ToastService);
  private readonly addProductRouter = inject(Router);
  private readonly dropdownDestroyRef = inject(DestroyRef);
  private subcategoryRequest?: Subscription;
  private brandRequest?: Subscription;
  protected readonly loadDropdownLookups: boolean = true;
  protected readonly values = signal<Record<string, string>>({});
  protected readonly attemptedSave = signal(false);
  protected readonly saved = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly hasVariants = signal(false);
  protected readonly productImages = signal<File[]>([]);
  protected readonly imageFileNames = computed(() => this.productImages().map((file) => file.name).join(', '));
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

  protected addProductImage(file: File): void {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.imageError.set('Choose a PNG, JPG, or WEBP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.imageError.set('Each image must be 5 MB or smaller.');
      return;
    }
    if (this.productImages().length >= 5) {
      this.imageError.set('You can upload up to 5 images.');
      return;
    }
    this.imageError.set('');
    this.productImages.update((files) => [...files, file]);
    this.saved.set(false);
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
    if (validationFields.some((field) => this.fieldError(field) !== null) || !this.productImages().length) return;
    const payload = this.createProductPayload();
    this.isSubmitting.set(true);
    this.productCatalog.insertProduct(payload).pipe(
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
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.dropdownDestroyRef),
    ).subscribe();
  }

  protected createProductPayload(media: { imagePath?: string; videoPath?: string | null } = {}): ProductInsertPayload {
    const values = this.values();
    const taxRateLabel = this.taxRateLookup().options.find((option) => option.id === values['taxRate'])?.label ?? '';
    const numeric = (name: string): number => Number(values[name]);
    const optionalNumeric = (name: string): number | null =>
      values[name]?.trim() ? Number(values[name]) : null;
    const imageFile = this.productImages()[0];
    const imageName = imageFile?.name.split(/[\\/]/).pop() ?? imageFile?.name;
    const videoName = this.productVideo()?.name.split(/[\\/]/).pop();

    return {
      PRODUCT_NAME: values['productName'].trim(),
      CATEGORY_ID: numeric('category'),
      SUB_CATEGORY_ID: numeric('subcategory'),
      BRAND_ID: numeric('brand'),
      PRODUCT_IMAGE: media.imagePath ?? (imageName ? `uploads/products/${imageName}` : ''),
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
      CREATED_BY: PRODUCT_CREATED_BY,
    };
  }

  protected cancel(): void {
    this.values.set({});
    this.productImages.set([]);
    this.productVideo.set(null);
    this.imageError.set('');
    this.videoError.set('');
    this.hasVariants.set(false);
    this.attemptedSave.set(false);
    this.saved.set(false);
  }
}
