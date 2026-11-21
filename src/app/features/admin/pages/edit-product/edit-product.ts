import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { FileUpload } from '@shared/components/file-upload/file-upload';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { ProductCatalogService, ProductDetails, ProductLookupOption, ProductUpdatePayload } from '@core/services/product-catalog.service';
import { isS3ImageKey } from '@core/services/s3-image.service';
import { ToastService } from '@core/services/toast.service';
import { AddProduct, REQUIRED_FIELDS } from '../add-product/add-product';

const DIMENSION_FIELDS = ['weight', 'length', 'width', 'height'] as const;

// CHANGED: one image (the product's saved image or a new pick that replaces it); was a gallery of up to 5.
interface GalleryImage {
  id: number;
  src: string;
  alt: string;
  /** Present only for a newly selected image (uploaded when the product is updated). */
  file?: File;
}

/** The product's saved image (PRODUCT_IMAGE) and the URL it is shown with. */
// CHANGED (new): an S3 key gets its URL from the S3 API, so it starts as 'loading'.
interface SavedImage {
  path: string;
  src: string | null;
  status: 'loading' | 'ready' | 'error';
}

const NEW_IMAGE_ID = 2;
const SAVED_IMAGE_ID = 1;

interface ProductCodeLookupState {
  status: 'loading' | 'success' | 'error';
  options: ProductLookupOption[];
  error: string | null;
}

type ProductDetailsStatus = 'loading' | 'success' | 'notFound' | 'error';

/**
 * Edit Product screen. Reuses the Add Product form state, validation and
 * upload rules (inherited from AddProduct) and adds prefilling, an image
 * gallery and video replace/remove behaviour.
 */
