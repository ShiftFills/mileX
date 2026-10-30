import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pagination } from './pagination';

describe('Pagination', () => {
  let component: Pagination;
  let fixture: ComponentFixture<Pagination>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Pagination],
    }).compileComponents();

    fixture = TestBed.createComponent(Pagination);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the visible range and emits page changes', async () => {
    fixture.componentRef.setInput('total', 128);
    fixture.componentRef.setInput('page', 1);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.pagination__summary')?.textContent).toContain('1–6');
    expect(root.querySelector('.pagination__summary')?.textContent).toContain('128');

    const emitted: number[] = [];
    component.pageChange.subscribe((page) => emitted.push(page));
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.pagination__nav button'));
    buttons.find((button) => button.textContent?.trim() === '2')?.click();
    expect(emitted).toEqual([2]);
  });

  it('uses the server-provided page count for navigation', async () => {
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('pageSize', 5);
    fixture.componentRef.setInput('total', 13);
    fixture.componentRef.setInput('totalPages', 3);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const pageButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.pagination__nav button'));
    expect(pageButtons.map((button) => button.textContent?.trim())).toEqual([
      '',
      '1',
      '2',
      '3',
      '',
    ]);

    const emitted: number[] = [];
    component.pageChange.subscribe((page) => emitted.push(page));
    pageButtons.at(-1)?.click();
    expect(emitted).toEqual([3]);
  });

  it('supports next-page navigation when the API omits total metadata', async () => {
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('pageSize', 5);
    fixture.componentRef.setInput('total', undefined);
    fixture.componentRef.setInput('totalPages', undefined);
    fixture.componentRef.setInput('hasNext', true);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.pagination__summary')?.textContent).toContain('1–5');
    const next = root.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
    expect(next?.disabled).toBe(false);

    const emitted: number[] = [];
    component.pageChange.subscribe((page) => emitted.push(page));
    next?.click();
    expect(emitted).toEqual([2]);
  });

  it('keeps Previous available when the reported page count is behind the current page', async () => {
    fixture.componentRef.setInput('page', 2);
    fixture.componentRef.setInput('pageSize', 5);
    fixture.componentRef.setInput('total', 5);
    fixture.componentRef.setInput('totalPages', 1);
    fixture.componentRef.setInput('hasNext', false);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const previous = root.querySelector<HTMLButtonElement>('button[aria-label="Previous page"]');
    const next = root.querySelector<HTMLButtonElement>('button[aria-label="Next page"]');
    expect(previous?.disabled).toBe(false);
    expect(next?.disabled).toBe(true);
    expect(Array.from(root.querySelectorAll('.pagination__nav button'))
      .some((button) => button.textContent?.trim() === '1')).toBe(true);

    const emitted: number[] = [];
    component.pageChange.subscribe((page) => emitted.push(page));
    previous?.click();
    expect(emitted).toEqual([1]);
  });
});
