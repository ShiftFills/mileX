import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { Register } from './register';

describe('Register', () => {
  let fixture: ComponentFixture<Register>;
  let registerCustomer: ReturnType<typeof vi.fn>;
  let getErrorMessage: ReturnType<typeof vi.fn>;
  let showSuccess: ReturnType<typeof vi.fn>;
  let showError: ReturnType<typeof vi.fn>;
  let router: Router;

  beforeEach(async () => {
    registerCustomer = vi.fn(() => of('Your account was created successfully.'));
    getErrorMessage = vi.fn((error: unknown) =>
      error instanceof Error ? error.message : 'Registration failed.',
    );
    showSuccess = vi.fn();
    showError = vi.fn();
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => null, registerCustomer, getErrorMessage } },
        { provide: ToastService, useValue: { showSuccess, showError } },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function fillForm(values: Record<string, string>): void {
    for (const [id, value] of Object.entries(values)) {
      const input = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();
  }

  function submitForm(): void {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  const validFields = {
    'register-first-name': 'John',
    'register-last-name': 'David',
    'register-email': 'john@gmail.com',
    'register-mobile': '8248557413',
    'register-username': 'john123',
    'register-password': 'John@123',
    'register-confirm-password': 'John@123',
  };

  it('renders all required registration fields', () => {
    expect(fixture.nativeElement.querySelectorAll('input[required]').length).toBe(7);
    expect(fixture.nativeElement.querySelector('#register-email').type).toBe('email');
    expect(fixture.nativeElement.querySelector('#register-mobile').type).toBe('tel');
  });

  it('posts the registration fields and navigates to login on success', () => {
    fillForm(validFields);
    submitForm();

    expect(registerCustomer).toHaveBeenCalledWith({
      FIRST_NAME: 'John',
      LAST_NAME: 'David',
      EMAIL: 'john@gmail.com',
      MOBILE_NUMBER: '8248557413',
      USER_NAME: 'john123',
      USER_PASSWORD: 'John@123',
      CONFIRM_PASSWORD: 'John@123',
      CREATED_BY: 1,
    });
    expect(showSuccess).toHaveBeenCalledWith('Your account was created successfully.');
    expect(showError).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    expect((fixture.nativeElement.querySelector('#register-first-name') as HTMLInputElement).value).toBe('');
  });

  it('uses the authenticated user ID as CREATED_BY when available', () => {
    const auth = TestBed.inject(AuthService) as unknown as { user: () => { id: string } | null };
    vi.spyOn(auth, 'user').mockReturnValue({ id: '18' });
    fillForm(validFields);
    submitForm();

    expect(registerCustomer).toHaveBeenCalledWith(expect.objectContaining({ CREATED_BY: 18 }));
  });

  it('shows field validation errors and does not call the API for invalid data', () => {
    fillForm({
      ...validFields,
      'register-email': 'not-an-email',
      'register-mobile': '12',
      'register-confirm-password': 'does-not-match',
    });
    submitForm();

    expect(registerCustomer).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Enter a valid email address.');
    expect(fixture.nativeElement.textContent).toContain('Enter a valid mobile number.');
    expect(fixture.nativeElement.textContent).toContain('Passwords do not match.');
  });

  it('marks empty required fields without sending a registration request', () => {
    submitForm();

    expect(registerCustomer).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('First name is required.');
    expect(fixture.nativeElement.textContent).toContain('Last name is required.');
    expect(fixture.nativeElement.textContent).toContain('Username is required.');
    expect(fixture.nativeElement.textContent).toContain('Password is required.');
  });

  it('shows backend errors through the toast without clearing the form or navigating', () => {
    const error = new Error('Email is already registered.');
    registerCustomer.mockReturnValue(throwError(() => error));
    fillForm(validFields);
    submitForm();

    expect(getErrorMessage).toHaveBeenCalledWith(error);
    expect(showError).toHaveBeenCalledWith(error.message);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect((fixture.nativeElement.querySelector('#register-first-name') as HTMLInputElement).value).toBe('John');
    expect(fixture.componentInstance['isSubmitting']()).toBe(false);
  });

  it('prevents duplicate submissions while the request is pending', () => {
    registerCustomer.mockReturnValue(new Observable<string>(() => undefined));
    fillForm(validFields);
    submitForm();
    submitForm();

    expect(registerCustomer).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance['isSubmitting']()).toBe(true);
    expect((fixture.nativeElement.querySelector('.register-submit button') as HTMLButtonElement).disabled).toBe(true);
  });
});
