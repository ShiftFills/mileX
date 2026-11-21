import {
  ChangeDetectionStrategy, Component, DestroyRef, TemplateRef, WritableSignal, computed, inject, signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  EMPTY, Observable, Subject, catchError, defer, distinctUntilChanged, map, shareReplay, switchMap, tap, throwError,
} from 'rxjs';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { Table, TableCellContext, TableColumn, TableHeaderContext } from '@shared/components/table/table';
import { ClickOutside } from '@shared/directives/click-outside';
import { AuthService } from '@core/services/auth.service';
import {
  ProductCatalogService,
  ProductListingFilters,
  ProductListingStatus,
  ProductLookupOption,
} from '@core/services/product-catalog.service';
import { ProductImageDisplayService, ProductImageSource } from '@core/services/product-image-display.service';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import {
  VARIANT_OPTIONS,
  variantImageSource,
  variantImageUrl,
  variantOptionValue,
  variantText,
} from '@features/products/components/product-variant-selector/product-variant-selector';
import { PaginatedResponse, Product } from '@shared/models';
import { AdminProductRow } from '../../data/admin-products';
import { ProductVariant, ProductVariantService } from '../../services/product-variant.service';

interface ProductEditForm {
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: string;
  status: AdminProductRow['status'];
}

const DEFAULT_PAGE_SIZE = 5;
const PAGE_SIZES = [5, 10, 20] as const;

/** A row's image fields as ProductImageDisplayService reads them (`image` is the catalog's imageUrl). */
// CHANGED (new)
function imageSource(row: AdminProductRow): ProductImageSource {
  return { imageKey: row.imageKey, imagePath: row.imagePath, imageUrl: row.image };
}

type ProductStatusTab = 'All' | 'Active' | 'Inactive';

// CHANGED (new): the status tab sent to the API as STATUS ("All" sends no STATUS).
const LISTING_STATUS: Readonly<Record<Exclude<ProductStatusTab, 'All'>, ProductListingStatus>> = {
  Active: 'ACTIVE',
  Inactive: 'INACTIVE',
};

// CHANGED (new): everything one products/get request depends on.
interface ProductPageRequest {
  page: number;
  pageSize: number;
  category: string;
  brand: string;
  status: ProductStatusTab;
  retry: number;
}

interface ProductFilterLookup {
  status: 'loading' | 'success' | 'error';
  options: ProductLookupOption[];
  error: string | null;
}

// CHANGED (new): the Variants dialog for one product row.
interface VariantDialogState {
  product: AdminProductRow;
  status: 'loading' | 'success' | 'error';
  variants: readonly ProductVariant[];
  error: string | null;
}

/** One variant as the Variants dialog shows it (no seller, creator or other internal IDs). */
interface VariantRow {
  id: string;
  name: string;
  sku: string;
  options: { label: string; value: string }[];
  price: string;
  stock: number;
  status: AdminProductRow['status'];
  image: string;
  // CHANGED (new): the variant's S3 key or legacy URL, shown through ProductImageDisplayService.
  imageSource: ProductImageSource;
}

/** Prices as the product table shows them, e.g. "₹6,000". */
// CHANGED (new): shared by the product rows and the Variants dialog (same format as before).
function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// CHANGED (new): the variant STATUS shown with the same labels and badge tones as the product status.
function variantStatus(status: string): AdminProductRow['status'] {
  const value = status.trim().toUpperCase();
  return value === 'ACTIVE' ? 'Active' : value === 'INACTIVE' ? 'Inactive' : 'Unknown';
}

function mapVariantRow(variant: ProductVariant): VariantRow {
  return {
    id: variant.id,
    name: variant.name,
    sku: variantText(variant.sku) || '—',
    // Size, colour and material only when the variant has them.
    options: VARIANT_OPTIONS.map(({ key, label }) => ({ label, value: variantOptionValue(variant, key) }))
      .filter((option) => option.value),
    price: formatPrice(variant.price),
    stock: variant.stock,
    status: variantStatus(variant.status),
    image: variantImageUrl(variant),
    imageSource: variantImageSource(variant),
  };
}

