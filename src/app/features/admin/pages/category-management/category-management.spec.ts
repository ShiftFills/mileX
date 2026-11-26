// CHANGED (new): Admin Category Management screen.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { CategoryManagement } from './category-management';

const ADMIN_USER_ID = 3;
const LIST_URL = '/api/category_management/get?CATEGORY_ID=-1&LIMIT=100&OFFSET=0';

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

function row(id: number, name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CATEGORY_ID: id, CATEGORY_NAME: name, PARENT_CATEGORY_ID: null, CATEGORY_IMAGE: null, DESCRIPTION: `${name} products`,
    STATUS: 'Active', CREATED_AT: '2026-11-11T02:03:22.000Z', ...overrides,
  };
}

/** Fashion (7) with Bags (12) and Shoes (13); Electronics (3) with no subcategory, inactive. */
const CATEGORIES = [
  row(12, 'Bags', { PARENT_CATEGORY_ID: 7 }),
  row(7, 'Fashion'),
  row(3, 'Electronics', { STATUS: 'Inactive' }),
  row(13, 'Shoes', { PARENT_CATEGORY_ID: 7, DESCRIPTION: null }),
];

describe('CategoryManagement', () => {
  let fixture: ComponentFixture<CategoryManagement>;
  let http: HttpTestingController;
  let toast: ToastService;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined = root()): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = (): HTMLElement[] => Array.from(root().querySelectorAll('tbody tr'));
  const names = (): string[] => rows().map((tr) => text(tr.querySelector('.category-name__text')));
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const dialog = (): HTMLElement | null => root().querySelector('.category-dialog');
  const buttonIn = (container: Element | null, label: string): HTMLButtonElement =>
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) => text(button).includes(label))!;
  const actionButton = (name: string, action: 'Edit' | 'Delete'): HTMLButtonElement =>
    root().querySelector(`button[aria-label="${action} ${name}"]`) as HTMLButtonElement;

  async function type(selector: string, value: string): Promise<void> {
    const field = root().querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  }

  async function choose(selector: string, value: string): Promise<void> {
    const select = root().querySelector(selector) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  async function open(data: unknown[] = CATEGORIES): Promise<void> {
    fixture = TestBed.createComponent(CategoryManagement);
    fixture.detectChanges();
    http.expectOne(LIST_URL).flush({ status: true, total_records: data.length, data });
    await settle();
  }

  /** Answers the list read that follows a change. */
  async function flushReload(data: unknown[]): Promise<void> {
    http.expectOne(LIST_URL).flush({ status: true, total_records: data.length, data });
    await settle();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CategoryManagement],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    TestBed.inject(AuthService).setSession(
      { id: String(ADMIN_USER_ID), email: '', firstName: 'admin', lastName: '', userType: 'ADMIN' },
      tokenWithClaims({ USER_ID: ADMIN_USER_ID, ADMIN_ID: 1 }),
    );
  });

  afterEach(() => {
    toast.dismiss();
    http.verify();
    localStorage.clear();
  });

  describe('listing', () => {
    it('shows every category in hierarchy order with its parent, status and summary', async () => {
      fixture = TestBed.createComponent(CategoryManagement);
      fixture.detectChanges();
      expect(text(root().querySelector('[role="status"]'))).toContain('Loading categories');
      http.expectOne(LIST_URL).flush({ status: true, total_records: 4, data: CATEGORIES });
      await settle();

      expect(text(root().querySelector('h1'))).toContain('Category Management');
      // Top-level categories by name, each followed by its subcategories.
      // (Subcategory names carry a visually hidden "(subcategory)" for screen readers.)
      expect(names()).toEqual(['Electronics', 'Fashion', 'Bags (subcategory)', 'Shoes (subcategory)']);
      const [electronics, fashion, bags, shoes] = rows();
      expect(text(fashion)).toContain('2 subcategories');
      expect(bags.querySelector('.category-name--sub')).not.toBeNull();
      expect(text(bags)).toContain('Fashion');
      expect(text(electronics.querySelector('app-badge'))).toBe('Inactive');
      expect(text(fashion.querySelector('app-badge'))).toBe('Active');
      expect(text(shoes)).toContain('—');
      expect(text(fashion)).toContain('11 Nov 2026');
      expect(text(root().querySelector('.category-summary'))).toBe('4 categories · 2 top-level · 2 subcategories · 1 inactive');
    });

    it('searches and filters by level and status, and clears the filters', async () => {
      await open();

      await type('#category-search', 'bag');
      expect(names()).toEqual(['Bags (subcategory)']);
      // The parent's name finds its subcategories too.
      await type('#category-search', 'fashion');
      expect(names()).toEqual(['Fashion', 'Bags (subcategory)', 'Shoes (subcategory)']);

      await type('#category-search', '');
      await choose('#category-level-filter', 'sub');
      expect(names()).toEqual(['Bags (subcategory)', 'Shoes (subcategory)']);
      await choose('#category-level-filter', 'all');
      await choose('#category-status-filter', 'Inactive');
      expect(names()).toEqual(['Electronics']);

      await choose('#category-level-filter', 'top');
      await choose('#category-status-filter', 'Active');
      await type('#category-search', 'zzz');
      expect(text(root().querySelector('tbody'))).toContain('No categories match these filters.');

      buttonIn(root(), 'Clear filters').click();
      await settle();
      expect(rows()).toHaveLength(4);
      expect(root().querySelector('.category-clear-filters')).toBeNull();
    });

    it('pages through the categories, 10 at a time', async () => {
      await open(Array.from({ length: 12 }, (_, index) => row(index + 1, `Category ${String(index + 1).padStart(2, '0')}`)));
      expect(rows()).toHaveLength(10);
      expect(text(root().querySelector('app-pagination'))).toContain('12 categories');

      (root().querySelector('app-pagination button[aria-label="Next page"]') as HTMLButtonElement).click();
      await settle();
      expect(names()).toEqual(['Category 11', 'Category 12']);
    });

    it('shows the empty state, and an error with Try again', async () => {
      await open([]);
      expect(text(root().querySelector('.category-empty'))).toContain('No categories yet');

      fixture.destroy();
      fixture = TestBed.createComponent(CategoryManagement);
      fixture.detectChanges();
      http.expectOne(LIST_URL).flush({ message: 'Unauthorized access' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      expect(text(root().querySelector('[role="alert"]'))).toContain('Unauthorized access');

      buttonIn(root().querySelector('[role="alert"]'), 'Try again').click();
      await settle();
      await flushReload(CATEGORIES);
      expect(rows()).toHaveLength(4);
    });
  });

  describe('Add Category', () => {
    async function openAdd(): Promise<void> {
      buttonIn(root().querySelector('app-page-heading'), 'Add Category').click();
      await settle();
    }

    it('adds a top-level category with the signed-in Admin\'s ID, then reads the list again', async () => {
      await open();
      await openAdd();
      expect(text(dialog()?.querySelector('h2'))).toBe('Add Category');
      expect((root().querySelector('#category-parent') as HTMLSelectElement).value).toBe('');
      // Parents offered: top-level categories only.
      expect(Array.from((root().querySelector('#category-parent') as HTMLSelectElement).options).map((option) => text(option)))
        .toEqual(['None (top-level category)', 'Electronics (Inactive)', 'Fashion']);

      await type('#category-name', '  Home   Decor ');
      await type('#category-description', 'Decor for every room');
      buttonIn(dialog(), 'Add Category').click();
      await settle();

      const insert = http.expectOne('/api/category_management/insert');
      expect(insert.request.method).toBe('POST');
      expect(insert.request.body).toEqual({
        CATEGORY_NAME: 'Home Decor', PARENT_CATEGORY_ID: null, CATEGORY_IMAGE: null,
        DESCRIPTION: 'Decor for every room', STATUS: 'Active', CREATED_BY: ADMIN_USER_ID,
      });
      expect(buttonIn(dialog(), 'Saving').getAttribute('aria-busy')).toBe('true');
      insert.flush({ status: true, message: 'Category inserted successfully' });
      await settle();

      expect(toast.current()).toEqual({ type: 'success', message: 'Category inserted successfully' });
      expect(dialog()).toBeNull();
      await flushReload([...CATEGORIES, row(20, 'Home Decor')]);
      expect(names()).toContain('Home Decor');
    });

    it('adds a subcategory under the chosen parent, as Inactive', async () => {
      await open();
      await openAdd();
      await type('#category-name', 'Watches');
      await choose('#category-parent', '7');
      await choose('#category-status', 'Inactive');
      buttonIn(dialog(), 'Add Category').click();
      await settle();

      const insert = http.expectOne('/api/category_management/insert');
      expect(insert.request.body).toMatchObject({ CATEGORY_NAME: 'Watches', PARENT_CATEGORY_ID: 7, STATUS: 'Inactive' });
      insert.flush({ status: true });
      await settle();
      await flushReload(CATEGORIES);
    });

    it('requires a name, and refuses a name already used by a sibling', async () => {
      await open();
      await openAdd();
      buttonIn(dialog(), 'Add Category').click();
      await settle();
      expect(text(dialog()?.querySelector('.category-field__error'))).toBe('Enter a category name.');

      // "bags" exists under Fashion, not at the top level.
      await type('#category-name', ' BAGS ');
      await choose('#category-parent', '7');
      buttonIn(dialog(), 'Add Category').click();
      await settle();
      expect(text(dialog()?.querySelector('.category-field__error'))).toBe('This parent already has a subcategory with this name.');
      await choose('#category-parent', '');
      expect(dialog()?.querySelector('.category-field__error')).toBeNull();

      await type('#category-name', 'fashion');
      expect(text(dialog()?.querySelector('.category-field__error'))).toBe('A top-level category with this name already exists.');
      http.expectNone('/api/category_management/insert');
    });

    it('uploads a chosen image to S3 first and saves its key as CATEGORY_IMAGE', async () => {
      await open();
      await openAdd();
      await type('#category-name', 'Toys');
      const input = root().querySelector('.category-upload__choose input[type="file"]') as HTMLInputElement;
      const file = new File(['png'], 'toys.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();

      buttonIn(dialog(), 'Add Category').click();
      await settle();
      const upload: TestRequest = http.expectOne((request) => request.url.endsWith('/s3/upload'));
      const body = upload.request.body as FormData;
      expect(body.get('folderName')).toBe('categories');
      const key = `categories/${String(body.get('fileName'))}`;
      upload.flush({ success: true, imageKey: key });

      const insert = http.expectOne('/api/category_management/insert');
      expect(insert.request.body).toMatchObject({ CATEGORY_NAME: 'Toys', CATEGORY_IMAGE: key });
      insert.flush({ status: true });
      await settle();
      await flushReload(CATEGORIES);
    });

    it('rejects a file that is not a PNG, JPG or WEBP image', async () => {
      await open();
      await openAdd();
      const input = root().querySelector('.category-upload__choose input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'notes.txt', { type: 'text/plain' })], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();
      expect(text(dialog())).toContain('Choose a PNG, JPG or WEBP image.');
    });

    it('keeps the dialog open with the API error when the insert fails', async () => {
      await open();
      await openAdd();
      await type('#category-name', 'Toys');
      buttonIn(dialog(), 'Add Category').click();
      await settle();
      http.expectOne('/api/category_management/insert').flush({ status: false, message: 'Category already exists' });
      await settle();

      expect(dialog()).not.toBeNull();
      expect(text(dialog()?.querySelector('.category-dialog__error'))).toBe('Category already exists');
      expect(toast.current()).toEqual({ type: 'error', message: 'Category already exists' });
      http.expectNone(LIST_URL);
    });
  });

  describe('Edit Category', () => {
    it('loads the category into the form and updates it with CATEGORY_ID and UPDATED_BY', async () => {
      await open([...CATEGORIES.slice(0, 3), row(13, 'Shoes', { PARENT_CATEGORY_ID: 7, CATEGORY_IMAGE: 'uploads/categories/shoes.png' })]);
      actionButton('Shoes', 'Edit').click();
      await settle();

      expect(text(dialog()?.querySelector('h2'))).toBe('Edit Category');
      expect((root().querySelector('#category-name') as HTMLInputElement).value).toBe('Shoes');
      expect((root().querySelector('#category-parent') as HTMLSelectElement).value).toBe('7');
      expect((root().querySelector('#category-status') as HTMLSelectElement).value).toBe('Active');
      expect(dialog()?.querySelector('.category-upload img')?.getAttribute('src')).toBe('/uploads/categories/shoes.png');

      await type('#category-name', 'Footwear');
      await choose('#category-parent', '3');
      buttonIn(dialog(), 'Update Category').click();
      await settle();

      const update = http.expectOne('/api/category_management/update');
      expect(update.request.method).toBe('PUT');
      expect(update.request.body).toEqual({
        CATEGORY_ID: 13, CATEGORY_NAME: 'Footwear', PARENT_CATEGORY_ID: 3, CATEGORY_IMAGE: 'uploads/categories/shoes.png',
        DESCRIPTION: 'Shoes products', STATUS: 'Active', UPDATED_BY: ADMIN_USER_ID,
      });
      update.flush({ status: true, message: 'Category updated successfully' });
      await settle();
      expect(dialog()).toBeNull();
      expect(toast.current()?.message).toBe('Category updated successfully');
      await flushReload(CATEGORIES);
    });

    it('removes the current image when asked (CATEGORY_IMAGE null)', async () => {
      await open([row(7, 'Fashion', { CATEGORY_IMAGE: 'uploads/categories/fashion.png' })]);
      actionButton('Fashion', 'Edit').click();
      await settle();
      buttonIn(dialog(), 'Remove').click();
      await settle();
      expect(text(dialog()?.querySelector('.category-upload'))).toContain('No image');

      buttonIn(dialog(), 'Update Category').click();
      await settle();
      const update = http.expectOne('/api/category_management/update');
      expect(update.request.body).toMatchObject({ CATEGORY_ID: 7, CATEGORY_IMAGE: null });
      update.flush({ status: true });
      await settle();
      await flushReload(CATEGORIES);
    });

    it('never offers a category as its own parent, and keeps a category with subcategories top-level', async () => {
      await open();
      actionButton('Fashion', 'Edit').click();
      await settle();

      const parent = root().querySelector('#category-parent') as HTMLSelectElement;
      // Fashion has subcategories: it stays top-level (no loop can be made).
      expect(parent.disabled).toBe(true);
      expect(Array.from(parent.options).map((option) => option.value)).not.toContain('7');
      expect(text(dialog())).toContain('It has 2 subcategories, so it stays a top-level category.');

      buttonIn(dialog(), 'Cancel').click();
      await settle();
      actionButton('Electronics', 'Edit').click();
      await settle();
      expect(Array.from((root().querySelector('#category-parent') as HTMLSelectElement).options).map((option) => option.value))
        .toEqual(['', '7']);
      buttonIn(dialog(), 'Cancel').click();
      await settle();
      http.expectNone('/api/category_management/update');
    });
  });

  describe('Delete Category', () => {
    it('asks first, then sends DELETE { CATEGORY_ID } and reads the list again', async () => {
      await open();
      actionButton('Shoes', 'Delete').click();
      await settle();

      const confirm = root().querySelector('.category-dialog--delete');
      expect(confirm?.getAttribute('role')).toBe('alertdialog');
      expect(text(confirm)).toContain('Delete “Shoes” (subcategory of Fashion)? This cannot be undone.');
      http.expectNone('/api/category_management/delete');

      buttonIn(confirm, 'Delete').click();
      await settle();
      const request = http.expectOne('/api/category_management/delete');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({ CATEGORY_ID: 13 });
      request.flush({ status: true, message: 'Category deleted successfully' });
      await settle();

      expect(root().querySelector('.category-dialog--delete')).toBeNull();
      expect(names()).not.toContain('Shoes (subcategory)');
      expect(toast.current()?.message).toBe('Category deleted successfully');
      await flushReload(CATEGORIES.filter((category) => category['CATEGORY_ID'] !== 13));
    });

    it('does not offer to delete a category that has subcategories', async () => {
      await open();
      actionButton('Fashion', 'Delete').click();
      await settle();

      const confirm = root().querySelector('.category-dialog--delete');
      expect(text(confirm)).toContain('“Fashion” has 2 subcategories. Move them to another category or delete them first.');
      expect(buttonIn(confirm, 'Delete')).toBeUndefined();
      buttonIn(confirm, 'Close').click();
      await settle();
      expect(root().querySelector('.category-dialog--delete')).toBeNull();
    });

    it('keeps the category and shows why the backend refused the delete', async () => {
      await open();
      actionButton('Electronics', 'Delete').click();
      await settle();
      buttonIn(root().querySelector('.category-dialog--delete'), 'Delete').click();
      await settle();
      http.expectOne('/api/category_management/delete').flush(
        { status: false, message: 'Category is mapped to products' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(text(root().querySelector('.category-dialog--delete .category-dialog__error'))).toBe('Category is mapped to products');
      expect(names()).toContain('Electronics');
      http.expectNone(LIST_URL);
    });
  });
});
