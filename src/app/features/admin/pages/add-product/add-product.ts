import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError } from 'rxjs';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { FileUpload } from '@shared/components/file-upload/file-upload';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';
import { ProductCatalogService, ProductLookupOption } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';

export const REQUIRED_FIELDS = [
  'productName', 'sku', 'category', 'subcategory', 'brand', 'description', 'hsnCode', 'taxRate',
  'sellingPrice', 'mrp', 'stockQuantity', 'minimumOrderQuantity', 'maximumOrderQuantity',
] as const;

type ProductLookupName = 'category' | 'brand' | 'taxRate';
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
  private readonly dropdownDestroyRef = inject(DestroyRef);
  protected readonly loadDropdownLookups: boolean = true;
  protected readonly values = signal<Record<string, string>>({});
  protected readonly attemptedSave = signal(false);
  protected readonly saved = signal(false);
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
    status: 'loading',
    options: [],
    error: null,
  });
  protected readonly taxRateLookup = signal<ProductLookupState>({
    status: 'loading',
    options: [],
    error: null,
  });

  // Retained for the existing Edit Product screen, which reuses this component's validation.
  protected readonly categories = ['Electronics', 'Fashion', 'Home & Living', 'Beauty & Personal Care'];
  protected readonly subCategories = ['Mobile Phones', 'Laptops', 'Accessories', 'Wearables', 'Audio'];
  protected readonly brands = ['MileX', 'Samsung', 'Apple', 'Other'];
  protected readonly taxRates = ['0%', '5%', '12%', '18%', '28%'];

  ngOnInit(): void {
    if (!this.loadDropdownLookups) return;
    this.loadLookup('category');
    this.loadLookup('brand');
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

  protected fieldError(name: string): string | null {
    if (!this.attemptedSave()) return null;
    const value = this.valueFor(name).trim();
    const required = REQUIRED_FIELDS.includes(name as (typeof REQUIRED_FIELDS)[number]);
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
        return validNumber && number >= 0 && number <= 100
          ? null
          : 'Enter a discount between 0 and 100.';
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
    this.loadLookup(name);
  }

  private validLookupId(options: readonly ProductLookupOption[], id: string): string | null {
    return options.some((option) => option.id === id)
      ? null
      : 'Please select a valid option.';
  }

  private loadLookup(name: ProductLookupName): void {
    const state = this.lookupStateFor(name);
    state.set({ ...state(), status: 'loading', error: null });
    const request = this.lookupRequest(name);
    request
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
  }

  private lookupStateFor(name: ProductLookupName) {
    switch (name) {
      case 'category': return this.categoryLookup;
      case 'brand': return this.brandLookup;
      case 'taxRate': return this.taxRateLookup;
    }
  }

  private lookupRequest(name: ProductLookupName): Observable<ProductLookupOption[]> {
    switch (name) {
      case 'category': return this.productCatalog.loadCategories();
      case 'brand': return this.productCatalog.loadBrands();
      case 'taxRate': return this.productCatalog.loadTaxRates();
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
    this.attemptedSave.set(true);
    const validationFields = [...REQUIRED_FIELDS, 'discount'];
    if (validationFields.some((field) => this.fieldError(field) !== null) || !this.productImages().length) return;
    this.saved.set(true);
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
