import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Stepper } from './stepper';

describe('Stepper', () => {
  let fixture: ComponentFixture<Stepper>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Stepper] }).compileComponents();
    fixture = TestBed.createComponent(Stepper);
    fixture.componentRef.setInput('steps', [{ label: 'One' }, { label: 'Two' }, { label: 'Three' }]);
    fixture.componentRef.setInput('current', 1);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('marks earlier steps done and the current step as current', () => {
    const steps = root.querySelectorAll('li');
    expect(steps).toHaveLength(3);
    expect(steps[0].classList.contains('is-done')).toBe(true);
    expect(steps[1].classList.contains('is-current')).toBe(true);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[2].classList.contains('is-done') || steps[2].classList.contains('is-current')).toBe(false);
  });

  it('numbers steps that are not done', () => {
    expect(root.querySelectorAll('.stepper__marker')[2].textContent?.trim()).toBe('3');
  });
});