function mapAdminProduct(product: Product): AdminProductRow {
  const id = Number(product.id);
  if (!Number.isSafeInteger(id)) {
    throw new Error(`The products API returned an invalid product ID: ${product.id}`);
  }

  return {
    id,
    name: product.name,
    sku: product.sku || '—',
    ...(product.productCodeId ? { productCodeId: product.productCodeId } : {}),
    category: product.category,
    brand: product.brand ?? 'Unknown',
    price: formatPrice(product.price),
    stock: product.stockLeft ?? null,
    status:
      product.isActive === undefined
        ? 'Unknown'
        : product.isActive
          ? 'Active'
          : 'Inactive',
    image: product.imageUrl,
    ...(product.imageKey ? { imageKey: product.imageKey } : {}),
    ...(product.imagePath ? { imagePath: product.imagePath } : {}),
  };
}

@Component({
  selector: 'app-admin-all-products',
  imports: [Badge, Button, Card, Checkbox, ClickOutside, Dialog, Input, LoadingSpinner, Pagination, Select, Table],
  // CHANGED (new): image state for this screen.
  providers: [ProductImageDisplayService],
  templateUrl: './all-products.html',
  styleUrl: './all-products.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllProducts {
  private readonly router = inject(Router);
  private readonly catalog = inject(ProductCatalogService);
  private readonly auth = inject(AuthService);
  private readonly sellerOnboarding = inject(SellerOnboardingService);
  private readonly variantService = inject(ProductVariantService);
  private readonly destroyRef = inject(DestroyRef);
  // CHANGED: the product images (S3 signed URLs, legacy paths, placeholder, expiry and refresh) are handled by
  // ProductImageDisplayService, shared with the Home page.
  private readonly productImages = inject(ProductImageDisplayService);
  // CHANGED (new): Sellers list only their own products; Admins keep the full catalog (PRODUCT_ID=-1).
  private readonly isSeller = computed(
    () => this.auth.user()?.userType?.trim().toUpperCase() === 'SELLER',
  );
  protected readonly products = signal<AdminProductRow[]>([]);
  protected readonly loadStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly category = signal('');
  protected readonly brand = signal('');
  // CHANGED: Admins and Sellers both start on the Active tab, so the first request sends STATUS=ACTIVE
  // (a Seller used to start on "All", with no STATUS). The tabs and the status filter still switch freely.
  protected readonly statusTab = signal<ProductStatusTab>('Active');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly paginationNotice = signal<string | null>(null);
  private readonly retryCount = signal(0);
  private readonly pageData = signal<{
    total?: number;
    totalPages?: number;
    page: number;
    pageSize: number;
    hasNext: boolean;
  } | null>(null);
  private readonly knownTotal = signal<number | null>(null);
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly selectedIds = signal<ReadonlySet<number>>(new Set());
  protected readonly openActionMenuId = signal<number | null>(null);
  protected readonly editingProduct = signal<AdminProductRow | null>(null);
  protected readonly editForm = signal<ProductEditForm | null>(null);
  protected readonly editError = signal('');
  // CHANGED (new): Variants dialog. One product_variant/get request per product, kept for this page visit,
  // so reopening a product (or reopening it while its request is still running) makes no new call.
  protected readonly variantDialog = signal<VariantDialogState | null>(null);
  protected readonly variantRows = computed(() => (this.variantDialog()?.variants ?? []).map(mapVariantRow));
  private readonly variantRequests = new Map<number, Observable<readonly ProductVariant[]>>();
  private readonly openVariantsFor = new Subject<AdminProductRow>();
  protected readonly categoryLookup = signal<ProductFilterLookup>({
    status: 'loading', options: [], error: null,
  });
  protected readonly brandLookup = signal<ProductFilterLookup>({
    status: 'loading', options: [], error: null,
  });
  private readonly selectAllHeader = viewChild<TemplateRef<TableHeaderContext<AdminProductRow>>>('selectAllHeader');
  private readonly selectRowCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('selectRowCell');
  private readonly imageCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('imageCell');
  private readonly statusCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('statusCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<AdminProductRow>>>('actionCell');
  protected readonly tableColumns = computed<readonly TableColumn<AdminProductRow>[]>(() => [
    {
      key: 'selection', label: '', width: '4%', tabletWidth: '5%', selection: true, hideOnSmall: true,
      headerTemplate: this.selectAllHeader(), cellTemplate: this.selectRowCell(),
    },
    {
      key: 'image', label: 'Image', width: '8%', tabletWidth: '10%', hideOnSmall: true,
      cellTemplate: this.imageCell(),
    },
    { key: 'name', label: 'Product Name', width: '16%', tabletWidth: '30%', mobileWidth: '40%', emphasized: true },
    { key: 'sku', label: 'SKU / Product Code', width: '17%', optional: true },
    { key: 'category', label: 'Category', width: '11%', optional: true },
    { key: 'brand', label: 'Brand', width: '8%', optional: true },
    { key: 'price', label: 'Price', width: '8%', tabletWidth: '13%', mobileWidth: '20%', bold: true },
    { key: 'stock', label: 'Stock', width: '6%', tabletWidth: '10%', mobileWidth: '15%' },
    {
      key: 'status', label: 'Status', width: '8%', tabletWidth: '12%', mobileWidth: '25%',
      cellTemplate: this.statusCell(),
    },
    {
      key: 'actions', label: 'Action', width: '8%', tabletWidth: '20%', hideOnSmall: true,
      overflowVisible: true,
      cellTemplate: this.actionCell(),
    },
  ]);
  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visibleRows();
    return rows.length > 0 && rows.every((row) => this.selectedIds().has(row.id));
  });
  protected readonly totalProducts = computed(
    () => this.pageData()?.total ?? this.knownTotal() ?? undefined,
  );
  protected readonly totalPages = computed(
    () =>
      this.pageData()?.totalPages ??
      (this.knownTotal() === null
        ? undefined
        : Math.ceil(this.knownTotal()! / this.pageSize())),
  );
  protected readonly hasNextPage = computed(() => {
    const totalPages = this.totalPages();
    return totalPages !== undefined
      ? this.page() < totalPages
      : (this.pageData()?.hasNext ?? false);
  });
  protected readonly effectivePageSize = computed(
    () => this.pageData()?.pageSize ?? this.pageSize(),
  );
  protected readonly pageRequest = computed<ProductPageRequest>(() => ({
    page: this.page(),
    pageSize: this.pageSize(),
    // CHANGED: category, brand and status are API filters, so changing one requests a new page.
    category: this.category(),
    brand: this.brand(),
    status: this.statusTab(),
    retry: this.retryCount(),
  }));
  protected readonly activeOnPage = computed(
    () => this.products().filter((product) => product.status === 'Active').length,
  );
  protected readonly inactiveOnPage = computed(
    () => this.products().filter((product) => product.status === 'Inactive').length,
  );
  // CHANGED: category, brand and status are filtered by the API; search still applies to the loaded page.
  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.products().filter(
      (row) => !query || `${row.name} ${row.sku} ${row.category} ${row.brand}`.toLowerCase().includes(query),
    );
  });
  protected readonly visibleRows = computed(() => {
    return this.filteredRows();
  });

  protected statusTone(status: AdminProductRow['status']): 'success' | 'warning' | 'neutral' {
    if (status === 'Active') return 'success';
    if (status === 'Inactive') return 'warning';
    return 'neutral';
  }

  /**
   * The selected tab shows the API total for its filter. With "All" selected, Active and Inactive show
   * their count on the loaded page; otherwise their totals are unknown, so no count is shown.
   */
  // CHANGED (new): the status filter is server-side, so the "on page" counts only make sense under "All".
  protected tabCount(tab: ProductStatusTab): string | null {
    if (tab === this.statusTab()) return String(this.totalProducts() ?? 'total unavailable');
    if (this.statusTab() !== 'All') return null;
    return `${tab === 'Active' ? this.activeOnPage() : this.inactiveOnPage()} on page`;
  }

  constructor() {
    this.loadCategoryLookup();
    this.loadBrandLookup();
    toObservable(this.pageRequest)
      .pipe(
        // CHANGED: compares every request field (page, page size, filters, retry).
        distinctUntilChanged((previous, current) =>
          (Object.keys(current) as (keyof ProductPageRequest)[]).every((key) => previous[key] === current[key]),
        ),
        tap(() => {
          this.loadStatus.set('loading');
          this.loadError.set(null);
          this.products.set([]);
          this.pageData.set(null);
        }),
        // CHANGED: the request now depends on the role and the filters; the response handling below is shared.
        switchMap((request) =>
          defer(() => this.loadProductPage(request)).pipe(
            map((response) => ({
              products: response.items.map(mapAdminProduct),
              response,
            })),
            tap(({ products, response }) => {
              const totalPages =
                response.totalPages ??
                (this.knownTotal() === null
                  ? undefined
                  : Math.ceil(this.knownTotal()! / response.pageSize));
              if (response.total !== undefined) this.knownTotal.set(response.total);
              const lastPageForEmptyResponse = Math.max(
                1,
                response.totalPages ??
                  Math.ceil(
                    (response.total ?? (response.page - 1) * response.pageSize) /
                      response.pageSize,
                  ),
              );
              if (
                response.page > 1 &&
                response.items.length === 0 &&
                response.page > lastPageForEmptyResponse
              ) {
                const total = response.total ?? (response.page - 1) * response.pageSize;
                this.knownTotal.set(total);
                this.paginationNotice.set(
                  `Page ${response.page} has no products. Showing page ${lastPageForEmptyResponse}, the last available page.`,
                );
                this.page.set(lastPageForEmptyResponse);
                return;
              }
              this.products.set(products);
              // CHANGED (new): each distinct image key on the page is requested once.
              this.productImages.show(products);
              this.pageData.set({
                ...(response.total !== undefined ? { total: response.total } : {}),
                ...(totalPages !== undefined ? { totalPages } : {}),
                page: response.page,
                pageSize: response.pageSize,
                hasNext: response.hasNext,
              });
              this.loadStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.loadError.set(this.catalog.getErrorMessage(error));
              this.loadStatus.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe();

    // CHANGED (new): loads the variants of the product whose Variant button was clicked. switchMap only stops
    // listening to a previous product; its request still finishes and stays cached (see productVariants).
    this.openVariantsFor
      .pipe(
        switchMap((product) =>
          this.productVariants(product.id).pipe(
            tap((variants) => {
              this.updateVariantDialog(product.id, { status: 'success', variants, error: null });
              // CHANGED (new): the URLs of the variants' S3 images (one request per distinct key).
              this.productImages.show(variants.map(variantImageSource));
            }),
            catchError((error: unknown) => {
              this.updateVariantDialog(product.id, {
                status: 'error',
                variants: [],
                error: this.variantService.getErrorMessage(error),
              });
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /**
   * The variants of one product: `product_variant/get?PRODUCT_ID=<row PRODUCT_ID>&VARIANT_ID=-1&LIMIT=10&OFFSET=…`
   * through the existing ProductVariantService.loadProductVariants. Rows of another product are dropped.
   * A failed request is forgotten, so "Try again" calls the API again.
   */
  // CHANGED (new): one cached request per product for this page visit.
  private productVariants(productId: number): Observable<readonly ProductVariant[]> {
    const cached = this.variantRequests.get(productId);
    if (cached) return cached;

    const request: Observable<readonly ProductVariant[]> = this.variantService.loadProductVariants(productId).pipe(
      map((variants) => variants.filter((variant) => variant.productId === null || variant.productId === productId)),
      catchError((error: unknown) => {
        if (this.variantRequests.get(productId) === request) this.variantRequests.delete(productId);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.variantRequests.set(productId, request);
    return request;
  }

  /** Applies a result only while the dialog still shows that product. */
  private updateVariantDialog(productId: number, state: Omit<VariantDialogState, 'product'>): void {
    this.variantDialog.update((dialog) => dialog?.product.id === productId ? { ...dialog, ...state } : dialog);
  }

  /**
   * Admin: every product (`PRODUCT_ID=-1`) matching the category, brand and status filters.
   * Seller: the same request plus SELLER_ID, which is resolved from the logged-in seller's record.
   */
  // CHANGED: both roles use loadListingPage with the selected filters; only a Seller adds SELLER_ID.
  private loadProductPage({ page, pageSize, category, brand, status }: ProductPageRequest): Observable<PaginatedResponse<Product>> {
    const filters: ProductListingFilters = {
      ...(category ? { categoryId: Number(category) } : {}),
      ...(brand ? { brandId: Number(brand) } : {}),
      ...(status !== 'All' ? { status: LISTING_STATUS[status] } : {}),
    };
    if (!this.isSeller()) return this.catalog.loadListingPage(filters, page, pageSize);
    return this.sellerOnboarding.getCurrentSellerId().pipe(
      switchMap((sellerId) => this.catalog.loadListingPage({ ...filters, sellerId }, page, pageSize)),
    );
  }

  protected retryCategoryLookup(): void {
    this.loadCategoryLookup();
  }

  protected retryBrandLookup(): void {
    this.loadBrandLookup();
  }

  protected lookupDisabled(lookup: ProductFilterLookup): boolean {
    return lookup.status !== 'success' || lookup.options.length === 0;
  }

  private loadCategoryLookup(): void {
    this.categoryLookup.set({ status: 'loading', options: [], error: null });
    this.catalog.loadCategories().pipe(
      tap((options) => this.categoryLookup.set({ status: 'success', options, error: null })),
      catchError((error: unknown) => {
        this.categoryLookup.set({
          status: 'error',
          options: [],
          error: this.catalog.getErrorMessage(error),
        });
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  private loadBrandLookup(): void {
    this.brandLookup.set({ status: 'loading', options: [], error: null });
    this.catalog.loadAllBrands().pipe(
      tap((options) => this.brandLookup.set({ status: 'success', options, error: null })),
      catchError((error: unknown) => {
        this.brandLookup.set({
          status: 'error',
          options: [],
          error: this.catalog.getErrorMessage(error),
        });
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  protected setQuery(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.query.set(input.value);
      this.paginationNotice.set(null);
      this.page.set(1);
    }
  }

  protected setCategory(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) this.changeFilter(this.category, select.value);
  }

  protected setBrand(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) this.changeFilter(this.brand, select.value);
  }

  protected setStatus(status: ProductStatusTab): void {
    this.changeFilter(this.statusTab, status);
  }

  protected statusChange(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement && ['All', 'Active', 'Inactive'].includes(select.value)) {
      this.setStatus(select.value as ProductStatusTab);
    }
  }

  // CHANGED (new): a new category/brand/status is a different API result set, so the remembered total
  // no longer applies; the listing restarts at page 1 (as before).
  private changeFilter<T>(filter: WritableSignal<T>, value: T): void {
    if (filter() !== value) this.knownTotal.set(null);
    filter.set(value);
    this.paginationNotice.set(null);
    this.page.set(1);
  }

  protected toggleSelected(id: number, checked: boolean): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected toggleAllVisible(checked: boolean): void {
    this.selectedIds.update((selected) => {
      const next = new Set(selected);
      for (const row of this.visibleRows()) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  protected setPage(page: number): void {
    if (page >= 1 && (this.totalPages() === undefined || page <= this.totalPages()!)) {
      this.paginationNotice.set(null);
      this.page.set(page);
    }
  }

  protected rangeStart(): number {
    if (this.totalProducts() === 0) return 0;
    return (this.page() - 1) * this.effectivePageSize() + 1;
  }

  protected rangeEnd(): number {
    const end = this.page() * this.effectivePageSize();
    const total = this.totalProducts();
    return total === undefined ? end : Math.min(end, total);
  }

  protected setPageSize(event: Event): void {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const pageSize = Number(select.value);
    if (PAGE_SIZES.some((size) => size === pageSize)) {
      this.pageSize.set(pageSize);
      this.paginationNotice.set(null);
      this.page.set(1);
    }
  }

  protected retryLoad(): void {
    this.retryCount.update((retry) => retry + 1);
  }

  protected addProduct(): void {
    void this.router.navigateByUrl('/admin/products/new');
  }

  protected editProduct(product: AdminProductRow): void {
    this.openActionMenuId.set(null);
    void this.router.navigate(['/admin/products', product.id, 'edit']);
  }

  /** The Variants management page ("Manage Variants" in the Variants dialog). */
  // CHANGED: no longer called by the row's Variant button, which now opens the Variants dialog.
  protected variants(): void {
    void this.router.navigateByUrl('/admin/products/variants');
  }

  /** Variant button: shows the variants of this row's product (its PRODUCT_ID) in a dialog. */
  // CHANGED (new)
  protected openVariants(product: AdminProductRow): void {
    this.openActionMenuId.set(null);
    this.variantDialog.set({ product, status: 'loading', variants: [], error: null });
    this.openVariantsFor.next(product);
  }

  protected retryVariants(): void {
    const dialog = this.variantDialog();
    if (!dialog) return;
    this.variantDialog.set({ ...dialog, status: 'loading', variants: [], error: null });
    this.openVariantsFor.next(dialog.product);
  }

  protected closeVariants(): void {
    this.variantDialog.set(null);
  }

  /**
   * The row's own image (signed S3 URL, API image URL or legacy /uploads path), or null for the "no image"
   * placeholder: see ProductImageDisplayService.
   */
  // CHANGED: delegates to the shared ProductImageDisplayService (the logic used to live here).
  protected productImage(product: AdminProductRow): string | null {
    return this.productImages.src(imageSource(product));
  }

  // CHANGED (new)
  protected productImageLoading(product: AdminProductRow): boolean {
    return this.productImages.loading(imageSource(product));
  }

  /** The browser could not display an image: one fresh S3 URL, else the placeholder. */
  // CHANGED: delegates to the shared ProductImageDisplayService.
  protected productImageFailed(product: AdminProductRow, src: string): void {
    this.productImages.failed(imageSource(product), src);
  }

  /**
   * A variant's own image (signed S3 URL or legacy /uploads URL); otherwise, and while it loads or after it
   * failed, the product's image.
   */
  // CHANGED (new): replaces the failed-variant-ID list; S3 variant images get one fresh URL before falling back.
  protected variantImage(variant: VariantRow, product: AdminProductRow): string {
    return this.productImages.src(variant.imageSource) ?? this.productImage(product) ?? product.image;
  }

  // CHANGED: takes the failed URL (was the variant ID).
  protected variantImageFailed(variant: VariantRow, src: string): void {
    this.productImages.failed(variant.imageSource, src);
  }

  protected toggleActionMenu(productId: number): void {
    this.openActionMenuId.update((openId) => openId === productId ? null : productId);
  }

  protected closeActionMenu(productId: number): void {
    if (this.openActionMenuId() === productId) this.openActionMenuId.set(null);
  }

  protected openEdit(product: AdminProductRow): void {
    this.editingProduct.set(product);
    this.editForm.set({
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand,
      price: product.price.replace(/[^\d.]/g, ''),
      stock: String(product.stock),
      status: product.status,
    });
    this.editError.set('');
    this.openActionMenuId.set(null);
  }

  protected setEditField(key: keyof ProductEditForm, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    this.editForm.update((form) => form ? { ...form, [key]: target.value } : form);
    this.editError.set('');
  }

  protected saveEdit(): void {
    const selected = this.editingProduct();
    const form = this.editForm();
    if (!selected || !form) return;

    const price = Number(form.price);
    const stock = Number(form.stock);
    if (
      !form.name.trim() || !form.sku.trim() || !form.category || !form.brand ||
      !Number.isFinite(price) || price <= 0 ||
      !Number.isInteger(stock) || stock < 0
    ) {
      this.editError.set('Enter a name, SKU, category, brand, valid price, and whole stock quantity of 0 or more.');
      return;
    }

    this.products.update((rows) => rows.map((row) => row.id === selected.id ? {
      ...row,
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category,
      brand: form.brand,
      price: `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
      stock,
      status: form.status,
    } : row));
    this.closeEdit();
  }

  protected closeEdit(): void {
    this.editingProduct.set(null);
    this.editForm.set(null);
    this.editError.set('');
  }
}
