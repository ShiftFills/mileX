import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Refund } from './refund';

describe('Refund', () => {
  let fixture: ComponentFixture<Refund>;
  let root: HTMLElement;

  async function render(id?: string): Promise<void> {
    if (id) fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Refund],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Refund);
  });

  it('shows the latest refund when no id is given', async () => {
    await render();
    expect(root.querySelector('h1')?.textContent).toContain('Refund');
    expect(root.textContent).toContain('REF-TXN-9982310');
    expect(root.textContent).toContain('₹1,499.00');
    expect(root.textContent).toContain('Completed');
  });

  it('renders every lifecycle step with the last one current', async () => {
    await render('RET-884912');
    const steps = root.querySelectorAll('app-stepper li');
    expect(steps).toHaveLength(5);
    expect(steps[4].classList.contains('is-current')).toBe(true);
    expect(root.querySelectorAll('app-stepper li.is-done')).toHaveLength(4);
  });

  it('lists the returned item with its return reason', async () => {
    await render('RET-884912');
    expect(root.querySelector('.refund-item h3')?.textContent).toContain('Sony Noise-Cancelling Headphones');
    expect(root.querySelector('.refund-item__reason')?.textContent).toContain('Defective audio output');
  });

  it('shows a not-found state for an unknown return number', async () => {
    await render('RET-000000');
    expect(root.querySelector('.refund-empty')).not.toBeNull();
    expect(root.querySelector('app-stepper')).toBeNull();
  });
});
