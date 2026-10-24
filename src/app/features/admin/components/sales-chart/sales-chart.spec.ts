import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SalesChart } from './sales-chart';

describe('SalesChart', () => {
  let fixture: ComponentFixture<SalesChart>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SalesChart] }).compileComponents();
    fixture = TestBed.createComponent(SalesChart);
    fixture.componentRef.setInput('points', [
      { label: 'Jan', value: 20, amount: '₹1', change: '+1%' },
      { label: 'Feb', value: 60, amount: '₹2', change: '-2%' },
      { label: 'Mar', value: 40, amount: '₹3', change: '+3%' },
    ]);
    fixture.componentRef.setInput('axis', ['₹100K', '₹0']);
    fixture.componentRef.setInput('defaultIndex', 2);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('shows the default period in the tooltip and moves it on hover', async () => {
    expect(root.querySelector('.sales-chart__tip')?.textContent).toContain('Mar, 2026');
    (root.querySelectorAll('.sales-chart__hit')[1] as HTMLElement).dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();
    expect(root.querySelector('.sales-chart__tip')?.textContent).toContain('Feb, 2026');
    expect(root.querySelector('.sales-chart__tip em')?.classList.contains('is-negative')).toBe(true);
  });

  it('draws one smooth path through every point', () => {
    const line = root.querySelector('.sales-chart__line')?.getAttribute('d') ?? '';
    expect(line.startsWith('M 0 80')).toBe(true);
    expect(line.match(/C/g)?.length).toBe(2);
  });
});