@Component({
  selector: 'app-edit-product',
  imports: [Button, Card, FileUpload, Input, LoadingSpinner, RouterLink, Select, Textarea],
  templateUrl: './edit-product.html',
  styleUrls: ['../add-product/add-product.scss', './edit-product.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProduct extends AddProduct {
  protected override readonly loadDropdownLookups = true;

  /** Bound from the `:id` route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly editProductCatalog = inject(ProductCatalogService);
  private readonly editToast = inject(ToastService);
  private readonly selectedProductIds = new Subject<string>();
  // CHANGED (new): S3 key of the loaded product's image, or null to stop loading a previous one.
  private readonly savedImageKeys = new Subject<string | null>();
  private readonly lookupPrefill = signal<{ category: string; subcategory: string; brand: string; taxRate: string } | null>(null);
  private readonly lookupPrefillStage = signal<'category' | 'subcategory' | 'brand' | 'done'>('done');
  private readonly taxRatePrefilled = signal(false);
  private readonly selectedProductCodes = new Subject<ProductDetails | undefined>();
  protected readonly productDetailsStatus = signal<ProductDetailsStatus>('loading');
  protected readonly productDetailsError = signal<string | null>(null);
  protected readonly productCodeLookup = signal<ProductCodeLookupState>({
    status: 'loading', options: [], error: null,
  });
  protected readonly productCodeDetailError = signal<string | null>(null);

  protected readonly product = signal<ProductDetails | null>(null);
  // CHANGED (new)
  protected readonly savedImage = signal<SavedImage | null>(null);
  private readonly savedImageRemoved = signal(false);
  /** True when the update will send an image: a new pick, or the saved image the user kept. */
  protected readonly hasProductImage = computed(
    () => !!this.selectedImage() || (!!this.savedImage() && !this.savedImageRemoved()),
  );
  /** The image shown: the new pick's preview, otherwise the saved image once its URL is known. */
  // CHANGED: derived from the selected file and the saved image (was a list the screen added to).
  protected readonly gallery = computed<GalleryImage[]>(() => {
    const file = this.selectedImage();
    const preview = this.imagePreview();
    if (file && preview) return [{ id: NEW_IMAGE_ID, src: preview, alt: file.name, file }];
    const saved = this.savedImage();
    if (!saved?.src || this.savedImageRemoved()) return [];
    return [{ id: SAVED_IMAGE_ID, src: saved.src, alt: this.product()?.PRODUCT_NAME ?? '' }];
  });
  protected readonly activeImage = computed(() => this.gallery()[0] ?? null);
  protected readonly videoRemoved = signal(false);
  protected readonly existingVideoUrl = signal<string | null>(null);
  protected readonly hasVideo = computed(() => !!this.productVideo() || (!!this.existingVideoUrl() && !this.videoRemoved()));
  protected readonly videoLabel = computed(() => this.productVideo()?.name ?? this.product()?.PRODUCT_VIDEO ?? 'Current product video');
  protected readonly dimensionFields = DIMENSION_FIELDS;

  constructor() {
    super();
    this.selectedProductIds.pipe(
      switchMap((productId) => {
        this.productDetailsStatus.set('loading');
        this.productDetailsError.set(null);
        this.product.set(null);
        this.loadProduct(undefined);
        return this.editProductCatalog.loadProductById(productId).pipe(
          tap((details) => {
            if (!details) {
              this.productDetailsStatus.set('notFound');
              return;
            }
            this.loadProduct(details);
            this.productDetailsStatus.set('success');
          }),
          catchError((error: unknown) => {
            const message = this.editProductCatalog.getErrorMessage(error);
            this.productDetailsError.set(message);
            this.productDetailsStatus.set('error');
            this.editToast.showError(message);
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
    this.selectedProductCodes.pipe(
      switchMap((product) => {
        if (!product) {
          this.productCodeDetailError.set(null);
          this.productCodeLookup.set({ status: 'success', options: [], error: null });
          return EMPTY;
        }
        this.productCodeDetailError.set(null);
        this.productCodeLookup.set({ status: 'loading', options: [], error: null });
        return forkJoin({
          options: this.editProductCatalog.loadProductCodes(-1),
          productCodes: this.editProductCatalog.loadProductCodes(product.PRODUCT_ID).pipe(
            catchError((error: unknown) => {
              this.productCodeDetailError.set(this.editProductCatalog.getErrorMessage(error));
              return of([] as ProductLookupOption[]);
            }),
          ),
        }).pipe(
          tap(({ options, productCodes }) => {
          const currentCode = product.PRODUCT_CODE_SKU.trim().toLocaleLowerCase();
            const availableOptions = [...options];
            for (const productCode of productCodes) {
              if (!availableOptions.some((option) => option.id === productCode.id)) {
                availableOptions.push(productCode);
              }
            }
            const selectedFromProduct =
              productCodes.find((option) =>
                option.label.trim().toLocaleLowerCase() === currentCode,
              ) ??
              (productCodes.length === 1 ? productCodes[0] : undefined);
            const selected = (selectedFromProduct && availableOptions.find((option) => option.id === selectedFromProduct.id)) ??
              availableOptions.find((option) =>
                option.label.trim().toLocaleLowerCase() === currentCode,
              );
            this.values.update((values) => ({ ...values, sku: selected?.id ?? '' }));
            this.productCodeLookup.set({ status: 'success', options: availableOptions, error: null });
          }),
          catchError((error: unknown) => {
            const message = this.editProductCatalog.getErrorMessage(error);
            this.productCodeLookup.set({ status: 'error', options: [], error: message });
            this.editToast.showError(message);
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
    // CHANGED (new): the saved image's URL from the S3 API (cached by S3ImageService). switchMap drops the
    // result for a product the screen no longer shows.
    this.savedImageKeys.pipe(
      switchMap((imageKey) => !imageKey ? EMPTY : this.s3Images.imageUrl(imageKey).pipe(
        tap((src) => this.updateSavedImage(imageKey, { src, status: 'ready' })),
        catchError(() => {
          this.updateSavedImage(imageKey, { src: null, status: 'error' });
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
    effect(() => this.applyLookupPrefill());
    effect(() => {
      const productId = this.id();
      untracked(() => this.selectedProductIds.next(productId));
    });
  }

  protected setVariants(event: Event): void {
    const control = event.target;
    if (control instanceof HTMLInputElement) {
      this.hasVariants.set(control.checked);
      this.saved.set(false);
    }
  }

  // CHANGED: one file; a new pick replaces the shown image (validation and preview come from AddProduct).
  protected onImagesPicked(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.addProductImage(file);
  }

  /** Discards a new pick (the saved image shows again), or removes the saved image. */
  // CHANGED: no argument; there is only one image.
  protected removeImage(): void {
    if (this.isSubmitting()) return;
    if (this.selectedImage()) this.clearProductImage();
    else this.savedImageRemoved.set(true);
    this.imageError.set('');
    this.saved.set(false);
  }

  /** An image that cannot be displayed: the new pick is rejected; the saved image is kept but marked unavailable. */
  // CHANGED (new)
  protected galleryImageFailed(image: GalleryImage): void {
    if (image.file) {
      this.previewFailed();
      return;
    }
    const saved = this.savedImage();
    if (saved) this.updateSavedImage(saved.path, { src: null, status: 'error' });
  }

  private updateSavedImage(path: string, changes: Pick<SavedImage, 'src' | 'status'>): void {
    this.savedImage.update((image) => image?.path === path ? { ...image, ...changes } : image);
  }

  protected onVideoPicked(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.setProductVideo(file);
    if (!this.videoError()) this.videoRemoved.set(false);
  }

  protected removeVideo(): void {
    this.productVideo.set(null);
    this.videoError.set('');
    this.videoRemoved.set(true);
    this.saved.set(false);
  }

  protected override setProductVideo(file: File): void {
    super.setProductVideo(file);
    if (this.productVideo() === file) this.videoRemoved.set(false);
  }

  protected override fieldError(name: string): string | null {
    if (name === 'sku' && this.attemptedSave()) {
      const selectedCodeId = this.valueFor(name).trim();
      if (!selectedCodeId) return 'This field is required.';
      return this.productCodeLookup().options.some((option) => option.id === selectedCodeId)
        ? null
        : 'Please select a valid product code.';
    }
    if (!(DIMENSION_FIELDS as readonly string[]).includes(name)) return super.fieldError(name);
    if (!this.attemptedSave()) return null;
    const value = this.valueFor(name).trim();
    if (!value) {
      return name === 'weight' || name === 'length' ? 'This field is required.' : null;
    }
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? null : 'Enter a value greater than 0.';
  }

  protected override updateCategory(event: Event): void {
    this.lookupPrefillStage.set('done');
    this.lookupPrefill.set(null);
    super.updateCategory(event);
  }

  protected override updateSubcategory(event: Event): void {
    this.lookupPrefillStage.set('done');
    this.lookupPrefill.set(null);
    super.updateSubcategory(event);
  }

  protected retryProductCodeLookup(): void {
    this.productCodeDetailError.set(null);
    const product = this.product();
    if (product) this.selectedProductCodes.next(product);
  }

  protected retryProductDetails(): void {
    this.selectedProductIds.next(this.id());
  }

  private applyLookupPrefill(): void {
    const target = this.lookupPrefill();
    if (!target) return;

    const taxLookup = this.taxRateLookup();
    if (!this.taxRatePrefilled() && taxLookup.status === 'success') {
      const match = this.findTaxRateOption(taxLookup.options, target.taxRate);
      if (match) this.values.update((values) => ({ ...values, taxRate: match.id }));
      this.taxRatePrefilled.set(true);
    }

    const stage = this.lookupPrefillStage();
    if (stage === 'category' && this.categoryLookup().status === 'success') {
      const category = this.findLookupOption(this.categoryLookup().options, target.category);
      if (!category) {
        this.lookupPrefillStage.set('done');
        return;
      }
      this.values.update((values) => ({ ...values, category: category.id, subcategory: '', brand: '' }));
      this.lookupPrefillStage.set('subcategory');
      this.loadLookup('subcategory', category.id);
      return;
    }

    if (stage === 'subcategory' && this.subcategoryLookup().status === 'success') {
      const subcategory = this.findLookupOption(this.subcategoryLookup().options, target.subcategory);
      if (!subcategory) {
        this.lookupPrefillStage.set('done');
        return;
      }
      const categoryId = this.valueFor('category');
      this.values.update((values) => ({ ...values, subcategory: subcategory.id, brand: '' }));
      this.lookupPrefillStage.set('brand');
      this.loadLookup('brand', categoryId, subcategory.id);
      return;
    }

    if (stage === 'brand' && this.brandLookup().status === 'success') {
      const brand = this.findLookupOption(this.brandLookup().options, target.brand);
      if (brand) this.values.update((values) => ({ ...values, brand: brand.id }));
      this.lookupPrefillStage.set('done');
    }
  }

  private findTaxRateOption(options: readonly ProductLookupOption[], target: string): ProductLookupOption | undefined {
    const targetValue = target.trim().replace(/%$/, '').trim();
    const targetRate = Number(targetValue);
    if (!targetValue || !Number.isFinite(targetRate)) return undefined;
    return options.find((option) => {
      const optionValue = option.label.trim().replace(/%$/, '').trim();
      const optionRate = Number(optionValue);
      return optionValue !== '' && Number.isFinite(optionRate) && optionRate === targetRate;
    });
  }

  private findLookupOption(options: readonly { id: string; label: string }[], target: string) {
    const normalizedTarget = target.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const idSuffix = /(?:category|subcategory|brand)[-_](\d+)$/i.exec(normalizedTarget)?.[1];
    return options.find((option) =>
      option.label.trim().toLocaleLowerCase().replace(/\s+/g, ' ') === normalizedTarget ||
      option.id === target.trim() ||
      (idSuffix !== undefined && option.id === idSuffix) ||
      option.label.replace(/%$/, '').trim() === target.replace(/%$/, '').trim(),
    );
  }

  protected override saveProduct(): void {
    if (this.isSubmitting()) return;
    this.attemptedSave.set(true);
    const fields = [...REQUIRED_FIELDS, 'discount', ...DIMENSION_FIELDS];
    if (fields.some((field) => this.fieldError(field) !== null) || !this.hasProductImage()) return;
    const product = this.product();
    if (!product) return;

    // CHANGED: a new image is uploaded to S3 and its key is sent; otherwise the saved PRODUCT_IMAGE is kept
    // exactly as stored. (A new image used to be sent as a made-up "uploads/products/<file name>" path.)
    const newImage = this.selectedImage();
    const savedImagePath = this.savedImageRemoved() ? null : this.savedImage()?.path ?? null;
    if (!newImage && !savedImagePath) {
      this.imageError.set('Please select a product image.');
      return;
    }

    const newVideo = this.productVideo();
    const videoName = newVideo?.name.split(/[\\/]/).pop() ?? newVideo?.name;
    const videoPath = videoName
      ? `uploads/videos/${videoName}`
      : this.videoRemoved()
        ? null
        : product.PRODUCT_VIDEO;
    const payload: Omit<ProductUpdatePayload, 'CREATED_BY'> = {
      PRODUCT_ID: product.PRODUCT_ID,
      ...this.createProductPayload({ imagePath: savedImagePath ?? '', videoPath }),
    };

    this.isSubmitting.set(true);
    this.sellerOnboarding.getSellerIdForCurrentUser(payload.SELLER_ID).pipe(
      switchMap((sellerId) =>
        (newImage ? this.uploadProductImage(newImage) : of(payload.PRODUCT_IMAGE)).pipe(
          switchMap((imagePath) => {
            this.saveStage.set('saving');
            return this.editProductCatalog.updateProduct({ ...payload, PRODUCT_IMAGE: imagePath, SELLER_ID: sellerId });
          }),
        ),
      ),
      tap((message) => {
        this.saved.set(true);
        this.editToast.showSuccess(message);
        void this.router.navigateByUrl('/admin/products/all');
      }),
      catchError((error: unknown) => {
        this.editToast.showError(this.editProductCatalog.getErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => {
        this.isSubmitting.set(false);
        this.saveStage.set('idle');
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  protected override cancel(): void {
    void this.router.navigateByUrl('/admin/products/all');
  }

  private loadProduct(product: ProductDetails | null | undefined): void {
    // CHANGED: also releases a new pick's preview and resets the saved image.
    this.clearProductImage();
    this.savedImageRemoved.set(false);
    this.productVideo.set(null);
    this.videoRemoved.set(false);
    this.existingVideoUrl.set(null);
    this.attemptedSave.set(false);
    this.saved.set(false);
    this.imageError.set('');
    this.videoError.set('');
    if (!product) {
      this.selectedProductCodes.next(undefined);
      this.values.set({});
      this.setSavedImage(null);
      this.lookupPrefill.set(null);
      return;
    }
    this.values.set({
      productName: product.PRODUCT_NAME,
      sku: product.PRODUCT_CODE_SKU,
      category: '',
      subcategory: '',
      brand: '',
      description: product.PRODUCT_DESCRIPTION,
      hsnCode: product.HSN_CODE,
      taxRate: product.TAX_RATE,
      sellingPrice: product.SELLING_PRICE,
      mrp: product.PRICE,
      discount: product.DISCOUNT,
      stockQuantity: product.STOCK_QUANTITY,
      minimumOrderQuantity: product.MINIMUM_ORDER_QUANTITY,
      maximumOrderQuantity: product.MAXIMUM_ORDER_QUANTITY,
      weight: product.WEIGHT,
      length: product.LENGTH,
      width: product.WIDTH,
      height: product.HEIGHT,
    });
    this.lookupPrefill.set({
      category: product.CATEGORY_ID,
      subcategory: product.SUB_CATEGORY_ID,
      brand: product.BRAND_ID,
      taxRate: product.TAX_RATE,
    });
    this.lookupPrefillStage.set('category');
    this.taxRatePrefilled.set(false);
    this.hasVariants.set(product.HAS_VARIANTS ?? false);
    this.setSavedImage(product.PRODUCT_IMAGE);
    this.existingVideoUrl.set(this.mediaUrl(product.PRODUCT_VIDEO));
    this.selectedProductCodes.next(product);
    this.product.set(product);
  }

  /** An S3 key is shown once the S3 API returns its URL; any other saved path is shown as before. */
  // CHANGED (new)
  private setSavedImage(path: string | null): void {
    const value = path?.trim() ?? '';
    const isS3Key = isS3ImageKey(value);
    this.savedImage.set(!value ? null : isS3Key
      ? { path: value, src: null, status: 'loading' }
      : { path: value, src: this.mediaUrl(value), status: 'ready' });
    this.savedImageKeys.next(isS3Key ? value : null);
  }

  private mediaUrl(path: string | null): string | null {
    const value = path?.trim();
    if (!value) return null;
    if (/^(?:https?:|blob:|data:)/i.test(value)) return value;
    return `/${value.replace(/^\/+/, '')}`;
  }
}
