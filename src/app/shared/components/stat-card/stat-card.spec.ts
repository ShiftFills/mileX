import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  let fixture: ComponentFixture<StatCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatCard] }).compileComponents();
    fixture = TestBed.createComponent(StatCard);
    fixture.componentRef.setInput('label', 'Total Orders');
    fixture.componentRef.setInput('value', 342);
    fixture.componentRef.setInput('trend', '%+8.2');
    await fixture.whenStable();
  });

  it('renders label, value and trend', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Total Orders');
    expect(text).toContain('342');
    expect(text).toContain('%+8.2');
  });
});
