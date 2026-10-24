import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { FileUpload } from '@shared/components/file-upload/file-upload';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';
import { ADMIN_PRODUCT_DETAILS, AdminProductRow, findAdminProduct } from '../../data/admin-products';
import { AddProduct, REQUIRED_FIELDS } from '../add-product/add-product';

const DIMENSION_FIELDS = ['weight', 'length', 'width', 'height'] as const;
const MAX_IMAGES = 5;

interface GalleryImage {
  id: number;
  src: string;
  alt: string;
  /** Present only for images added in this session (not yet uploaded). */
  file?: File;
}

/**
 * Edit Product screen. Reuses the Add Product form state, validation and
 * upload rules (inherited from AddProduct) and adds prefilling, an image
 * gallery and video replace/remove behaviour.
 */
@Component({
  selector: 'app-edit-product',
  imports: [Button, Card, FileUpload, Input, RouterLink, Select, Textarea],
  templateUrl: './edit-product.html',
  styleUrls: ['../add-product/add-product.scss', './edit-product.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProduct extends AddProduct {
  /** Bound from the `:id` route param (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private nextImageId = 1;

  protected readonly product = computed<AdminProductRow | undefined>(() => findAdminProduct(this.id()));
  protected readonly gallery = signal<GalleryImage[]>([]);
  protected readonly activeImageId = signal<number | null>(null);
  protected readonly activeImage = computed(
    () => this.gallery().find((image) => image.id === this.activeImageId()) ?? this.gallery()[0] ?? null,
  );
  protected readonly videoRemoved = signal(false);
  protected readonly hasVideo = computed(() => !this.videoRemoved() || !!this.productVideo());
  protected readonly videoLabel = computed(() => this.productVideo()?.name ?? 'Current product video');
  protected readonly dimensionFields = DIMENSION_FIELDS;
  protected readonly maxImages = MAX_IMAGES;
  protected readonly canAddImage = computed(() => this.gallery().length < MAX_IMAGES);

  constructor() {
    super();
    effect(() => {
      const product = this.product();
      untracked(() => this.loadProduct(product));
    });
    this.destroyRef.onDestroy(() => this.gallery().forEach((image) => this.release(image)));
  }

  protected setVariants(event: Event): void {
    const control = event.target;
    if (control instanceof HTMLInputElement) {
      this.hasVariants.set(control.checked);
      this.saved.set(false);
    }
  }

  protected selectImage(image: GalleryImage): void {
    this.activeImageId.set(image.id);
  }

  protected override addProductImage(file: File): void {
    if (this.gallery().length >= MAX_IMAGES) {
      this.imageError.set(`You can upload up to ${MAX_IMAGES} images.`);
      return;
    }
    const before = this.productImages().length;
    super.addProductImage(file);
    if (this.productImages().length === before) return; // rejected by base validation
    const image: GalleryImage = { id: this.nextImageId++, src: URL.createObjectURL(file), alt: file.name, file };
    this.gallery.update((images) => [...images, image]);
    this.activeImageId.set(image.id);
  }

  protected onImagesPicked(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    for (const file of Array.from(input.files ?? [])) this.addProductImage(file);
    input.value = '';
  }

  protected removeImage(image: GalleryImage): void {
    this.gallery.update((images) => images.filter((item) => item.id !== image.id));
    if (image.file) this.productImages.update((files) => files.filter((file) => file !== image.file));
    this.release(image);
    if (this.activeImageId() === image.id) this.activeImageId.set(null);
    this.imageError.set('');
    this.saved.set(false);
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
    if (!(DIMENSION_FIELDS as readonly string[]).includes(name)) return super.fieldError(name);
    if (!this.attemptedSave()) return null;
    const value = this.valueFor(name).trim();
    if (!value) {
      return name === 'weight' || name === 'length' ? 'This field is required.' : null;
    }
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? null : 'Enter a value greater than 0.';
  }

  protected override saveProduct(): void {
    this.attemptedSave.set(true);
    const fields = [...REQUIRED_FIELDS, 'discount', ...DIMENSION_FIELDS];
    if (fields.some((field) => this.fieldError(field) !== null) || !this.gallery().length) return;
    this.saved.set(true);
  }

  protected override cancel(): void {
    void this.router.navigateByUrl('/admin/products/all');
  }

  private loadProduct(product: AdminProductRow | undefined): void {
    this.gallery().forEach((image) => this.release(image));
    this.productImages.set([]);
    this.productVideo.set(null);
    this.videoRemoved.set(false);
    this.attemptedSave.set(false);
    this.saved.set(false);
    this.imageError.set('');
    this.videoError.set('');
    if (!product) {
      this.values.set({});
      this.gallery.set([]);
      return;
    }
    const { hasVariants, ...details } = ADMIN_PRODUCT_DETAILS;
    this.values.set({
      ...details,
      productName: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      sellingPrice: product.price.replace(/[^\d.]/g, ''),
      stockQuantity: String(product.stock),
    });
    this.hasVariants.set(hasVariants);
    this.gallery.set(
      Array.from({ length: 3 }, () => ({ id: this.nextImageId++, src: product.image, alt: product.name })),
    );
    this.activeImageId.set(null);
  }

  private release(image: GalleryImage): void {
    if (image.file) URL.revokeObjectURL(image.src);
  }
}
