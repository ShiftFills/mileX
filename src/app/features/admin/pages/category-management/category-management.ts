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
import { Observable, catchError, finalize, of, switchMap, throwError } from 'rxjs';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { CATEGORY_IMAGE_FOLDER, S3FileUpload, S3ImageService } from '@core/services/s3-image.service';
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
import {
  Category,
  CategoryFormValue,
  CategoryManagementService,
  CategoryStatus,
} from '../../services/category-management.service';

// CHANGED (new): Admin Category Management.

type LoadStatus = 'loading' | 'success' | 'error';
type TypeFilter = 'all' | 'top' | 'sub';
type StatusFilter = 'all' | CategoryStatus;
type DialogMode = 'add' | 'edit';

/** One table row: a category, in hierarchy order (each top-level category followed by its subcategories). */
interface CategoryRow {
  id: number;
  category: Category;
  name: string;
  /** 0: top-level; 1: a subcategory (deeper levels are shown one step further in). */
  depth: number;
  parentLabel: string;
  description: string;
  status: CategoryStatus;
  created: string;
  childCount: number;
}

/** The Add / Edit form as typed (parentId is the <select> value: '' for a top-level category). */
interface CategoryForm {
  name: string;
  parentId: string;
  description: string;
  status: CategoryStatus;
}

interface ParentOption {
  id: number;
  label: string;
}

const PAGE_SIZE = 10;
const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EMPTY_FORM: CategoryForm = { name: '', parentId: '', description: '', status: 'Active' };

function normalizedName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function displayDate(value: string | null): string {
  if (!value) return '—';
  const time = Date.parse(value);
  return Number.isFinite(time) ? formatDate(time, 'dd MMM yyyy', 'en-US') : value;
}

/**
 * The categories in hierarchy order: each top-level category (by name) followed by its subcategories (by name), at
 * any depth. A category whose parent is not in the list, or that is part of a parent loop in the data, is listed as
 * a top-level row so it is never hidden.
 */
function hierarchyRows(categories: readonly Category[]): CategoryRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const children = new Map<number, Category[]>();
  const roots: Category[] = [];
  for (const category of categories) {
    const parent = category.parentId === null ? undefined : byId.get(category.parentId);
    if (parent) children.set(parent.id, [...(children.get(parent.id) ?? []), category]);
    else roots.push(category);
  }
  const byName = (a: Category, b: Category): number => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const rows: CategoryRow[] = [];
  const visited = new Set<number>();
  const visit = (category: Category, depth: number): void => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    const parent = category.parentId === null ? undefined : byId.get(category.parentId);
    rows.push({
      id: category.id,
      category,
      name: category.name,
      depth,
      parentLabel: parent?.name ?? category.parentName ?? (category.parentId === null ? '—' : `Category #${category.parentId}`),
      description: category.description || '—',
      status: category.status,
      created: displayDate(category.createdAt),
      childCount: children.get(category.id)?.length ?? 0,
    });
    for (const child of [...(children.get(category.id) ?? [])].sort(byName)) visit(child, depth + 1);
  };
  for (const root of [...roots].sort(byName)) visit(root, 0);
  // Categories caught in a parent loop (bad data) have no root to be reached from.
  for (const category of [...categories].sort(byName)) visit(category, 0);
  return rows;
}

/** The IDs of a category's subcategories, at every depth. */
function descendantIds(categoryId: number, categories: readonly Category[]): Set<number> {
  const ids = new Set<number>();
  let frontier = [categoryId];
  while (frontier.length) {
    const next = categories
      .filter((category) => category.parentId !== null && frontier.includes(category.parentId) && !ids.has(category.id))
      .map((category) => category.id);
    for (const id of next) ids.add(id);
    frontier = next;
  }
  ids.delete(categoryId);
  return ids;
}

/**
 * Admin Category Management: every category (category_management/get, read a page at a time) in a searchable,
 * filterable table in hierarchy order, with Add / Edit in one form (category_management/insert, update) and Delete
 * after a confirmation (category_management/delete).
 *
 * Hierarchy rules: a category is either top-level (PARENT_CATEGORY_ID null) or a subcategory of a top-level
 * category, the two levels the product forms use (Category, then Subcategory). So the Parent list offers top-level
 * categories only, never the category itself; a category that has subcategories stays top-level; and a category
 * with subcategories cannot be deleted until they are moved or deleted. No parent loop can be made.
 */
