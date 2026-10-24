import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Filter } from './filter';

describe('Filter', () => {
  let fixture: ComponentFixture<Filter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Filter] }).compileComponents();
    fixture = TestBed.createComponent(Filter);
    fixture.componentRef.setInput('options', [
      { value: 'all', label: 'All', count: 3 },
      { value: 'fashion', label: 'Fashion', count: 2 },
    ]);
    fixture.componentRef.setInput('value', 'all');
    await fixture.whenStable();
  });

  it('renders each option with its count and marks the active one', () => {
    const chips: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    expect(chips.map((chip) => chip.textContent?.trim())).toEqual(['All (3)', 'Fashion (2)']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    expect(chips[1].getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the clicked option value', () => {
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));
    fixture.nativeElement.querySelectorAll('button')[1].click();
    expect(emitted).toEqual(['fashion']);
  });
});
