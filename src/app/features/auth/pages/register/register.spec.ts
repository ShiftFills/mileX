import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Register } from './register';

describe('Register', () => {
  let fixture: ComponentFixture<Register>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the required registration fields and verification actions', () => {
    const requiredInputs = fixture.nativeElement.querySelectorAll('input[required]');
    expect(requiredInputs.length).toBe(6);
    expect(fixture.nativeElement.querySelectorAll('.register-verify').length).toBe(2);
    expect(fixture.nativeElement.querySelector('#register-email').type).toBe('email');
    expect(fixture.nativeElement.querySelector('#register-mobile').type).toBe('tel');
  });

  it('reports that email verification is unavailable instead of pretending it succeeded', () => {
    const email = fixture.nativeElement.querySelector('#register-email') as HTMLInputElement;
    email.value = 'seller@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.register-verify button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Email verification is unavailable because no verification service is configured.',
    );
  });

  it('validates matching passwords and does not create a session without an auth service', async () => {
    const values: Record<string, string> = {
      'register-first-name': 'Alex',
      'register-last-name': 'Seller',
      'register-email': 'seller@example.com',
      'register-mobile': '+1 555 555 0100',
      'register-password': 'password123',
      'register-confirm-password': 'password123',
    };

    for (const [id, value] of Object.entries(values)) {
      const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(
      'Registration is unavailable because no authentication service is configured.',
    );
  });

  it('rejects mismatched passwords', async () => {
    const values: Record<string, string> = {
      'register-first-name': 'Alex',
      'register-last-name': 'Seller',
      'register-email': 'seller@example.com',
      'register-mobile': '+1 555 555 0100',
      'register-password': 'password123',
      'register-confirm-password': 'different123',
    };

    for (const [id, value] of Object.entries(values)) {
      const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Passwords do not match.');
  });
});
