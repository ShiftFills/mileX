// CHANGED: category lookups now expect '/all_category/get' (was '/category_management/get') and no longer check CATEGORY_ID=-1.
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AllProducts } from './all-products';

interface ProductRow {
  id: number;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: number | null;
  status: 'Active' | 'Inactive' | 'Unknown';
  image: string;
}

interface ProductForm {
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: string;
  status: ProductRow['status'];
}

interface AllProductsHarness {
  products: WritableSignal<ProductRow[]>;
  visibleRows(): ProductRow[];
  loadStatus(): 'loading' | 'success' | 'error';
  loadError(): string | null;
  totalProducts(): number;
  page(): number;
  pageSize(): number;
  editingProduct(): ProductRow | null;
  editForm: WritableSignal<ProductForm | null>;
  editError(): string;
  openEdit(product: ProductRow): void;
  toggleActionMenu(id: number): void;
  openActionMenuId(): number | null;
  saveEdit(): void;
  closeEdit(): void;
  setQuery(event: Event): void;
  setCategory(event: Event): void;
  setBrand(event: Event): void;
  setStatus(status: 'All' | 'Active' | 'Inactive'): void;
  categoryLookup(): { status: string; options: { id: string; label: string }[]; error: string | null };
  brandLookup(): { status: string; options: { id: string; label: string }[]; error: string | null };
  retryCategoryLookup(): void;
}

const API_PRODUCTS = [
  {
    PRODUCT_ID: 3,
    PRODUCT_NAME: 'Samsung Galaxy S25',
    PRODUCT_CODE_SKU: 'SKU0003',
    CATEGORY_ID: 1,
    BRAND_ID: 1,
    PRODUCT_DESCRIPTION: 'Samsung smartphone',
    SELLING_PRICE: '2500.00',
    PRICE: '3000.00',
    STOCK_QUANTITY: 100,
    IS_ACTIVE: 'ACTIVE',
    IMAGE_URL: 'https://example.test/galaxy.jpg',
  },
  {
    PRODUCT_ID: 4,
    PRODUCT_NAME: 'Wireless Mouse',
    PRODUCT_CODE_SKU: 'SKU0004',
    CATEGORY_ID: 2,
    BRAND_ID: 2,
    SELLING_PRICE: '749.00',
    STOCK_QUANTITY: 0,
    IS_ACTIVE: 'INACTIVE',
  },
];

