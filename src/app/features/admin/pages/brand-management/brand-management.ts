import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription, catchError, finalize, of, switchMap, throwError } from 'rxjs';
import { ProductCatalogService, ProductLookupOption } from '@core/services/product-catalog.service';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { BRAND_LOGO_FOLDER, S3FileUpload, S3ImageService } from '@core/services/s3-image.service';
import { ToastService } from '@core/services/toast.service';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { Select } from '@shared/components/select/select';
import { Table, TableCellContext, TableColumn } from '@shared/components/table/table';
import { Textarea } from '@shared/components/textarea/textarea';
import { eventValue } from '@shared/utils/form-events';
import { Brand, BrandFormValue, BrandManagementService, BrandStatus } from '../../services/brand-management.service';

// CHANGED (new): Admin Brand Management.

type LoadStatus = 'loading' | 'success' | 'error';
type StatusFilter = 'all' | BrandStatus;
type DialogMode = 'add' | 'edit';

/** A category or subcategory list (all_category/get, sub_category/get through ProductCatalogService). */
interface LookupState {
  status: LoadStatus;
  options: readonly ProductLookupOption[];
  error: string;
}

/** One table row: a brand with its category and subcategory named. */
interface BrandRow {
  id: number;
  brand: Brand;
  name: string;
  description: string;
  categoryLabel: string;
  subCategoryLabel: string;
  status: BrandStatus;
  statusLabel: string;
}

/** The Add / Edit form as typed (category and subcategory are the <select> values: '' for none chosen). */
interface BrandForm {
  name: string;
  categoryId: string;
  subCategoryId: string;
  description: string;
  status: BrandStatus;
}

const PAGE_SIZE = 10;
const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EMPTY_FORM: BrandForm = { name: '', categoryId: '', subCategoryId: '', description: '', status: 'ACTIVE' };
const IDLE_LOOKUP: LookupState = { status: 'success', options: [], error: '' };

function statusLabel(status: BrandStatus): string {
  return status === 'ACTIVE' ? 'Active' : 'Inactive';
}

function displayDate(value: string | null): string {
  if (!value) return '—';
  const time = Date.parse(value);
  return Number.isFinite(time) ? formatDate(time, 'dd MMM yyyy', 'en-US') : value;
}

