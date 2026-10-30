import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchableSelect } from './searchable-select';

describe('SearchableSelect', () => {
  let component: SearchableSelect;
  let fixture: ComponentFixture<SearchableSelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchableSelect],
    }).compileComponents();

    fixture = TestBed.createComponent(SearchableSelect);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('filters options by their visible labels', async () => {
    fixture.componentRef.setInput('options', [
      { label: 'Retail Business', value: '13' },
      { label: 'Freelancer', value: '1' },
    ]);
    await fixture.whenStable();

    (
      fixture.nativeElement.querySelector('.searchable-select__trigger') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const search = fixture.nativeElement.querySelector(
      '.searchable-select__search',
    ) as HTMLInputElement;
    search.value = 'retail';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('[role="option"]');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain('Retail Business');
  });

  it('emits the selected value and closes the option list', async () => {
    fixture.componentRef.setInput('options', [
      { label: 'Retail Business', value: '13' },
      { label: 'Freelancer', value: '1' },
    ]);
    await fixture.whenStable();
    const emitted: string[] = [];
    component.valueChange.subscribe((value) => emitted.push(value));

    (
      fixture.nativeElement.querySelector('.searchable-select__trigger') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('[role="option"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted).toEqual(['13']);
    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });

  it('limits the option panel and reports no search matches', async () => {
    fixture.componentRef.setInput('options', [{ label: 'Retail Business', value: '13' }]);
    await fixture.whenStable();

    (
      fixture.nativeElement.querySelector('.searchable-select__trigger') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const search = fixture.nativeElement.querySelector(
      '.searchable-select__search',
    ) as HTMLInputElement;
    search.value = 'unknown';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No matching options');
  });

  it('closes the option panel when the user clicks outside', async () => {
    fixture.componentRef.setInput('options', [{ label: 'Retail Business', value: '13' }]);
    await fixture.whenStable();
    (
      fixture.nativeElement.querySelector('.searchable-select__trigger') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="listbox"]')).toBeNull();
  });
});
