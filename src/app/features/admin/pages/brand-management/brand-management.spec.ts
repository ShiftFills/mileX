// CHANGED (new): Admin Brand Management screen.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { BrandManagement } from './brand-management';

const ADMIN_USER_ID = 3;
const listUrl = (categoryId = -1, subCategoryId = -1, offset = 0): string =>
  `/api/brand_management/get?BRAND_ID=-1&CATEGORY_ID=${categoryId}&SUB_CATEGORY_ID=${subCategoryId}&LIMIT=10&OFFSET=${offset}`;

function tokenWithClaims(claims: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}

function brand(id: number, name: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    BRAND_ID: id, BRAND_NAME: name, BRAND_LOGO: null, DESCRIPTION: `${name} products`, STATUS: 'ACTIVE',
    CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, CREATED_AT: '2026-11-20T10:00:00.000Z', ...overrides,
  };
}

const CATEGORIES = [
  { CATEGORY_ID: 3, CATEGORY_NAME: 'Electronics' },
  { CATEGORY_ID: 8, CATEGORY_NAME: 'Furniture' },
  { CATEGORY_ID: 11, CATEGORY_NAME: 'Toys' },
];
const SUBCATEGORIES: Record<string, unknown[]> = {
  '3': [{ SUB_CATEGORY_ID: 2, SUB_CATEGORY_NAME: 'Mobiles' }, { SUB_CATEGORY_ID: 5, SUB_CATEGORY_NAME: 'Laptops' }],
  '8': [{ SUB_CATEGORY_ID: 9, SUB_CATEGORY_NAME: 'Sofas' }],
  '11': [],
};

/** Samsung and Dell (Electronics, names from the lookups); IKEA (names sent by the API). */
const BRANDS = [
  brand(4, 'Samsung', { BRAND_LOGO: 'uploads/brands/samsung.png' }),
  brand(7, 'Dell', { SUB_CATEGORY_ID: 5, STATUS: 'INACTIVE', DESCRIPTION: null }),
  brand(9, 'IKEA', { CATEGORY_ID: 8, CATEGORY_NAME: 'Furniture', SUB_CATEGORY_ID: 9, SUB_CATEGORY_NAME: 'Sofas' }),
];

