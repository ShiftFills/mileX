import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EMPTY, catchError, distinctUntilChanged, expand, finalize, map, switchMap, tap, toArray } from 'rxjs';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';
import { Button } from '@shared/components/button/button';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Product } from '@shared/models';
import {
  ProductVariantLookup,
  ProductVariantLookupOption,
  ProductVariant,
  ProductVariantInsertPayload,
  ProductVariantService,
  ProductVariantUpdatePayload,
} from '../../services/product-variant.service';

const PAGE_SIZE = 5;
const PRODUCT_PAGE_SIZE = 100;
const MAX_VARIANT_IMAGE_SIZE = 5 * 1024 * 1024;
const VARIANT_SELLER_ID = 1;
const VARIANT_SELLER_NAME = 'Arun Kumar';
const VARIANT_CREATED_BY = 2;

type VariantLookupState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  options: ProductVariantLookupOption[];
  error: string | null;
};

const EMPTY_LOOKUP_STATE: VariantLookupState = { status: 'idle', options: [], error: null };
const VARIANT_LOOKUP_NAMES: readonly ProductVariantLookup[] = ['colours', 'sizes', 'materials'];

@Component({
  selector: 'app-product-variants',
  imports: [DecimalPipe, FormsModule, Button, Dialog, Input, LoadingSpinner, Pagination, Select],
  templateUrl: './product-variants.html',
  styleUrl: './product-variants.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariants {
  private readonly variantService = inject(ProductVariantService);
  private readonly productCatalog = inject(ProductCatalogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly variants = signal<ProductVariant[]>([]);
  protected readonly products = signal<Product[]>([]);
  protected readonly productsStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly productsError = signal<string | null>(null);
  protected readonly loadStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;
  private readonly retryCount = signal(0);
  private readonly totalVariants = signal<number | null>(null);
  private readonly hasNextPage = signal(false);
  protected readonly totalCount = computed(() => this.totalVariants());
  protected readonly totalPages = computed(() => {
    const total = this.totalVariants();
    return total === null ? undefined : Math.ceil(total / PAGE_SIZE);
  });
  protected readonly canGoNext = computed(() =>
    this.totalPages() === undefined ? this.hasNextPage() : this.page() < this.totalPages()!,
  );
  private readonly pageRequest = computed(() => ({ page: this.page(), retry: this.retryCount() }));
  protected readonly dialog = signal<'add' | 'edit' | 'delete' | null>(null);
  protected readonly selected = signal<ProductVariant | null>(null);
  protected readonly menu = signal<string | null>(null);
  protected readonly menuPosition = signal<{ top: number; right: number } | null>(null);
  protected readonly form = signal({ productId: '', name: '', sku: '', barcode: '', size: '', sizeId: null as number | null, color: '', colorId: null as number | null, material: '', materialId: null as number | null, weight: '', price: '', stock: '' });
  protected readonly error = signal(false);
  protected readonly imageError = signal('');
  protected readonly selectedImage = signal<File | null>(null);
  protected readonly isSubmitting = signal(false);
  protected readonly variantLookups = signal<Record<ProductVariantLookup, VariantLookupState>>({
    colours: { ...EMPTY_LOOKUP_STATE },
    sizes: { ...EMPTY_LOOKUP_STATE },
    materials: { ...EMPTY_LOOKUP_STATE },
  });

  constructor() {
    toObservable(this.pageRequest)
      .pipe(
        distinctUntilChanged((previous, current) =>
          previous.page === current.page && previous.retry === current.retry,
        ),
        switchMap(({ page }) => {
          this.variants.set([]);
          this.totalVariants.set(null);
          this.hasNextPage.set(false);
          this.loadStatus.set('loading');
          this.loadError.set(null);
          return this.variantService.loadPage(page, PAGE_SIZE).pipe(
            tap((result) => {
              this.variants.set(result.items);
              this.totalVariants.set(result.total ?? null);
              this.hasNextPage.set(result.hasNext);
              this.loadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.loadError.set(this.variantService.getErrorMessage(error));
              this.loadStatus.set('error');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected retryLoad(): void {
    this.retryCount.update((count) => count + 1);
  }

  protected toggleMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.menu() === id) {
      this.menu.set(null);
      this.menuPosition.set(null);
      return;
    }

    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) return;
    const bounds = button.getBoundingClientRect();
    const menuHeight = 76;
    const top = window.innerHeight - bounds.bottom >= menuHeight + 8
      ? bounds.bottom + 4
      : Math.max(8, bounds.top - menuHeight - 4);
    this.menuPosition.set({
      top,
      right: Math.max(8, window.innerWidth - bounds.right),
    });
    this.menu.set(id);
  }

  @HostListener('document:click', ['$event'])
  protected closeMenuOutside(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('.action-cell')) return;
    this.menu.set(null);
    this.menuPosition.set(null);
  }

  protected retryProducts(): void {
    this.loadProducts();
  }

  private loadProducts(): void {
    if (this.productsStatus() === 'loading') return;
    this.productsStatus.set('loading');
    this.productsError.set(null);
    this.productCatalog.loadPage(1, PRODUCT_PAGE_SIZE).pipe(
      expand((result, index) =>
        result.hasNext
          ? this.productCatalog.loadPage(index + 2, PRODUCT_PAGE_SIZE)
          : EMPTY,
      ),
      map((result) => result.items),
      toArray(),
      map((pages) => pages.flat()),
      tap((products) => {
        this.products.set(products);
        this.productsStatus.set('success');
      }),
      catchError((error: unknown) => {
        const message = this.productCatalog.getErrorMessage(error);
        this.productsError.set(message);
        this.productsStatus.set('error');
        this.toast.showError(message);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  private loadVariantLookups(): void {
    for (const lookup of VARIANT_LOOKUP_NAMES) {
      if (this.variantLookups()[lookup].status === 'loading' || this.variantLookups()[lookup].status === 'success') {
        continue;
      }
      this.variantLookups.update((states) => ({
        ...states,
        [lookup]: { ...states[lookup], status: 'loading', error: null },
      }));
      this.variantService
        .loadLookup(lookup)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (options) =>
            this.variantLookups.update((states) => ({
              ...states,
              [lookup]: { status: 'success', options, error: null },
            })),
          error: (error: unknown) =>
            this.variantLookups.update((states) => ({
              ...states,
              [lookup]: {
                status: 'error',
                options: [],
                error: this.variantService.getErrorMessage(error),
              },
            })),
        });
    }
  }

  protected retryVariantLookup(lookup: ProductVariantLookup): void {
    this.variantLookups.update((states) => ({
      ...states,
      [lookup]: { ...EMPTY_LOOKUP_STATE },
    }));
    this.loadVariantLookups();
  }

  protected hasLookupValue(lookup: ProductVariantLookup, value: string): boolean {
    return !!value && !this.variantLookups()[lookup].options.some((option) => option.name === value);
  }

  protected sizeDropdownValue(): string {
    if (this.dialog() === 'add') {
      const sizeId = this.form().sizeId;
      return sizeId === null ? '' : String(sizeId);
    }
    const size = this.form().size;
    return this.variantLookups().sizes.options.find((option) => option.name === size)?.id ?? size;
  }

  protected setSizeField(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    if (this.dialog() === 'add') {
      const sizeId = Number(value);
      this.form.update((form) => ({
        ...form,
        sizeId: value && Number.isSafeInteger(sizeId) && sizeId > 0 ? sizeId : null,
      }));
      return;
    }
    const size = this.variantLookups().sizes.options.find((option) => option.id === value)?.name ?? value;
    this.form.update((form) => ({ ...form, size }));
  }

  protected colorDropdownValue(): string {
    if (this.dialog() === 'add') {
      const colorId = this.form().colorId;
      return colorId === null ? '' : String(colorId);
    }
    const color = this.form().color;
    return this.variantLookups().colours.options.find((option) => option.name === color)?.id ?? color;
  }

  protected setColorField(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    const option = this.variantLookups().colours.options.find((entry) => entry.id === value);
    if (this.dialog() === 'add') {
      const colorId = Number(value);
      this.form.update((form) => ({
        ...form,
        color: option?.name ?? '',
        colorId: value && Number.isSafeInteger(colorId) && colorId > 0 ? colorId : null,
      }));
      return;
    }
    this.form.update((form) => ({ ...form, color: option?.name ?? value }));
  }

  protected materialDropdownValue(): string {
    if (this.dialog() === 'add') {
      const materialId = this.form().materialId;
      return materialId === null ? '' : String(materialId);
    }
    const material = this.form().material;
    return this.variantLookups().materials.options.find((option) => option.name === material)?.id ?? material;
  }

  protected setMaterialField(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    const value = target.value;
    const option = this.variantLookups().materials.options.find((entry) => entry.id === value);
    if (this.dialog() === 'add') {
      const materialId = Number(value);
      this.form.update((form) => ({
        ...form,
        material: option?.name ?? '',
        materialId: value && Number.isSafeInteger(materialId) && materialId > 0 ? materialId : null,
      }));
      return;
    }
    this.form.update((form) => ({ ...form, material: option?.name ?? value }));
  }

  protected openAdd(): void {
    this.selected.set(null);
    this.form.set({ productId: '', name: '', sku: '', barcode: '', size: '', sizeId: null, color: '', colorId: null, material: '', materialId: null, weight: '', price: '', stock: '' });
    this.error.set(false);
    this.imageError.set('');
    this.selectedImage.set(null);
    this.dialog.set('add');
    if (this.productsStatus() !== 'success') this.loadProducts();
    this.loadVariantLookups();
  }
  protected openEdit(row: ProductVariant): void {
    this.selected.set(row);
    this.form.set({ productId: '', name: row.name, sku: row.sku, barcode: row.barcode, size: row.size, sizeId: null, color: row.color, colorId: null, material: row.material, materialId: null, weight: row.weight, price: String(row.price), stock: String(row.stock) });
    this.error.set(false);
    this.imageError.set('');
    this.dialog.set('edit');
    this.menu.set(null);
    this.menuPosition.set(null);
    this.loadVariantLookups();
  }
  protected openDelete(row: ProductVariant): void {
    this.selected.set(row);
    this.dialog.set('delete');
    this.menu.set(null);
    this.menuPosition.set(null);
  }
  protected close(): void {
    if (this.isSubmitting()) return;
    this.dialog.set(null);
    this.error.set(false);
    this.imageError.set('');
  }
  protected setField(key: keyof ReturnType<typeof this.form>, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) this.form.update((v) => ({ ...v, [key]: target.value }));
  }
  protected onImageChange(event: Event): void {
    const target = event.target;
    const file = target instanceof HTMLInputElement ? target.files?.[0] ?? null : null;
    this.imageError.set('');
    if (file && !file.type.startsWith('image/')) {
      this.selectedImage.set(null);
      this.imageError.set('Select an image file.');
      return;
    }
    if (file && file.size > MAX_VARIANT_IMAGE_SIZE) {
      this.selectedImage.set(null);
      this.imageError.set('The image must be 5 MB or smaller.');
      return;
    }
    this.selectedImage.set(file);
  }
  protected save(): void {
    if (this.isSubmitting()) return;
    const v = this.form();
    if (this.dialog() === 'add') {
      const productId = Number(v.productId);
      const weight = v.weight.trim() ? Number(v.weight) : null;
      const price = Number(v.price);
      const stock = Number(v.stock);
      const imageFile = this.selectedImage();
      const selectedProduct = this.products().find((product) => product.id === v.productId);
      if (
        !Number.isSafeInteger(productId) || productId <= 0 ||
        !v.name.trim() || !v.sku.trim() ||
        v.colorId === null || !Number.isSafeInteger(v.colorId) || v.colorId <= 0 ||
        (v.sizeId !== null && (!Number.isSafeInteger(v.sizeId) || v.sizeId <= 0)) ||
        !Number.isFinite(price) || price < 0 ||
        !Number.isSafeInteger(stock) || stock < 0 ||
        (weight !== null && (!Number.isFinite(weight) || weight < 0)) ||
        !imageFile
      ) {
        this.error.set(true);
        return;
      }
      if (!selectedProduct) {
        this.error.set(true);
        return;
      }

      const imageName = imageFile.name.split(/[\\/]/).pop() ?? imageFile.name;
      const payload: ProductVariantInsertPayload = {
        VARIANT_NAME: v.name.trim(),
        SKU: v.sku.trim(),
        BARCODE: v.barcode.trim() || null,
        SIZE_ID: v.sizeId,
        COLOUR_ID: v.colorId,
        MATERIAL_ID: v.materialId,
        WEIGHT: weight,
        PRICE: price,
        STOCK_QUANTITY: stock,
        VARIANT_IMAGE: imageName,
        PRODUCT_ID: productId,
        SELLER_ID: VARIANT_SELLER_ID,
        SELLER_NAME: VARIANT_SELLER_NAME,
        CREATED_BY: VARIANT_CREATED_BY,
      };

      this.error.set(false);
      this.isSubmitting.set(true);
      this.variantService.insertVariant(payload).pipe(
        tap((message) => {
          this.toast.showSuccess(message);
          this.dialog.set(null);
          this.selectedImage.set(null);
          if (this.page() === 1) this.retryLoad();
          else this.page.set(1);
        }),
        catchError((error: unknown) => {
          this.toast.showError(this.variantService.getErrorMessage(error));
          return EMPTY;
        }),
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe();
      return;
    }

    const selected = this.selected();
    const variantId = Number(selected?.id);
    const productId = selected?.productId;
    const weight = v.weight.trim() ? Number(v.weight) : null;
    const price = Number(v.price);
    const stock = Number(v.stock);
    if (
      !selected ||
      !Number.isSafeInteger(variantId) || variantId <= 0 ||
      productId === null || productId === undefined ||
      !v.name.trim() || !v.sku.trim() || !v.color ||
      !Number.isFinite(price) || price < 0 ||
      !Number.isSafeInteger(stock) || stock < 0 ||
      (weight !== null && (!Number.isFinite(weight) || weight < 0))
    ) {
      this.error.set(true);
      if (selected && (productId === null || productId === undefined)) {
        this.toast.showError('The selected variant does not include a valid product ID.');
      }
      return;
    }
    const payload: ProductVariantUpdatePayload = {
      VARIANT_ID: variantId,
      PRODUCT_ID: productId,
      VARIANT_NAME: v.name.trim(),
      SKU: v.sku.trim(),
      BARCODE: v.barcode.trim() || null,
      SIZE: v.size || null,
      COLOR: v.color,
      MATERIAL: v.material || null,
      WEIGHT: weight,
      PRICE: price,
      STOCK_QUANTITY: stock,
      VARIANT_IMAGE: selected.imagePath,
      SELLER_ID: selected.sellerId ?? VARIANT_SELLER_ID,
      SELLER_NAME: selected.sellerName || VARIANT_SELLER_NAME,
      CREATED_BY: selected.createdBy ?? VARIANT_CREATED_BY,
    };

    this.error.set(false);
    this.isSubmitting.set(true);
    this.variantService.updateVariant(payload).pipe(
      tap((message) => {
        this.toast.showSuccess(message);
        this.dialog.set(null);
        if (this.page() === 1) this.retryLoad();
        else this.page.set(1);
      }),
      catchError((error: unknown) => {
        this.toast.showError(this.variantService.getErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }
  protected confirmDelete(): void {
    if (this.isSubmitting()) return;
    const selected = this.selected();
    const variantId = Number(selected?.id);
    const productId = selected?.productId;
    if (!selected || !Number.isSafeInteger(variantId) || variantId <= 0) {
      this.toast.showError('The selected variant does not include a valid variant ID.');
      return;
    }
    if (productId === null || productId === undefined || !Number.isSafeInteger(productId) || productId <= 0) {
      this.toast.showError('The selected variant does not include a valid product ID.');
      return;
    }

    this.isSubmitting.set(true);
    this.variantService.deleteVariant({ PRODUCT_ID: productId, VARIANT_ID: variantId }).pipe(
      tap((message) => {
        this.toast.showSuccess(message);
        this.dialog.set(null);
        if (this.page() === 1) this.retryLoad();
        else this.page.set(1);
      }),
      catchError((error: unknown) => {
        this.toast.showError(this.variantService.getErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }
  protected setPage(n: number): void {
    const lastPage = this.totalPages();
    if (Number.isSafeInteger(n) && n >= 1 && (lastPage === undefined || n <= lastPage)) this.page.set(n);
  }
}