/** A <select> value as a positive ID, or null for '' (none chosen / all). */
function selectedId(value: string): number | null {
  const id = Number(value);
  return value && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function labelFor(options: readonly ProductLookupOption[], id: number | null): string | undefined {
  return id === null ? undefined : options.find((option) => option.id === String(id))?.label;
}

/**
 * Admin Brand Management: one page of brands at a time (brand_management/get, LIMIT / OFFSET), filtered by category
 * and subcategory on the server, with search and status refining the page on screen. Add / Edit share one form
 * (brand_management/insert, update) with the logo uploaded to S3 first; View shows a brand's details; Delete asks
 * first (brand_management/delete). The category and subcategory lists are the ones the product forms use
 * (ProductCatalogService: all_category/get, sub_category/get).
 */
@Component({
  selector: 'app-brand-management',
  imports: [Badge, Button, Card, Dialog, Input, LoadingSpinner, PageHeading, Pagination, Select, Table, Textarea],
  templateUrl: './brand-management.html',
  styleUrl: './brand-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Each brand's own logo (signed S3 URL), as on the product and category screens.
  providers: [ProductImageDisplayService],
})
export class BrandManagement {
  private readonly brandService = inject(BrandManagementService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly s3Images = inject(S3ImageService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly productImages = inject(ProductImageDisplayService);
  private readonly logoUpload = new S3FileUpload(this.s3Images, BRAND_LOGO_FOLDER);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly nameMaxLength = NAME_MAX_LENGTH;
  protected readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;
  protected readonly statusLabel = statusLabel;
  protected readonly displayDate = displayDate;

  // ---- Lookups ----
  protected readonly categoryLookup = signal<LookupState>({ status: 'loading', options: [], error: '' });
  /** Subcategory lists by category ID, shared by the filter, the form and the table's subcategory names. */
  private readonly subcategoryLookups = signal<ReadonlyMap<number, LookupState>>(new Map());

  // ---- The list (one API page) ----
  protected readonly brands = signal<readonly Brand[]>([]);
  /** total_records of the filtered list; null when the API sends none (paging then follows full pages). */
  protected readonly total = signal<number | null>(null);
  protected readonly loadStatus = signal<LoadStatus>('loading');
  protected readonly loadError = signal('');
  private loadRequest?: Subscription;

  protected readonly page = signal(1);
  /** Server-side filters: the <select> values ('' for all). */
  protected readonly categoryFilter = signal('');
  protected readonly subCategoryFilter = signal('');
  /** Refine the page on screen. */
  protected readonly query = signal('');
  protected readonly statusFilter = signal<StatusFilter>('all');

  protected readonly filterSubcategories = computed(() => this.subcategoriesFor(selectedId(this.categoryFilter())));
  protected readonly hasServerFilters = computed(() => this.categoryFilter() !== '' || this.subCategoryFilter() !== '');
  protected readonly hasActiveFilters = computed(
    () => this.hasServerFilters() || this.query().trim() !== '' || this.statusFilter() !== 'all',
  );
  /**
   * The filtered list's size: total_records, else known once a page comes back short (offset + its rows). Undefined
   * while a full page without total_records may be followed by another.
   */
  protected readonly pageTotal = computed(() => {
    const total = this.total();
    if (total !== null) return total;
    const count = this.brands().length;
    return count < PAGE_SIZE ? (this.page() - 1) * PAGE_SIZE + count : undefined;
  });
  protected readonly hasNextPage = computed(() => (this.pageTotal() === undefined ? true : undefined));

  protected readonly rows = computed<readonly BrandRow[]>(() => {
    const categories = this.categoryLookup().options;
    return this.brands().map((brand) => {
      const subcategories = this.subcategoriesFor(brand.categoryId);
      return {
        id: brand.id,
        brand,
        name: brand.name,
        description: brand.description || '—',
        categoryLabel:
          brand.categoryName ??
          labelFor(categories, brand.categoryId) ??
          (brand.categoryId === null ? '—' : `Category #${brand.categoryId}`),
        subCategoryLabel:
          brand.subCategoryName ??
          labelFor(subcategories.options, brand.subCategoryId) ??
          (brand.subCategoryId === null ? '—' : subcategories.status === 'loading' ? '…' : `Subcategory #${brand.subCategoryId}`),
        status: brand.status,
        statusLabel: statusLabel(brand.status),
      };
    });
  });
  protected readonly visibleRows = computed(() => {
    const query = this.query().trim().replace(/\s+/g, ' ').toLowerCase();
    const status = this.statusFilter();
    return this.rows().filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!query) return true;
      return `${row.name} ${row.brand.description} ${row.id} ${row.categoryLabel} ${row.subCategoryLabel}`
        .toLowerCase()
        .includes(query);
    });
  });

  private readonly logoCell = viewChild<TemplateRef<TableCellContext<BrandRow>>>('logoCell');
  private readonly nameCell = viewChild<TemplateRef<TableCellContext<BrandRow>>>('nameCell');
  private readonly descriptionCell = viewChild<TemplateRef<TableCellContext<BrandRow>>>('descriptionCell');
  private readonly statusCell = viewChild<TemplateRef<TableCellContext<BrandRow>>>('statusCell');
  private readonly actionsCell = viewChild<TemplateRef<TableCellContext<BrandRow>>>('actionsCell');

  protected readonly tableColumns = computed<readonly TableColumn<BrandRow>[]>(() => [
    { key: 'logo', label: 'Logo', width: '7%', cellTemplate: this.logoCell() },
    { key: 'name', label: 'Brand Name', width: '19%', cellTemplate: this.nameCell() },
    { key: 'description', label: 'Description', width: '24%', cellTemplate: this.descriptionCell() },
    { key: 'categoryLabel', label: 'Category', width: '14%' },
    { key: 'subCategoryLabel', label: 'Subcategory', width: '14%' },
    { key: 'status', label: 'Status', width: '9%', cellTemplate: this.statusCell() },
    { key: 'actions', label: 'Actions', width: '13%', align: 'center', cellTemplate: this.actionsCell() },
  ]);

  // ---- View dialog ----
  protected readonly viewTarget = signal<BrandRow | null>(null);
  private readonly viewDialog = viewChild<ElementRef<HTMLElement>>('viewDialog');

  // ---- Add / Edit dialog ----
  protected readonly dialogMode = signal<DialogMode | null>(null);
  /** The brand being edited (null when adding). */
  protected readonly editing = signal<Brand | null>(null);
  protected readonly form = signal<BrandForm>(EMPTY_FORM);
  /** Set by the first Save, so errors show once the Admin tried to save. */
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploadingLogo = signal(false);
  protected readonly saveError = signal('');
  protected readonly selectedLogo = signal<File | null>(null);
  protected readonly logoPreview = signal<string | null>(null);
  protected readonly logoError = signal('');
  /** Edit: the brand's current logo is to be removed (BRAND_LOGO null). */
  protected readonly removeCurrentLogo = signal(false);

  // ---- Delete dialog ----
  protected readonly deleteTarget = signal<BrandRow | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');

  private dialogOpener: HTMLElement | null = null;
  private readonly formDialog = viewChild<ElementRef<HTMLElement>>('formDialog');
  private readonly deleteDialog = viewChild<ElementRef<HTMLElement>>('deleteDialog');

  protected readonly formSubcategories = computed(() => this.subcategoriesFor(selectedId(this.form().categoryId)));

  /** The form's categories; an edited brand's category missing from the list is added, so the form shows it. */
  protected readonly formCategoryOptions = computed<readonly ProductLookupOption[]>(() => {
    const options = this.categoryLookup().options;
    const editing = this.editing();
    if (!editing?.categoryId || options.some((option) => option.id === String(editing.categoryId))) return options;
    return [...options, { id: String(editing.categoryId), label: editing.categoryName ?? `Category #${editing.categoryId}` }];
  });

  /** The chosen category's subcategories; the edited brand's own subcategory is kept should the list not have it. */
  protected readonly formSubcategoryOptions = computed<readonly ProductLookupOption[]>(() => {
    const options = this.formSubcategories().options;
    const editing = this.editing();
    if (
      !editing?.subCategoryId ||
      String(editing.categoryId) !== this.form().categoryId ||
      options.some((option) => option.id === String(editing.subCategoryId))
    ) {
      return options;
    }
    return [
      ...options,
      { id: String(editing.subCategoryId), label: editing.subCategoryName ?? `Subcategory #${editing.subCategoryId}` },
    ];
  });

  protected readonly nameError = computed(() => {
    const name = this.form().name.trim();
    if (!name) return 'Enter a brand name.';
    return name.length > NAME_MAX_LENGTH ? `Use ${NAME_MAX_LENGTH} characters or fewer.` : '';
  });
  protected readonly categoryError = computed(() => (this.form().categoryId ? '' : 'Choose a category.'));
  protected readonly subCategoryError = computed(() => {
    if (!this.form().categoryId || this.form().subCategoryId) return '';
    const lookup = this.formSubcategories();
    return lookup.status === 'success' && !this.formSubcategoryOptions().length
      ? 'This category has no subcategories. Add one in Category Management first.'
      : 'Choose a subcategory.';
  });
  protected readonly descriptionError = computed(() =>
    this.form().description.trim().length > DESCRIPTION_MAX_LENGTH
      ? `Use ${DESCRIPTION_MAX_LENGTH} characters or fewer.`
      : '',
  );
  protected readonly formValid = computed(
    () => !this.nameError() && !this.categoryError() && !this.subCategoryError() && !this.descriptionError(),
  );
  /** The logo the form shows: the new file's preview, else the current logo (unless it is being removed). */
  protected readonly currentLogoSource = computed(() => {
    const editing = this.editing();
    return editing?.logo && !this.removeCurrentLogo() ? editing : null;
  });

  constructor() {
    this.loadCategories();
    this.loadBrands();
    // The S3 logo URLs of the brands on screen (one request per distinct key; cached URLs make none).
    effect(() => {
      const brands = this.brands();
      untracked(() => this.productImages.show(brands));
    });
    this.destroyRef.onDestroy(() => this.setSelectedLogo(null));
  }

  // ---- Lookups ----

  /** The subcategory list of a category (an empty, settled list for none). */
  protected subcategoriesFor(categoryId: number | null): LookupState {
    return categoryId === null ? IDLE_LOOKUP : (this.subcategoryLookups().get(categoryId) ?? { ...IDLE_LOOKUP, status: 'loading' });
  }

  protected retryCategories(): void {
    this.loadCategories();
  }

  protected retrySubcategories(categoryValue: string): void {
    const categoryId = selectedId(categoryValue);
    if (categoryId !== null) this.loadSubcategories(categoryId, true);
  }

  // ---- List ----

  protected retryLoad(): void {
    this.loadBrands();
  }

  protected setPage(page: number): void {
    this.page.set(page);
    this.loadBrands();
  }

  protected setCategoryFilter(event: Event): void {
    const value = eventValue(event) ?? '';
    this.categoryFilter.set(value);
    this.subCategoryFilter.set('');
    const categoryId = selectedId(value);
    if (categoryId !== null) this.loadSubcategories(categoryId);
    this.page.set(1);
    this.loadBrands();
  }

  protected setSubCategoryFilter(event: Event): void {
    this.subCategoryFilter.set(eventValue(event) ?? '');
    this.page.set(1);
    this.loadBrands();
  }

  protected setQuery(event: Event): void {
    this.query.set(eventValue(event) ?? '');
  }

  protected setStatusFilter(event: Event): void {
    const value = eventValue(event);
    this.statusFilter.set(value === 'ACTIVE' || value === 'INACTIVE' ? value : 'all');
  }

  protected clearFilters(): void {
    const reload = this.hasServerFilters();
    this.categoryFilter.set('');
    this.subCategoryFilter.set('');
    this.query.set('');
    this.statusFilter.set('all');
    if (reload) {
      this.page.set(1);
      this.loadBrands();
    }
  }

  // ---- View ----

  protected openView(row: BrandRow, opener?: EventTarget | null): void {
    this.dialogOpener = opener instanceof HTMLElement ? opener : null;
    this.viewTarget.set(row);
    afterNextRender(() => this.viewDialog()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeView(): void {
    this.viewTarget.set(null);
    this.restoreFocus();
  }

  /** View → Edit: the form opens in place of the details, and focus later returns to the row's View button. */
  protected editFromView(row: BrandRow): void {
    const opener = this.dialogOpener;
    this.viewTarget.set(null);
    this.openForm('edit', row.brand, opener);
  }

  // ---- Add / Edit ----

  /** Add starts in the category and subcategory the list is filtered by, if any. */
  protected openAdd(opener?: EventTarget | null): void {
    this.openForm('add', null, opener);
  }

  protected openEdit(row: BrandRow, opener?: EventTarget | null): void {
    this.openForm('edit', row.brand, opener);
  }

  protected closeForm(): void {
    if (this.saving()) return;
    this.dialogMode.set(null);
    this.editing.set(null);
    this.setSelectedLogo(null);
    this.restoreFocus();
  }

  protected setField(field: keyof BrandForm, event: Event): void {
    const value = eventValue(event) ?? '';
    if (field === 'categoryId') {
      // Another category has other subcategories.
      this.form.update((form) => ({ ...form, categoryId: value, subCategoryId: '' }));
      const categoryId = selectedId(value);
      if (categoryId !== null) this.loadSubcategories(categoryId);
    } else {
      this.form.update((form) => ({
        ...form,
        [field]: field === 'status' ? (value === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') : value,
      }));
    }
    this.saveError.set('');
  }

  /** Only PNG, JPG or WEBP up to 5 MB (what the S3 API accepts); its unique S3 file name is fixed now. */
  protected onLogoChange(event: Event): void {
    const target = event.target;
    const file = target instanceof HTMLInputElement ? (target.files?.[0] ?? null) : null;
    if (target instanceof HTMLInputElement) target.value = '';
    this.logoError.set('');
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      this.logoError.set('Choose a PNG, JPG or WEBP image.');
      return;
    }
    if (file.size === 0) {
      this.logoError.set('The selected image is empty. Choose another file.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      this.logoError.set('The logo must be 5 MB or smaller.');
      return;
    }
    this.logoUpload.fileName(file);
    this.setSelectedLogo(file);
    this.saveError.set('');
  }

  /** The browser could not show the selected file, so it is not a usable image. */
  protected previewFailed(): void {
    this.setSelectedLogo(null);
    this.logoError.set('This file could not be read as an image. Choose another file.');
  }

  /** Removes the new logo, or else the brand's current one. */
  protected removeLogo(): void {
    if (this.selectedLogo()) this.setSelectedLogo(null);
    else this.removeCurrentLogo.set(true);
    this.logoError.set('');
  }

  /**
   * Saves the form: uploads a new logo first (S3, "brands/<file>"), then POST insert (Add) or PUT update (Edit).
   * One request at a time; the dialog closes, a toast confirms and the list is read again only once it succeeded.
   */
  protected save(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    if (!this.formValid()) return;
    const mode = this.dialogMode();
    const editing = this.editing();
    if (!mode || (mode === 'edit' && !editing)) return;
    const form = this.form();
    const categoryId = selectedId(form.categoryId);
    const subCategoryId = selectedId(form.subCategoryId);
    if (categoryId === null || subCategoryId === null) return;

    const file = this.selectedLogo();
    const keptLogo = editing && !this.removeCurrentLogo() ? editing.logo : null;
    const logo$: Observable<string | null> = file ? this.uploadLogo(file) : of(keptLogo);
    this.saving.set(true);
    this.saveError.set('');
    logo$
      .pipe(
        switchMap((logo) => {
          const value: BrandFormValue = {
            name: form.name.trim().replace(/\s+/g, ' '),
            description: form.description,
            logo,
            status: form.status,
            categoryId,
            subCategoryId,
          };
          return mode === 'edit' && editing
            ? this.brandService.updateBrand(editing.id, value)
            : this.brandService.insertBrand(value);
        }),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (message) => {
          this.toast.showSuccess(message);
          this.saving.set(false);
          this.closeForm();
          // A new brand is looked for from the first page; an edited one stays on its page.
          if (mode === 'add') this.page.set(1);
          this.loadBrands({ quiet: true });
        },
        error: (error: unknown) => {
          const message = this.brandService.getErrorMessage(
            error,
            mode === 'add' ? 'The brand could not be added.' : 'The brand could not be updated.',
          );
          this.saveError.set(message);
          this.toast.showError(message);
        },
      });
  }

  // ---- Delete ----

  protected openDelete(row: BrandRow, opener?: EventTarget | null): void {
    this.dialogOpener = opener instanceof HTMLElement ? opener : null;
    this.deleteError.set('');
    this.deleteTarget.set(row);
    afterNextRender(() => this.deleteDialog()?.nativeElement.focus(), { injector: this.injector });
  }

  protected closeDelete(): void {
    if (this.deleting()) return;
    this.deleteTarget.set(null);
    this.deleteError.set('');
    this.restoreFocus();
  }

  /** DELETE brand_management/delete `{ BRAND_ID, CATEGORY_ID, SUB_CATEGORY_ID }`. */
  protected confirmDelete(): void {
    const row = this.deleteTarget();
    if (!row || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set('');
    this.brandService
      .deleteBrand(row.brand)
      .pipe(
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (message) => {
          this.toast.showSuccess(message);
          // Off the list at once; the page is then read again.
          this.brands.update((brands) => brands.filter((brand) => brand.id !== row.id));
          this.deleting.set(false);
          this.closeDelete();
          this.loadBrands({ quiet: true });
        },
        error: (error: unknown) => {
          // E.g. the backend refuses a brand that products still use.
          const message = this.brandService.getErrorMessage(error, 'The brand could not be deleted.');
          this.deleteError.set(message);
          this.toast.showError(message);
        },
      });
  }

  // ---- Helpers ----

  /**
   * Reads the current page with the server-side filters. `quiet` (after a change) keeps the table on screen while
   * it loads. A page left empty (e.g. its last brand was deleted) steps back to the one before.
   */
  private loadBrands({ quiet = false } = {}): void {
    this.loadRequest?.unsubscribe();
    if (!quiet) {
      this.loadStatus.set('loading');
      this.loadError.set('');
    }
    const page = this.page();
    this.loadRequest = this.brandService
      .loadPage({
        categoryId: selectedId(this.categoryFilter()),
        subCategoryId: selectedId(this.subCategoryFilter()),
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ brands, total }) => {
          if (!brands.length && page > 1) {
            this.page.set(page - 1);
            this.loadBrands({ quiet });
            return;
          }
          this.brands.set(brands);
          this.total.set(total);
          this.loadStatus.set('success');
          // Subcategory names the API did not send come from each category's subcategory list.
          const categoryIds = new Set(
            brands.flatMap((brand) => (brand.subCategoryName === null && brand.categoryId !== null ? [brand.categoryId] : [])),
          );
          for (const categoryId of categoryIds) this.loadSubcategories(categoryId);
        },
        error: (error: unknown) => {
          const message = this.brandService.getErrorMessage(error, 'Brands could not be loaded.');
          this.toast.showError(message);
          if (quiet && this.loadStatus() === 'success') return;
          this.loadError.set(message);
          this.loadStatus.set('error');
        },
      });
  }

  private loadCategories(): void {
    this.categoryLookup.set({ status: 'loading', options: [], error: '' });
    this.catalog
      .loadCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => this.categoryLookup.set({ status: 'success', options, error: '' }),
        error: (error: unknown) =>
          this.categoryLookup.set({ status: 'error', options: [], error: this.catalog.getErrorMessage(error) }),
      });
  }

  /** Loads a category's subcategories once (the catalog caches the request); `retry` reloads a failed list. */
  private loadSubcategories(categoryId: number, retry = false): void {
    const current = this.subcategoryLookups().get(categoryId);
    if (current && !(retry && current.status === 'error')) return;
    const set = (state: LookupState): void =>
      this.subcategoryLookups.update((lookups) => new Map(lookups).set(categoryId, state));
    set({ status: 'loading', options: [], error: '' });
    this.catalog
      .loadSubCategories(categoryId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => set({ status: 'success', options, error: '' }),
        error: (error: unknown) => set({ status: 'error', options: [], error: this.catalog.getErrorMessage(error) }),
      });
  }

  private openForm(mode: DialogMode, brand: Brand | null, opener?: EventTarget | null): void {
    this.dialogOpener = opener instanceof HTMLElement ? opener : null;
    this.dialogMode.set(mode);
    this.editing.set(brand);
    const form: BrandForm = brand
      ? {
          name: brand.name,
          categoryId: brand.categoryId === null ? '' : String(brand.categoryId),
          subCategoryId: brand.subCategoryId === null ? '' : String(brand.subCategoryId),
          description: brand.description,
          status: brand.status,
        }
      : { ...EMPTY_FORM, categoryId: this.categoryFilter(), subCategoryId: this.subCategoryFilter() };
    this.form.set(form);
    const categoryId = selectedId(form.categoryId);
    if (categoryId !== null) this.loadSubcategories(categoryId);
    this.submitted.set(false);
    this.saveError.set('');
    this.logoError.set('');
    this.removeCurrentLogo.set(false);
    this.setSelectedLogo(null);
    afterNextRender(() => this.formDialog()?.nativeElement.querySelector<HTMLElement>('input')?.focus(), {
      injector: this.injector,
    });
  }

  /** The new logo's S3 key ("brands/<its unique file name>"); a retry after a failed save reuses it. */
  private uploadLogo(file: File): Observable<string> {
    if (this.logoUpload.uploadedKey(file)) return this.logoUpload.upload(file);
    this.uploadingLogo.set(true);
    return this.logoUpload.upload(file).pipe(
      // Shown as the save error; the same file can be saved again (it is uploaded once it works).
      catchError((error: unknown) => throwError(() => new Error(this.s3Images.uploadErrorMessage(error, 'The brand logo')))),
      finalize(() => this.uploadingLogo.set(false)),
    );
  }

  /** Keeps the preview object URL in step with the selected file. */
  private setSelectedLogo(file: File | null): void {
    const previous = this.logoPreview();
    if (previous) URL.revokeObjectURL(previous);
    this.logoPreview.set(file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null);
    this.selectedLogo.set(file);
  }

  private restoreFocus(): void {
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    if (opener?.isConnected) opener.focus();
  }
}