describe('BrandManagement', () => {
  let fixture: ComponentFixture<BrandManagement>;
  let http: HttpTestingController;
  let toast: ToastService;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (element: Element | null | undefined = root()): string =>
    (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = (): HTMLElement[] => Array.from(root().querySelectorAll('tbody tr'));
  const names = (): string[] => rows().map((tr) => text(tr.querySelector('.brand-name__text')));
  const cells = (tr: Element): string[] => Array.from(tr.querySelectorAll('td'), (td) => text(td));
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const dialog = (): HTMLElement | null => root().querySelector('.brand-dialog');
  const select = (selector: string): HTMLSelectElement => root().querySelector(selector) as HTMLSelectElement;
  const optionLabels = (selector: string): string[] => Array.from(select(selector).options, (option) => text(option));
  const buttonIn = (container: Element | null, label: string): HTMLButtonElement =>
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) => text(button).includes(label))!;
  const actionButton = (name: string, action: 'View' | 'Edit' | 'Delete'): HTMLButtonElement =>
    root().querySelector(`button[aria-label="${action} ${name}"]`) as HTMLButtonElement;

  async function type(selector: string, value: string): Promise<void> {
    const field = root().querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  }

  async function choose(selector: string, value: string): Promise<void> {
    const field = select(selector);
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await settle();
  }

  /** Answers every pending sub_category/get request with that category's subcategories. */
  async function flushSubcategories(): Promise<number> {
    const requests = http.match((request) => request.url.endsWith('/sub_category/get'));
    for (const request of requests) {
      request.flush({ status: 'SUCCESS', data: SUBCATEGORIES[request.request.params.get('CATEGORY_ID') ?? ''] ?? [] });
    }
    await settle();
    return requests.length;
  }

  async function flushList(data: unknown[], url = listUrl(), total: number | null = data.length): Promise<void> {
    http.expectOne(url).flush({ status: 'SUCCESS', ...(total === null ? {} : { total_records: total }), data });
    await settle();
    await flushSubcategories();
  }

  async function open(data: unknown[] = BRANDS, total: number | null = data.length): Promise<void> {
    fixture = TestBed.createComponent(BrandManagement);
    fixture.detectChanges();
    http.expectOne('/api/all_category/get').flush({ status: 'SUCCESS', data: CATEGORIES });
    await flushList(data, listUrl(), total);
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [BrandManagement],
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
    it('shows the first page with each brand\'s logo, category, subcategory and status', async () => {
      fixture = TestBed.createComponent(BrandManagement);
      fixture.detectChanges();
      expect(text(root().querySelector('[role="status"]'))).toContain('Loading brands');
      http.expectOne('/api/all_category/get').flush({ status: 'SUCCESS', data: CATEGORIES });
      await flushList(BRANDS);

      expect(text(root().querySelector('h1'))).toContain('Brand Management');
      expect(Array.from(root().querySelectorAll('thead th'), (th) => text(th))).toEqual([
        'Logo', 'Brand Name', 'Description', 'Category', 'Subcategory', 'Status', 'Actions',
      ]);
      expect(names()).toEqual(['Samsung', 'Dell', 'IKEA']);
      const [samsung, dell, ikea] = rows();
      // Names missing from the API come from the category and subcategory lookups.
      expect(text(samsung.querySelector('.brand-name__id'))).toBe('ID 4');
      expect(cells(samsung).slice(2, 6)).toEqual(['Samsung products', 'Electronics', 'Mobiles', 'Active']);
      expect(cells(dell).slice(2, 6)).toEqual(['—', 'Electronics', 'Laptops', 'Inactive']);
      expect(cells(ikea).slice(3, 5)).toEqual(['Furniture', 'Sofas']);
      expect(samsung.querySelector('img.brand-logo')?.getAttribute('src')).toBe('/uploads/brands/samsung.png');
      expect(dell.querySelector('.brand-logo--empty')?.getAttribute('aria-label')).toBe('No logo for Dell');
      expect(text(root().querySelector('app-pagination'))).toContain('Showing 1–3 of 3 brands');
    });

    it('filters by category and subcategory on the server, and clears the filters', async () => {
      await open();
      const subcategoryFilter = (): HTMLSelectElement => select('#brand-subcategory-filter');
      expect(subcategoryFilter().disabled).toBe(true);

      await choose('#brand-category-filter', '3');
      await flushList([BRANDS[0], BRANDS[1]], listUrl(3, -1));
      expect(names()).toEqual(['Samsung', 'Dell']);
      expect(subcategoryFilter().disabled).toBe(false);
      expect(optionLabels('#brand-subcategory-filter')).toEqual(['All subcategories', 'Mobiles', 'Laptops']);

      await choose('#brand-subcategory-filter', '5');
      await flushList([BRANDS[1]], listUrl(3, 5));
      expect(names()).toEqual(['Dell']);

      // Another category starts from all its subcategories.
      await choose('#brand-category-filter', '8');
      expect(subcategoryFilter().value).toBe('');
      await flushList([BRANDS[2]], listUrl(8, -1));
      expect(optionLabels('#brand-subcategory-filter')).toEqual(['All subcategories', 'Sofas']);

      buttonIn(root(), 'Clear filters').click();
      await settle();
      await flushList(BRANDS);
      expect(names()).toEqual(['Samsung', 'Dell', 'IKEA']);
      expect(select('#brand-category-filter').value).toBe('');
      expect(root().querySelector('.brand-clear-filters')).toBeNull();
    });

    it('searches and filters the page on screen by status without another request', async () => {
      await open();
      await type('#brand-search', 'sofa');
      expect(names()).toEqual(['IKEA']);
      await type('#brand-search', 'ELECTRONICS');
      expect(names()).toEqual(['Samsung', 'Dell']);
      await choose('#brand-status-filter', 'INACTIVE');
      expect(names()).toEqual(['Dell']);
      await type('#brand-search', 'zzz');
      expect(text(root().querySelector('tbody'))).toContain('No brands on this page match the search or status.');

      buttonIn(root(), 'Clear filters').click();
      await settle();
      expect(rows()).toHaveLength(3);
      http.expectNone((request) => request.url.endsWith('/brand_management/get'));
    });

    it('pages through the brands with LIMIT and OFFSET, using total_records', async () => {
      const page = (start: number, count: number): unknown[] =>
        Array.from({ length: count }, (_, index) => brand(start + index, `Brand ${start + index}`));
      await open(page(1, 10), 25);
      expect(text(root().querySelector('app-pagination'))).toContain('Showing 1–10 of 25 brands');

      (root().querySelector('app-pagination button[aria-label="Next page"]') as HTMLButtonElement).click();
      await settle();
      await flushList(page(11, 10), listUrl(-1, -1, 10), 25);
      expect(names()[0]).toBe('Brand 11');

      Array.from(root().querySelectorAll<HTMLButtonElement>('app-pagination button')).find((button) => text(button) === '3')!.click();
      await settle();
      await flushList(page(21, 5), listUrl(-1, -1, 20), 25);
      expect(names()).toHaveLength(5);
      expect((root().querySelector('app-pagination button[aria-label="Next page"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('offers another page after a full page when the API sends no total, and stops at a short one', async () => {
      const page = (start: number, count: number): unknown[] =>
        Array.from({ length: count }, (_, index) => brand(start + index, `Brand ${start + index}`));
      await open(page(1, 10), null);
      const next = (): HTMLButtonElement => root().querySelector('app-pagination button[aria-label="Next page"]') as HTMLButtonElement;
      expect(next().disabled).toBe(false);

      next().click();
      await settle();
      await flushList(page(11, 4), listUrl(-1, -1, 10), null);
      expect(next().disabled).toBe(true);
      expect(text(root().querySelector('app-pagination'))).toContain('Showing 11–14 of 14 brands');
    });

    it('shows the empty state, and an error with Try again', async () => {
      await open([]);
      expect(text(root().querySelector('.brand-empty'))).toContain('No brands yet');

      fixture.destroy();
      fixture = TestBed.createComponent(BrandManagement);
      fixture.detectChanges();
      http.expectOne(listUrl()).flush({ message: 'Unauthorized access' }, { status: 401, statusText: 'Unauthorized' });
      await settle();
      expect(text(root().querySelector('.alert[role="alert"]'))).toContain('Unauthorized access');

      buttonIn(root().querySelector('.alert[role="alert"]'), 'Try again').click();
      await settle();
      await flushList(BRANDS);
      expect(rows()).toHaveLength(3);
    });

    it('offers Retry when the categories cannot be loaded', async () => {
      fixture = TestBed.createComponent(BrandManagement);
      fixture.detectChanges();
      http.expectOne('/api/all_category/get').flush({ message: 'Down' }, { status: 503, statusText: 'Unavailable' });
      await flushList(BRANDS);
      expect(select('#brand-category-filter').disabled).toBe(true);
      expect(text(root().querySelector('.admin-list-filter-error'))).toContain('Categories could not be loaded.');
      // Without the category list, a brand's category is named by its ID.
      expect(cells(rows()[0])[3]).toBe('Category #3');

      buttonIn(root().querySelector('.admin-list-filter-error'), 'Retry').click();
      await settle();
      http.expectOne('/api/all_category/get').flush({ status: 'SUCCESS', data: CATEGORIES });
      await settle();
      expect(select('#brand-category-filter').disabled).toBe(false);
      expect(cells(rows()[0])[3]).toBe('Electronics');
    });
  });

  describe('View', () => {
    it('shows the brand\'s details and opens Edit from there', async () => {
      await open();
      actionButton('Samsung', 'View').click();
      await settle();

      const view = root().querySelector('.brand-dialog--view');
      expect(text(view?.querySelector('h2'))).toBe('Brand Details');
      expect(text(view)).toContain('Electronics › Mobiles');
      const details = Array.from(view?.querySelectorAll('dl > div') ?? [], (item) =>
        [text(item.querySelector('dt')), text(item.querySelector('dd'))]);
      expect(details).toEqual([
        ['Brand ID', '4'], ['Status', 'Active'], ['Category', 'Electronics'], ['Subcategory', 'Mobiles'],
        ['Created', '20 Nov 2026'], ['Last updated', '—'], ['Description', 'Samsung products'],
      ]);
      expect(view?.querySelector('.brand-view__logo img')?.getAttribute('src')).toBe('/uploads/brands/samsung.png');

      buttonIn(view, 'Edit Brand').click();
      await settle();
      expect(root().querySelector('.brand-dialog--view')).toBeNull();
      expect(text(dialog()?.querySelector('h2'))).toBe('Edit Brand');
      expect((root().querySelector('#brand-name') as HTMLInputElement).value).toBe('Samsung');
    });
  });

  describe('Add Brand', () => {
    async function openAdd(): Promise<void> {
      buttonIn(root().querySelector('app-page-heading'), 'Add Brand').click();
      await settle();
    }

    it('adds a brand with the chosen category, subcategory and the signed-in Admin\'s ID, then reads page 1 again', async () => {
      await open();
      await openAdd();
      expect(text(dialog()?.querySelector('h2'))).toBe('Add Brand');
      expect(optionLabels('#brand-category')).toEqual(['Select category', 'Electronics', 'Furniture', 'Toys']);
      expect(select('#brand-subcategory').disabled).toBe(true);
      expect(optionLabels('#brand-subcategory')).toEqual(['Select a category first']);

      await type('#brand-name', '  Sony   India ');
      await choose('#brand-category', '3');
      // Electronics' subcategories were already read for the table.
      expect(await flushSubcategories()).toBe(0);
      expect(optionLabels('#brand-subcategory')).toEqual(['Select subcategory', 'Mobiles', 'Laptops']);
      await choose('#brand-subcategory', '2');
      await choose('#brand-status', 'INACTIVE');
      await type('#brand-description', ' Sony electronics brand ');
      buttonIn(dialog(), 'Add Brand').click();
      await settle();

      const insert = http.expectOne('/api/brand_management/insert');
      expect(insert.request.method).toBe('POST');
      expect(insert.request.body).toEqual({
        BRAND_NAME: 'Sony India', BRAND_LOGO: null, DESCRIPTION: 'Sony electronics brand', STATUS: 'INACTIVE',
        CATEGORY_ID: 3, SUB_CATEGORY_ID: 2, CREATED_BY: ADMIN_USER_ID,
      });
      expect(buttonIn(dialog(), 'Saving').getAttribute('aria-busy')).toBe('true');
      insert.flush({ status: 'SUCCESS', message: 'Brand inserted successfully' });
      await settle();

      expect(toast.current()).toEqual({ type: 'success', message: 'Brand inserted successfully' });
      expect(dialog()).toBeNull();
      await flushList([...BRANDS, brand(12, 'Sony India')]);
      expect(names()).toContain('Sony India');
    });

    it('requires a name, a category and a subcategory', async () => {
      await open();
      await openAdd();
      buttonIn(dialog(), 'Add Brand').click();
      await settle();
      expect(Array.from(dialog()?.querySelectorAll('.brand-field__error') ?? [], (error) => text(error))).toEqual([
        'Enter a brand name.', 'Choose a category.',
      ]);

      await type('#brand-name', 'Lego');
      await choose('#brand-category', '11');
      await flushSubcategories();
      expect(text(dialog()?.querySelector('.brand-field__error'))).toBe(
        'This category has no subcategories. Add one in Category Management first.',
      );
      http.expectNone('/api/brand_management/insert');
    });

    it('starts in the category and subcategory the list is filtered by', async () => {
      await open();
      await choose('#brand-category-filter', '3');
      await flushList(BRANDS.slice(0, 2), listUrl(3, -1));
      await choose('#brand-subcategory-filter', '5');
      await flushList([BRANDS[1]], listUrl(3, 5));

      await openAdd();
      expect(select('#brand-category').value).toBe('3');
      expect(select('#brand-subcategory').value).toBe('5');
    });

    it('uploads a chosen logo to S3 first and saves its key as BRAND_LOGO', async () => {
      await open();
      await openAdd();
      await type('#brand-name', 'Sony');
      await choose('#brand-category', '3');
      await choose('#brand-subcategory', '2');
      const input = root().querySelector('.brand-upload__choose input[type="file"]') as HTMLInputElement;
      const file = new File(['png'], 'sony.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();

      buttonIn(dialog(), 'Add Brand').click();
      await settle();
      const upload: TestRequest = http.expectOne((request) => request.url.endsWith('/s3/upload'));
      const body = upload.request.body as FormData;
      expect(body.get('folderName')).toBe('brands');
      const key = `brands/${String(body.get('fileName'))}`;
      upload.flush({ success: true, imageKey: key });

      const insert = http.expectOne('/api/brand_management/insert');
      expect(insert.request.body).toMatchObject({ BRAND_NAME: 'Sony', BRAND_LOGO: key });
      insert.flush({ status: 'SUCCESS' });
      await settle();
      expect(toast.current()?.message).toBe('Brand added successfully.');
      await flushList(BRANDS);
    });

    it('rejects a logo that is not a PNG, JPG or WEBP image', async () => {
      await open();
      await openAdd();
      const input = root().querySelector('.brand-upload__choose input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'logo.gif', { type: 'image/gif' })], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settle();
      expect(text(dialog())).toContain('Choose a PNG, JPG or WEBP image.');
    });

    it('keeps the dialog open with the API error when the insert fails', async () => {
      await open();
      await openAdd();
      await type('#brand-name', 'Samsung');
      await choose('#brand-category', '3');
      await choose('#brand-subcategory', '2');
      buttonIn(dialog(), 'Add Brand').click();
      await settle();
      http.expectOne('/api/brand_management/insert').flush({ status: 'FAILED', message: 'Brand already exists' });
      await settle();

      expect(dialog()).not.toBeNull();
      expect(text(dialog()?.querySelector('.brand-dialog__error'))).toBe('Brand already exists');
      expect(toast.current()).toEqual({ type: 'error', message: 'Brand already exists' });
      http.expectNone((request) => request.url.endsWith('/brand_management/get'));
    });
  });

  describe('Edit Brand', () => {
    it('loads the brand into the form and updates it with BRAND_ID and UPDATED_BY', async () => {
      await open();
      actionButton('Samsung', 'Edit').click();
      await settle();

      expect(text(dialog()?.querySelector('h2'))).toBe('Edit Brand');
      expect((root().querySelector('#brand-name') as HTMLInputElement).value).toBe('Samsung');
      expect(select('#brand-category').value).toBe('3');
      expect(select('#brand-subcategory').value).toBe('2');
      expect(select('#brand-status').value).toBe('ACTIVE');
      expect(dialog()?.querySelector('.brand-upload img')?.getAttribute('src')).toBe('/uploads/brands/samsung.png');

      // Another category: its own subcategories are read, and one must be chosen again.
      await choose('#brand-category', '8');
      expect(select('#brand-subcategory').value).toBe('');
      expect(await flushSubcategories()).toBe(1);
      await choose('#brand-subcategory', '9');
      await type('#brand-name', 'Samsung Home');
      buttonIn(dialog(), 'Update Brand').click();
      await settle();

      const update = http.expectOne('/api/brand_management/update');
      expect(update.request.method).toBe('PUT');
      expect(update.request.body).toEqual({
        BRAND_ID: 4, BRAND_NAME: 'Samsung Home', BRAND_LOGO: 'uploads/brands/samsung.png', DESCRIPTION: 'Samsung products',
        STATUS: 'ACTIVE', CATEGORY_ID: 8, SUB_CATEGORY_ID: 9, UPDATED_BY: ADMIN_USER_ID,
      });
      update.flush({ status: 'SUCCESS', message: 'Brand updated successfully' });
      await settle();
      expect(dialog()).toBeNull();
      expect(toast.current()?.message).toBe('Brand updated successfully');
      await flushList(BRANDS);
    });

    it('removes the current logo when asked (BRAND_LOGO null)', async () => {
      await open();
      actionButton('Samsung', 'Edit').click();
      await settle();
      buttonIn(dialog(), 'Remove').click();
      await settle();
      expect(text(dialog()?.querySelector('.brand-upload'))).toContain('No logo');

      buttonIn(dialog(), 'Update Brand').click();
      await settle();
      const update = http.expectOne('/api/brand_management/update');
      expect(update.request.body).toMatchObject({ BRAND_ID: 4, BRAND_LOGO: null });
      update.flush({ status: 'SUCCESS' });
      await settle();
      await flushList(BRANDS);
    });
  });

  describe('Delete Brand', () => {
    it('asks first, then sends DELETE { BRAND_ID, CATEGORY_ID, SUB_CATEGORY_ID } and reads the page again', async () => {
      await open();
      actionButton('Dell', 'Delete').click();
      await settle();

      const confirm = root().querySelector('.brand-dialog--delete');
      expect(confirm?.getAttribute('role')).toBe('alertdialog');
      expect(text(confirm)).toContain('Delete “Dell” from Electronics › Laptops? This cannot be undone.');
      http.expectNone('/api/brand_management/delete');

      buttonIn(confirm, 'Delete').click();
      await settle();
      const request = http.expectOne('/api/brand_management/delete');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toEqual({ BRAND_ID: 7, CATEGORY_ID: 3, SUB_CATEGORY_ID: 5 });
      request.flush({ status: 'SUCCESS', message: 'Brand deleted successfully' });
      await settle();

      expect(root().querySelector('.brand-dialog--delete')).toBeNull();
      expect(names()).toEqual(['Samsung', 'IKEA']);
      expect(toast.current()?.message).toBe('Brand deleted successfully');
      await flushList([BRANDS[0], BRANDS[2]]);
    });

    it('steps back a page when the last brand of a page was deleted', async () => {
      const page = (start: number, count: number): unknown[] =>
        Array.from({ length: count }, (_, index) => brand(start + index, `Brand ${start + index}`));
      await open(page(1, 10), 11);
      (root().querySelector('app-pagination button[aria-label="Next page"]') as HTMLButtonElement).click();
      await settle();
      await flushList(page(11, 1), listUrl(-1, -1, 10), 11);

      actionButton('Brand 11', 'Delete').click();
      await settle();
      buttonIn(root().querySelector('.brand-dialog--delete'), 'Delete').click();
      await settle();
      http.expectOne('/api/brand_management/delete').flush({ status: 'SUCCESS' });
      await settle();
      http.expectOne(listUrl(-1, -1, 10)).flush({ status: 'SUCCESS', total_records: 10, data: [] });
      await settle();
      await flushList(page(1, 10), listUrl(), 10);
      expect(names()[0]).toBe('Brand 1');
    });

    it('keeps the brand and shows why the backend refused the delete', async () => {
      await open();
      actionButton('Samsung', 'Delete').click();
      await settle();
      buttonIn(root().querySelector('.brand-dialog--delete'), 'Delete').click();
      await settle();
      http.expectOne('/api/brand_management/delete').flush(
        { status: 'FAILED', message: 'Brand is mapped to products' },
        { status: 409, statusText: 'Conflict' },
      );
      await settle();

      expect(text(root().querySelector('.brand-dialog--delete .brand-dialog__error'))).toBe('Brand is mapped to products');
      expect(names()).toContain('Samsung');
      http.expectNone((request) => request.url.endsWith('/brand_management/get'));
    });
  });
});
