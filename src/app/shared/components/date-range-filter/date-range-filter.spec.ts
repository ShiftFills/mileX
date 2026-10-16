import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DateRangeFilter } from './date-range-filter';

describe('DateRangeFilter', () => {
  let fixture: ComponentFixture<DateRangeFilter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DateRangeFilter] }).compileComponents();
    fixture = TestBed.createComponent(DateRangeFilter);
    await fixture.whenStable();
  });

  it('lists the default ranges and emits the chosen value', async () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Last 30 days');

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));
    const select = root.querySelector('select') as HTMLSelectElement;
    select.value = '90';
    select.dispatchEvent(new Event('change'));
    expect(emitted).toEqual(['90']);
  });
});
