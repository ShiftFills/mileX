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
});