@Component({
  selector: 'app-category-management',
  imports: [Badge, Button, Card, Dialog, Input, LoadingSpinner, PageHeading, Pagination, Select, Table, Textarea],
  templateUrl: './category-management.html',
  styleUrl: './category-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Each category's own image (signed S3 URL), as on the product screens.
  providers: [ProductImageDisplayService],
})
export class CategoryManagement {
  private readonly categoryService = inject(CategoryManagementService);
  private readonly s3Images = inject(S3ImageService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly productImages = inject(ProductImageDisplayService);
  private readonly imageUpload = new S3FileUpload(this.s3Images, CATEGORY_IMAGE_FOLDER);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly nameMaxLength = NAME_MAX_LENGTH;
  protected readonly descriptionMaxLength = DESCRIPTION_MAX_LENGTH;

  // ---- The list ----
  protected readonly categories = signal<readonly Category[]>([]);
  protected readonly loadStatus = signal<LoadStatus>('loading');
  protected readonly loadError = signal('');
  private loadRequest?: { unsubscribe(): void };

  protected readonly query = signal('');
  protected readonly typeFilter = signal<TypeFilter>('all');
  protected readonly statusFilter = signal<StatusFilter>('all');
  protected readonly page = signal(1);

  protected readonly allRows = computed(() => hierarchyRows(this.categories()));
  protected readonly summary = computed(() => {
    const categories = this.categories();
    const subcategories = categories.filter((category) => category.parentId !== null).length;
    return {
      total: categories.length,
      topLevel: categories.length - subcategories,
      subcategories,
      inactive: categories.filter((category) => category.status === 'Inactive').length,
    };
  });
  protected readonly hasActiveFilters = computed(
    () => this.query().trim() !== '' || this.typeFilter() !== 'all' || this.statusFilter() !== 'all',
  );
  protected readonly filteredRows = computed(() => {
    const query = normalizedName(this.query());
    const type = this.typeFilter();
    const status = this.statusFilter();
    return this.allRows().filter((row) => {
      if (type === 'top' && row.category.parentId !== null) return false;
      if (type === 'sub' && row.category.parentId === null) return false;
      if (status !== 'all' && row.status !== status) return false;
      if (!query) return true;
      return `${row.name} ${row.category.description} ${row.id} ${row.parentLabel}`.toLowerCase().includes(query);
    });
  });
  /** The page on screen, kept within the pages there are (e.g. after the last row of a page was deleted). */
  protected readonly currentPage = computed(() =>
    Math.min(this.page(), Math.max(1, Math.ceil(this.filteredRows().length / PAGE_SIZE))),
  );
  protected readonly visibleRows = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filteredRows().slice(start, start + PAGE_SIZE);
  });

  private readonly imageCell = viewChild<TemplateRef<TableCellContext<CategoryRow>>>('imageCell');
  private readonly nameCell = viewChild<TemplateRef<TableCellContext<CategoryRow>>>('nameCell');
  private readonly descriptionCell = viewChild<TemplateRef<TableCellContext<CategoryRow>>>('descriptionCell');
  private readonly statusCell = viewChild<TemplateRef<TableCellContext<CategoryRow>>>('statusCell');
  private readonly actionsCell = viewChild<TemplateRef<TableCellContext<CategoryRow>>>('actionsCell');

  protected readonly tableColumns = computed<readonly TableColumn<CategoryRow>[]>(() => [
    { key: 'image', label: 'Image', width: '7%', cellTemplate: this.imageCell() },
    { key: 'name', label: 'Category Name', width: '22%', cellTemplate: this.nameCell() },
    { key: 'id', label: 'ID', width: '6%' },
    { key: 'parentLabel', label: 'Parent Category', width: '15%' },
    { key: 'description', label: 'Description', width: '22%', cellTemplate: this.descriptionCell() },
    { key: 'status', label: 'Status', width: '9%', cellTemplate: this.statusCell() },
    { key: 'created', label: 'Created', width: '10%' },
    { key: 'actions', label: 'Actions', width: '9%', align: 'center', cellTemplate: this.actionsCell() },
  ]);

  // ---- Add / Edit dialog ----
  protected readonly dialogMode = signal<DialogMode | null>(null);
  /** The category being edited (null when adding). */
  protected readonly editing = signal<Category | null>(null);
  protected readonly form = signal<CategoryForm>(EMPTY_FORM);
  /** Set by the first Save, so errors show once the Admin tried to save. */
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploadingImage = signal(false);
  protected readonly saveError = signal('');
  protected readonly selectedImage = signal<File | null>(null);
  protected readonly imagePreview = signal<string | null>(null);
  protected readonly imageError = signal('');
  /** Edit: the category's current image is to be removed (CATEGORY_IMAGE null). */
  protected readonly removeCurrentImage = signal(false);

  // ---- Delete dialog ----
  protected readonly deleteTarget = signal<CategoryRow | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal('');

  private dialogOpener: HTMLElement | null = null;
  private readonly formDialog = viewChild<ElementRef<HTMLElement>>('formDialog');
  private readonly deleteDialog = viewChild<ElementRef<HTMLElement>>('deleteDialog');

  /** The edited category's subcategories (it then stays top-level). */
  protected readonly editingChildCount = computed(() => {
    const category = this.editing();
    return category ? this.categories().filter((candidate) => candidate.parentId === category.id).length : 0;
  });

  /**
   * The Parent list: top-level categories, by name, never the edited category or one of its subcategories. A
   * current parent that is not top-level (data made elsewhere) is listed too, so the form shows what is saved.
   */
  protected readonly parentOptions = computed<readonly ParentOption[]>(() => {
    const editing = this.editing();
    const categories = this.categories();
    const excluded = editing ? descendantIds(editing.id, categories).add(editing.id) : new Set<number>();
    const options = categories
      .filter((category) => category.parentId === null && !excluded.has(category.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((category) => ({
        id: category.id,
        label: category.status === 'Inactive' ? `${category.name} (Inactive)` : category.name,
      }));
    const currentParentId = editing?.parentId ?? null;
    if (currentParentId !== null && !options.some((option) => option.id === currentParentId)) {
      const current = categories.find((category) => category.id === currentParentId);
      options.push({ id: currentParentId, label: current?.name ?? editing?.parentName ?? `Category #${currentParentId}` });
    }
    return options;
  });

  protected readonly nameError = computed(() => {
    const form = this.form();
    const name = normalizedName(form.name);
    if (!name) return 'Enter a category name.';
    if (form.name.trim().length > NAME_MAX_LENGTH) return `Use ${NAME_MAX_LENGTH} characters or fewer.`;
    const parentId = form.parentId ? Number(form.parentId) : null;
    const editingId = this.editing()?.id;
    const duplicate = this.categories().some(
      (category) => category.id !== editingId && category.parentId === parentId && normalizedName(category.name) === name,
    );
    return duplicate
      ? parentId === null
        ? 'A top-level category with this name already exists.'
        : 'This parent already has a subcategory with this name.'
      : '';
  });
  protected readonly parentError = computed(() => {
    const parentId = this.form().parentId ? Number(this.form().parentId) : null;
    const editing = this.editing();
    if (parentId === null || !editing) return '';
    if (parentId === editing.id) return 'A category cannot be its own parent.';
    if (descendantIds(editing.id, this.categories()).has(parentId)) {
      return 'A category cannot be moved under one of its own subcategories.';
    }
    if (this.editingChildCount() > 0) return 'A category with subcategories must stay a top-level category.';
    return '';
  });
  protected readonly descriptionError = computed(() =>
    this.form().description.trim().length > DESCRIPTION_MAX_LENGTH
      ? `Use ${DESCRIPTION_MAX_LENGTH} characters or fewer.`
      : '',
  );
  protected readonly formValid = computed(() => !this.nameError() && !this.parentError() && !this.descriptionError());
  /** The image the form shows: the new file's preview, else the current image (unless it is being removed). */
  protected readonly currentImageSource = computed(() => {
    const editing = this.editing();
    return editing?.image && !this.removeCurrentImage() ? editing : null;
  });

  constructor() {
    this.loadCategories();
    // The S3 image URLs of the categories (one request per distinct key; cached URLs make none).
    effect(() => {
      const categories = this.categories();
      untracked(() => this.productImages.show(categories));
    });
    this.destroyRef.onDestroy(() => this.setSelectedImage(null));
  }

  // ---- List ----

  protected retryLoad(): void {
    this.loadCategories();
  }

  protected setQuery(event: Event): void {
    this.query.set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setTypeFilter(event: Event): void {
    const value = eventValue(event);
    this.typeFilter.set(value === 'top' || value === 'sub' ? value : 'all');
    this.page.set(1);
  }

  protected setStatusFilter(event: Event): void {
    const value = eventValue(event);
    this.statusFilter.set(value === 'Active' || value === 'Inactive' ? value : 'all');
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.typeFilter.set('all');
    this.statusFilter.set('all');
    this.page.set(1);
  }

  // ---- Add / Edit ----

  protected openAdd(opener?: EventTarget | null): void {
    this.openForm('add', null, opener);
  }

  protected openEdit(row: CategoryRow, opener?: EventTarget | null): void {
    this.openForm('edit', row.category, opener);
  }

  protected closeForm(): void {
    if (this.saving()) return;
    this.dialogMode.set(null);
    this.editing.set(null);
    this.setSelectedImage(null);
    this.restoreFocus();
  }

  protected setField(field: keyof CategoryForm, event: Event): void {
    const value = eventValue(event) ?? '';
    this.form.update((form) => ({
      ...form,
      [field]: field === 'status' ? (value === 'Inactive' ? 'Inactive' : 'Active') : value,
    }));
    this.saveError.set('');
  }

  /** Only PNG, JPG or WEBP up to 5 MB (what the S3 API accepts); its unique S3 file name is fixed now. */
  protected onImageChange(event: Event): void {
    const target = event.target;
    const file = target instanceof HTMLInputElement ? target.files?.[0] ?? null : null;
    if (target instanceof HTMLInputElement) target.value = '';
    this.imageError.set('');
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      this.imageError.set('Choose a PNG, JPG or WEBP image.');
      return;
    }
    if (file.size === 0) {
      this.imageError.set('The selected image is empty. Choose another file.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      this.imageError.set('The image must be 5 MB or smaller.');
      return;
    }
    this.imageUpload.fileName(file);
    this.setSelectedImage(file);
    this.saveError.set('');
  }

  /** The browser could not show the selected file, so it is not a usable image. */
  protected previewFailed(): void {
    this.setSelectedImage(null);
    this.imageError.set('This file could not be read as an image. Choose another file.');
  }

  /** Removes the new image, or else the category's current one. */
  protected removeImage(): void {
    if (this.selectedImage()) this.setSelectedImage(null);
    else this.removeCurrentImage.set(true);
    this.imageError.set('');
  }

  /**
   * Saves the form: uploads a new image first (S3, "categories/<file>"), then POST insert (Add) or PUT update (Edit).
   * One request at a time; the dialog closes, a toast confirms and the list is read again only once it succeeded.
   */
  protected save(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    if (!this.formValid()) return;
    const mode = this.dialogMode();
    const editingId = this.editing()?.id;
    if (!mode || (mode === 'edit' && editingId === undefined)) return;
    const editing = this.editing();

    const form = this.form();
    const file = this.selectedImage();
    const keptImage = editing && !this.removeCurrentImage() ? editing.image : null;
    const image$: Observable<string | null> = file ? this.uploadImage(file) : of(keptImage);
    this.saving.set(true);
    this.saveError.set('');
    image$
      .pipe(
        switchMap((image) => {
          const value: CategoryFormValue = {
            name: form.name.trim().replace(/\s+/g, ' '),
            parentId: form.parentId ? Number(form.parentId) : null,
            description: form.description,
            image,
            status: form.status,
          };
          return mode === 'edit' && editingId !== undefined
            ? this.categoryService.updateCategory(editingId, value)
            : this.categoryService.insertCategory(value);
        }),
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (message) => {
          this.toast.showSuccess(message);
          this.saving.set(false);
          this.closeForm();
          this.loadCategories({ quiet: true });
        },
        error: (error: unknown) => {
          const message = this.categoryService.getErrorMessage(
            error,
            mode === 'add' ? 'The category could not be added.' : 'The category could not be updated.',
          );
          this.saveError.set(message);
          this.toast.showError(message);
        },
      });
  }

  // ---- Delete ----

  protected openDelete(row: CategoryRow, opener?: EventTarget | null): void {
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

  /** DELETE category_management/delete `{ CATEGORY_ID }`; not offered for a category that has subcategories. */
  protected confirmDelete(): void {
    const row = this.deleteTarget();
    if (!row || this.deleting() || row.childCount > 0) return;
    this.deleting.set(true);
    this.deleteError.set('');
    this.categoryService
      .deleteCategory(row.id)
      .pipe(
        finalize(() => this.deleting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (message) => {
          this.toast.showSuccess(message);
          // Off the list at once; the list is then read again.
          this.categories.update((categories) => categories.filter((category) => category.id !== row.id));
          this.deleting.set(false);
          this.closeDelete();
          this.loadCategories({ quiet: true });
        },
        error: (error: unknown) => {
          // E.g. the backend refuses a category that products still use.
          const message = this.categoryService.getErrorMessage(error, 'The category could not be deleted.');
          this.deleteError.set(message);
          this.toast.showError(message);
        },
      });
  }

  // ---- Helpers ----

  /** Reads every category. `quiet` (after a change) keeps the table on screen while it loads. */
  private loadCategories({ quiet = false } = {}): void {
    this.loadRequest?.unsubscribe();
    if (!quiet) {
      this.loadStatus.set('loading');
      this.loadError.set('');
    }
    this.loadRequest = this.categoryService
      .loadAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (categories) => {
          this.categories.set(categories);
          this.loadStatus.set('success');
        },
        error: (error: unknown) => {
          const message = this.categoryService.getErrorMessage(error, 'Categories could not be loaded.');
          this.toast.showError(message);
          if (quiet && this.loadStatus() === 'success') return;
          this.loadError.set(message);
          this.loadStatus.set('error');
        },
      });
  }

  private openForm(mode: DialogMode, category: Category | null, opener?: EventTarget | null): void {
    this.dialogOpener = opener instanceof HTMLElement ? opener : null;
    this.dialogMode.set(mode);
    this.editing.set(category);
    this.form.set(
      category
        ? {
            name: category.name,
            parentId: category.parentId === null ? '' : String(category.parentId),
            description: category.description,
            status: category.status,
          }
        : EMPTY_FORM,
    );
    this.submitted.set(false);
    this.saveError.set('');
    this.imageError.set('');
    this.removeCurrentImage.set(false);
    this.setSelectedImage(null);
    afterNextRender(() => this.formDialog()?.nativeElement.querySelector<HTMLElement>('input')?.focus(), {
      injector: this.injector,
    });
  }

  /** The new image's S3 key ("categories/<its unique file name>"); a retry after a failed save reuses it. */
  private uploadImage(file: File): Observable<string> {
    if (this.imageUpload.uploadedKey(file)) return this.imageUpload.upload(file);
    this.uploadingImage.set(true);
    return this.imageUpload.upload(file).pipe(
      // Shown as the save error; the same file can be saved again (it is uploaded once it works).
      catchError((error: unknown) =>
        throwError(() => new Error(this.s3Images.uploadErrorMessage(error, 'The category image'))),
      ),
      finalize(() => this.uploadingImage.set(false)),
    );
  }

  /** Keeps the preview object URL in step with the selected file. */
  private setSelectedImage(file: File | null): void {
    const previous = this.imagePreview();
    if (previous) URL.revokeObjectURL(previous);
    this.imagePreview.set(file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null);
    this.selectedImage.set(file);
  }

  private restoreFocus(): void {
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    if (opener?.isConnected) opener.focus();
  }
}
