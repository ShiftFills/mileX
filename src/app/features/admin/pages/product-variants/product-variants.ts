import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EMPTY, catchError, distinctUntilChanged, switchMap, tap } from 'rxjs';
import { Button } from '@shared/components/button/button';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { ProductVariant, ProductVariantService } from '../../services/product-variant.service';

const PAGE_SIZE = 5;

@Component({
  selector: 'app-product-variants',
  imports: [DecimalPipe, FormsModule, Button, Dialog, Input, LoadingSpinner, Pagination, Select],
  templateUrl: './product-variants.html',
  styleUrl: './product-variants.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariants {
  private readonly variantService = inject(ProductVariantService);
  protected readonly variants = signal<ProductVariant[]>([]);
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
  protected readonly form = signal({ name: '', sku: '', barcode: '', size: '', color: '', material: '', weight: '', price: '', stock: '' });
  protected readonly error = signal(false);

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

  protected openAdd(): void {
    this.selected.set(null);
    this.form.set({ name: '', sku: '', barcode: '', size: '', color: '', material: '', weight: '', price: '', stock: '' });
    this.error.set(false);
    this.dialog.set('add');
  }
  protected openEdit(row: ProductVariant): void {
    this.selected.set(row);
    this.form.set({ name: row.name, sku: row.sku, barcode: row.barcode, size: row.size, color: row.color, material: row.material, weight: row.weight, price: String(row.price), stock: String(row.stock) });
    this.error.set(false);
    this.dialog.set('edit');
    this.menu.set(null);
  }
  protected openDelete(row: ProductVariant): void { this.selected.set(row); this.dialog.set('delete'); this.menu.set(null); }
  protected close(): void { this.dialog.set(null); this.error.set(false); }
  protected setField(key: keyof ReturnType<typeof this.form>, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) this.form.update((v) => ({ ...v, [key]: target.value }));
  }
  protected save(): void {
    const v = this.form();
    if (!v.name.trim() || !v.sku.trim() || !v.color || !v.price.trim() || !v.stock.trim()) { this.error.set(true); return; }
    const row: ProductVariant = { id: this.selected()?.id ?? `local-${Date.now()}`, name: v.name, imageUrl: this.selected()?.imageUrl ?? '/images/latest-gadgets.svg', sku: v.sku, barcode: v.barcode || '—', color: v.color, material: v.material || '—', size: v.size, weight: v.weight, stock: Number(v.stock), price: Number(v.price) };
    this.variants.update((rows) => this.dialog() === 'edit' ? rows.map((x) => x.id === row.id ? row : x) : [row, ...rows]);
    this.close();
  }
  protected confirmDelete(): void { const id = this.selected()?.id; this.variants.update((rows) => rows.filter((r) => r.id !== id)); this.close(); }
  protected setPage(n: number): void {
    const lastPage = this.totalPages();
    if (Number.isSafeInteger(n) && n >= 1 && (lastPage === undefined || n <= lastPage)) this.page.set(n);
  }
}
