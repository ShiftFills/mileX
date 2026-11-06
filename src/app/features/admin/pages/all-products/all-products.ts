import { ChangeDetectionStrategy, Component, DestroyRef, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { EMPTY, catchError, distinctUntilChanged, map, switchMap, tap } from 'rxjs';
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
import { ProductCatalogService, ProductLookupOption } from '@core/services/product-catalog.service';
import { Product } from '@shared/models';
import { AdminProductRow } from '../../data/admin-products';

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

interface ProductFilterLookup {
  status: 'loading' | 'success' | 'error';
  options: ProductLookupOption[];
  error: string | null;
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
    price: `₹${product.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
    stock: product.stockLeft ?? null,
    status:
      product.isActive === undefined
        ? 'Unknown'
        : product.isActive
          ? 'Active'
          : 'Inactive',
    image: product.imageUrl,
  };
}

@Component({
  selector: 'app-admin-all-products',
  imports: [Badge, Button, Card, Checkbox, ClickOutside, Dialog, Input, LoadingSpinner, Pagination, Select, Table],
  templateUrl: './all-products.html',
  styleUrl: './all-products.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllProducts {
  private readonly router = inject(Router);
  private readonly catalog = inject(ProductCatalogService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly products = signal<AdminProductRow[]>([]);
  protected readonly loadStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly category = signal('');
  protected readonly brand = signal('');
  protected readonly statusTab = signal<'All' | 'Active' | 'Inactive'>('All');
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
  protected readonly pageRequest = computed(() => ({
    page: this.page(),
    pageSize: this.pageSize(),
    retry: this.retryCount(),
  }));
  protected readonly activeOnPage = computed(
    () => this.products().filter((product) => product.status === 'Active').length,
  );
  protected readonly inactiveOnPage = computed(
    () => this.products().filter((product) => product.status === 'Inactive').length,
  );
  protected readonly filteredRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.products().filter((row) => {
      const matchesQuery = !query || `${row.name} ${row.sku} ${row.category} ${row.brand}`.toLowerCase().includes(query);
      const matchesCategory = !this.category() || row.category === `category-${this.category()}`;
      const matchesBrand = !this.brand() || row.brand === `brand-${this.brand()}`;
      const matchesStatus = this.statusTab() === 'All' || row.status === this.statusTab();
      return matchesQuery && matchesCategory && matchesBrand && matchesStatus;
    });
  });
  protected readonly visibleRows = computed(() => {
    return this.filteredRows();
  });

  protected statusTone(status: AdminProductRow['status']): 'success' | 'warning' | 'neutral' {
    if (status === 'Active') return 'success';
    if (status === 'Inactive') return 'warning';
    return 'neutral';
  }

  constructor() {
    this.loadCategoryLookup();
    this.loadBrandLookup();
    toObservable(this.pageRequest)
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous.page === current.page &&
            previous.pageSize === current.pageSize &&
            previous.retry === current.retry,
        ),
        tap(() => {
          this.loadStatus.set('loading');
          this.loadError.set(null);
          this.products.set([]);
          this.pageData.set(null);
        }),
        switchMap(({ page, pageSize }) =>
          this.catalog.loadPage(page, pageSize).pipe(
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
    if (select instanceof HTMLSelectElement) {
      this.category.set(select.value);
      this.paginationNotice.set(null);
      this.page.set(1);
    }
  }

  protected setBrand(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement) {
      this.brand.set(select.value);
      this.paginationNotice.set(null);
      this.page.set(1);
    }
  }

  protected setStatus(status: 'All' | 'Active' | 'Inactive'): void {
    this.statusTab.set(status);
    this.paginationNotice.set(null);
    this.page.set(1);
  }

  protected statusChange(event: Event): void {
    const select = event.target;
    if (select instanceof HTMLSelectElement && ['All', 'Active', 'Inactive'].includes(select.value)) {
      this.setStatus(select.value as 'All' | 'Active' | 'Inactive');
    }
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

  protected variants(): void {
    void this.router.navigateByUrl('/admin/products/variants');
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