function response(
  data: Record<string, unknown>[],
  totalRecords = data.length,
  currentPage = 1,
  limit = 5,
) {
  return {
    status: 'SUCCESS',
    message: 'Products fetched successfully',
    data,
    pagination: {
      totalRecords,
      currentPage,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  };
}

function selectEvent(value: string): Event {
  const select = document.createElement('select');
  const option = document.createElement('option');
  option.value = value;
  select.append(option);
  select.value = value;
  return { target: select } as unknown as Event;
}

function inputEvent(value: string): Event {
  const input = document.createElement('input');
  input.value = value;
  return { target: input } as unknown as Event;
}

describe('AllProducts', () => {
  let fixture: ComponentFixture<AllProducts>;
  let component: AllProductsHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllProducts],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AllProducts);
    component = fixture.componentInstance as unknown as AllProductsHarness;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadLookups(): void {
    fixture.detectChanges();
    http.expectOne((req) =>
      req.url.endsWith('/all_category/get') &&
      req.method === 'GET',
    ).flush({
      status: 'SUCCESS',
      data: [
        { CATEGORY_ID: 1, CATEGORY_NAME: 'Electronics' },
        { CATEGORY_ID: 2, CATEGORY_NAME: 'Home' },
      ],
    });
    http.expectOne((req) =>
      req.url.endsWith('/brand_management/get') &&
      req.method === 'GET' &&
      req.params.get('BRAND_ID') === '-1' &&
      req.params.get('CATEGORY_ID') === null &&
      req.params.get('SUB_CATEGORY_ID') === null,
    ).flush({
      status: 'SUCCESS',
      data: [
        { BRAND_ID: 1, BRAND_NAME: 'Samsung' },
        { BRAND_ID: 2, BRAND_NAME: 'MileX' },
      ],
    });
    fixture.detectChanges();
  }

  function loadFirstPage(total = 12): void {
    loadLookups();
    const request = http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.method === 'GET' &&
      req.params.get('PRODUCT_ID') === '-1' &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    );
    request.flush(response(API_PRODUCTS, total));
    fixture.detectChanges();
  }

  it('calls the paginated products API and maps actual API rows into the table', () => {
    loadFirstPage();

    expect(component.loadStatus()).toBe('success');
    expect(component.totalProducts()).toBe(12);
    expect(component.visibleRows()).toEqual([
      {
        id: 3,
        name: 'Samsung Galaxy S25',
        sku: 'SKU0003',
        category: 'category-1',
        brand: 'brand-1',
        price: '₹2,500',
        stock: 100,
        status: 'Active',
        image: 'https://example.test/galaxy.jpg',
      },
      {
        id: 4,
        name: 'Wireless Mouse',
        sku: 'SKU0004',
        category: 'category-2',
        brand: 'brand-2',
        price: '₹749',
        stock: 0,
        status: 'Inactive',
        image: '/images/latest-gadgets.svg',
      },
    ]);

    const rows = fixture.nativeElement.querySelectorAll('.products-table-wrap tbody tr');
    expect(rows.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Samsung Galaxy S25');
    expect(fixture.nativeElement.textContent).not.toContain('Wireless Earbuds');
    expect(fixture.nativeElement.textContent).toContain('of 12 products');
  });

  it('loads category and brand filter options and combines them with search and status filters', () => {
    loadFirstPage();

    const categorySelect = fixture.nativeElement.querySelector('#admin-product-category') as HTMLSelectElement;
    const brandSelect = fixture.nativeElement.querySelector('#admin-product-brand') as HTMLSelectElement;
    expect(Array.from(categorySelect.options).map((option) => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'All Categories'],
      ['1', 'Electronics'],
      ['2', 'Home'],
    ]);
    expect(Array.from(brandSelect.options).map((option) => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'All Brands'],
      ['1', 'Samsung'],
      ['2', 'MileX'],
    ]);

    component.setQuery(inputEvent('Wireless'));
    component.setCategory(selectEvent('2'));
    component.setBrand(selectEvent('2'));
    component.setStatus('Inactive');
    fixture.detectChanges();

    expect(component.visibleRows().map((row) => row.id)).toEqual([4]);
  });

  it('shows lookup loading, error, and empty states and allows retrying a failed lookup', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading categories');
    expect(fixture.nativeElement.textContent).toContain('Loading brands');

    http.expectOne((req) => req.url.endsWith('/all_category/get')).flush({
      status: 'ERROR',
      message: 'Category service unavailable',
    });
    http.expectOne((req) => req.url.endsWith('/brand_management/get')).flush({
      status: 'SUCCESS',
      data: [],
    });
    http.expectOne((req) =>
      req.url.endsWith('/products/get') && req.params.get('LIMIT') === '5',
    ).flush(response([], 0));
    fixture.detectChanges();

    expect(component.categoryLookup()).toMatchObject({
      status: 'error',
      error: 'Category service unavailable',
    });
    expect(component.brandLookup()).toMatchObject({ status: 'success', options: [] });
    expect(fixture.nativeElement.textContent).toContain('Categories could not be loaded');
    expect(fixture.nativeElement.textContent).toContain('No brands available');

    component.retryCategoryLookup();
    http.expectOne((req) => req.url.endsWith('/all_category/get')).flush({
      status: 'SUCCESS',
      data: [{ CATEGORY_ID: 1, CATEGORY_NAME: 'Electronics' }],
    });
    fixture.detectChanges();

    expect(component.categoryLookup()).toMatchObject({
      status: 'success',
      options: [{ id: '1', label: 'Electronics' }],
    });
  });

  it('requests the next server page and updates the total/range from response metadata', async () => {
    loadFirstPage(12);
    const next = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement;
    next.click();
    fixture.detectChanges();

    const request = http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    );
    expect(component.loadStatus()).toBe('loading');
    request.flush(response([API_PRODUCTS[0]], 11, 2, 5));
    fixture.detectChanges();

    expect(component.page()).toBe(2);
    expect(component.visibleRows()[0].id).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Showing 6–10 of 11 products');
  });

  it('returns to page 1 from page 2 using cached API rows without another request', () => {
    loadFirstPage(12);

    const next = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement;
    next.click();
    fixture.detectChanges();

    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    ).flush(response([{
      ...API_PRODUCTS[0],
      PRODUCT_ID: 8,
      PRODUCT_NAME: 'Page two product',
    }], 12, 2, 5));
    fixture.detectChanges();
    expect(component.visibleRows().map((row) => row.name)).toEqual(['Page two product']);

    const firstPage = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-current="page"]',
    ) as HTMLButtonElement;
    expect(firstPage.textContent?.trim()).toBe('2');
    const pageButtons = Array.from(
      fixture.nativeElement.querySelectorAll('.pagination__nav button'),
    ) as HTMLButtonElement[];
    const pageOne = pageButtons.find((button) => button.textContent?.trim() === '1');
    pageOne?.click();
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);

    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.page()).toBe(2);
    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Previous page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);
    http.expectNone((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    );
  });

  it('keeps Previous and page 1 accessible when page 2 contains records but the API total is stale', () => {
    loadFirstPage(12);
    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();

    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    ).flush(response([{
      ...API_PRODUCTS[0],
      PRODUCT_ID: 8,
      PRODUCT_NAME: 'Page two product',
    }], 5, 2, 5));
    fixture.detectChanges();

    expect(component.page()).toBe(2);
    expect(component.visibleRows().map((row) => row.name)).toEqual(['Page two product']);
    const previous = fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Previous page"]',
    ) as HTMLButtonElement;
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.pagination__nav button'),
    ) as HTMLButtonElement[];
    const pageOne = buttons.find((button) => button.textContent?.trim() === '1');
    expect(previous.disabled).toBe(false);
    expect(pageOne).toBeTruthy();

    previous.click();
    fixture.detectChanges();
    expect(component.page()).toBe(1);
    expect(component.visibleRows().map((row) => row.id)).toEqual([3, 4]);
  });

  it('changes page size by requesting the first page with the selected LIMIT', () => {
    loadFirstPage();
    const select = fixture.nativeElement.querySelector('#admin-product-page-size') as HTMLSelectElement;
    select.value = '10';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const request = http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '10' &&
      req.params.get('OFFSET') === '0',
    );
    request.flush(response(API_PRODUCTS, 12, 1, 10));
    fixture.detectChanges();

    expect(component.pageSize()).toBe(10);
    expect(component.totalProducts()).toBe(12);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–10 of 12 products');
  });

  it('displays the live five-row response and infers the final total when the API omits metadata', () => {
    const fullPage = Array.from({ length: 5 }, (_, index) => ({
      PRODUCT_ID: 30 + index,
      PRODUCT_NAME: `Live API product ${index + 1}`,
      PRODUCT_CODE_SKU: `LIVE-${index + 1}`,
      CATEGORY_ID: 1,
      BRAND_ID: 1,
      SELLING_PRICE: '100.00',
      STOCK_QUANTITY: 10,
      IS_ACTIVE: 1,
    }));

    loadLookups();
    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    ).flush({
      status: 'SUCCESS',
      message: 'Product details fetched successfully',
      data: fullPage,
    });
    fixture.detectChanges();

    expect(component.visibleRows().map((row) => row.name)).toEqual([
      'Live API product 1',
      'Live API product 2',
      'Live API product 3',
      'Live API product 4',
      'Live API product 5',
    ]);
    expect(fixture.nativeElement.textContent).not.toContain('Wireless Earbuds');
    expect(fixture.nativeElement.textContent).toContain('Showing 1–5 products on this page');

    (fixture.nativeElement.querySelector(
      '.pagination__nav button[aria-label="Next page"]',
    ) as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '5',
    ).flush({ status: 'SUCCESS', message: 'Product details fetched successfully', data: [] });
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.totalProducts()).toBe(5);
    expect(component.visibleRows().map((row) => row.name)).toEqual([
      'Live API product 1',
      'Live API product 2',
      'Live API product 3',
      'Live API product 4',
      'Live API product 5',
    ]);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–5 of 5 products');
    expect(fixture.nativeElement.textContent).toContain(
      'Page 2 has no products. Showing page 1, the last available page.',
    );
  });

  it('keeps API errors visible and never restores demo rows', () => {
    loadLookups();
    http.expectOne((req) =>
      req.url.endsWith('/products/get') &&
      req.params.get('LIMIT') === '5' &&
      req.params.get('OFFSET') === '0',
    ).flush({ status: 'ERROR', message: 'Products service unavailable' });
    fixture.detectChanges();

    expect(component.loadStatus()).toBe('error');
    expect(component.loadError()).toBe('Products service unavailable');
    expect(component.visibleRows()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Products service unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('Wireless Earbuds');
  });

  it('opens an edit draft prefilled with the selected API product and saves only that row', () => {
    loadFirstPage();
    const [selected, untouched] = component.visibleRows();
    component.toggleActionMenu(selected.id);
    component.openEdit(selected);

    expect(component.editingProduct()?.id).toBe(selected.id);
    expect(component.editForm()).toEqual({
      name: selected.name,
      sku: selected.sku,
      category: selected.category,
      brand: selected.brand,
      price: '2500',
      stock: String(selected.stock),
      status: selected.status,
    });

    component.editForm.update((form) => form ? {
      ...form,
      name: 'Edited Galaxy',
      price: '2999',
      stock: '75',
      status: 'Inactive',
    } : form);
    component.saveEdit();

    expect(component.products().find((product) => product.id === selected.id)).toMatchObject({
      name: 'Edited Galaxy',
      price: '₹2,999',
      stock: 75,
      status: 'Inactive',
    });
    expect(component.products().find((product) => product.id === untouched.id)).toEqual(untouched);
    expect(component.editingProduct()).toBeNull();
  });

  it('cancels without changing API rows and rejects invalid edit data', () => {
    loadFirstPage();
    const selected = component.visibleRows()[0];
    const original = component.products().find((product) => product.id === selected.id);

    component.openEdit(selected);
    component.editForm.update((form) => form ? { ...form, name: 'Unsaved name' } : form);
    component.closeEdit();
    expect(component.products().find((product) => product.id === selected.id)).toEqual(original);

    component.openEdit(selected);
    component.editForm.update((form) => form ? { ...form, stock: '-1' } : form);
    component.saveEdit();
    expect(component.editError()).toBeTruthy();
    expect(component.editingProduct()?.id).toBe(selected.id);
    expect(component.products().find((product) => product.id === selected.id)).toEqual(original);
  });

  it('closes the action menu for outside clicks', () => {
    loadFirstPage();
    const product = component.visibleRows()[0];
    const trigger = fixture.nativeElement.querySelector('.more-actions') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(component.openActionMenuId()).toBe(product.id);

    const menu = fixture.nativeElement.querySelector('.product-action-menu') as HTMLDivElement;
    menu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(component.openActionMenuId()).toBe(product.id);

    fixture.nativeElement.querySelector('h1').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(component.openActionMenuId()).toBeNull();
  });
});