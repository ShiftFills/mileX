import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@shared/components/button/button';
import { Input } from '@shared/components/input/input';

@Component({
  selector: 'app-register',
  imports: [Button, Input, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Register {
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly mobile = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly confirmPasswordVisible = signal(false);
  protected readonly attemptedSubmit = signal(false);
  protected readonly formMessage = signal('');
  protected readonly emailMessage = signal('');
  protected readonly mobileMessage = signal('');

  protected updateField(field: 'firstName' | 'lastName' | 'email' | 'mobile' | 'password' | 'confirmPassword', event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    this[field].set(input.value);
    this.formMessage.set('');
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
    this.attemptedSubmit.set(true);
    this.formMessage.set('');
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;

    if (!this.firstName().trim() || !this.lastName().trim()) {
      this.formMessage.set('Enter your first and last name.');
      return;
    }
    if (!this.isValidMobile(this.mobile())) {
      this.formMessage.set('Enter a valid mobile number.');
      return;
    }
    if (this.password().length < 8) {
      this.formMessage.set('Password must be at least 8 characters.');
      return;
    }
    if (this.password() !== this.confirmPassword()) {
      this.formMessage.set('Passwords do not match.');
      return;
    }

    this.formMessage.set('Registration is unavailable because no authentication service is configured.');
  }

  private isValidMobile(value: string): boolean {
    const digits = value.replace(/\D/g, '');
    return /^[+()\d\s-]+$/.test(value) && digits.length >= 7 && digits.length <= 15;
  }
}
