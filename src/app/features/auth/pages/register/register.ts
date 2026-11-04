import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService, CustomerRegistrationPayload } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import { Button } from '@shared/components/button/button';
import { Input } from '@shared/components/input/input';

type RegistrationField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'mobile'
  | 'userName'
  | 'password'
  | 'confirmPassword';

@Component({
  selector: 'app-register',
  imports: [Button, Input, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly routes = APP_ROUTES;
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly mobile = signal('');
  protected readonly userName = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly confirmPasswordVisible = signal(false);
  protected readonly attemptedSubmit = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly fieldErrors = signal<Partial<Record<RegistrationField, string>>>({});
  protected readonly emailMessage = signal('');
  protected readonly mobileMessage = signal('');

  protected updateField(field: RegistrationField, event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    this[field].set(input.value);
    if (this.attemptedSubmit()) this.validateFields();
    else this.clearFieldError(field);
    if (field === 'email') this.emailMessage.set('');
    if (field === 'mobile') this.mobileMessage.set('');
  }

  protected togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.passwordVisible.update((visible) => !visible);
    } else {
      this.confirmPasswordVisible.update((visible) => !visible);
    }
  }

  protected verifyEmail(): void {
    this.emailMessage.set(
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email())
        ? 'Email verification is unavailable because no verification service is configured.'
        : 'Enter a valid email address before requesting verification.',
    );
  }

  protected verifyMobile(): void {
    this.mobileMessage.set(
      this.isValidMobile(this.mobile())
        ? 'Mobile verification is unavailable because no verification service is configured.'
        : 'Enter a valid mobile number before requesting verification.',
    );
  }

  protected register(event: SubmitEvent): void {
    event.preventDefault();
    if (this.isSubmitting()) return;
    this.attemptedSubmit.set(true);
    this.validateFields();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !form.checkValidity() || Object.keys(this.fieldErrors()).length) return;

    const userId = Number(this.auth.user()?.id);
    const payload: CustomerRegistrationPayload = {
      FIRST_NAME: this.firstName().trim(),
      LAST_NAME: this.lastName().trim(),
      EMAIL: this.email().trim(),
      MOBILE_NUMBER: this.mobile().trim(),
      USER_NAME: this.userName().trim(),
      USER_PASSWORD: this.password(),
      CONFIRM_PASSWORD: this.confirmPassword(),
      CREATED_BY: Number.isSafeInteger(userId) && userId > 0 ? userId : 1,
    };

    this.isSubmitting.set(true);
    this.auth.registerCustomer(payload).pipe(
      tap((message) => {
        this.toast.showSuccess(message);
        this.resetForm();
        void this.router.navigate([this.routes.login]);
      }),
      catchError((error: unknown) => {
        this.toast.showError(this.auth.getErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }

  protected errorFor(field: RegistrationField): string {
    return this.fieldErrors()[field] ?? '';
  }

  private validateFields(): void {
    const errors: Partial<Record<RegistrationField, string>> = {};
    if (!this.firstName().trim()) errors.firstName = 'First name is required.';
    if (!this.lastName().trim()) errors.lastName = 'Last name is required.';
    if (!this.email().trim()) errors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim())) errors.email = 'Enter a valid email address.';
    if (!this.mobile().trim()) errors.mobile = 'Mobile number is required.';
    else if (!this.isValidMobile(this.mobile())) errors.mobile = 'Enter a valid mobile number.';
    if (!this.userName().trim()) errors.userName = 'Username is required.';
    if (!this.password()) errors.password = 'Password is required.';
    else if (this.password().length < 8) errors.password = 'Password must be at least 8 characters.';
    if (!this.confirmPassword()) errors.confirmPassword = 'Confirm your password.';
    else if (this.password() !== this.confirmPassword()) errors.confirmPassword = 'Passwords do not match.';
    this.fieldErrors.set(errors);
  }

  private clearFieldError(field: RegistrationField): void {
    this.fieldErrors.update((errors) => {
      const { [field]: _removed, ...remaining } = errors;
      return remaining;
    });
  }

  private resetForm(): void {
    this.firstName.set('');
    this.lastName.set('');
    this.email.set('');
    this.mobile.set('');
    this.userName.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.attemptedSubmit.set(false);
    this.fieldErrors.set({});
  }

  private isValidMobile(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    return /^[+()\d\s-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
  }
}
