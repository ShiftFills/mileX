import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '@shared/components/button/button';
import { Input } from '@shared/components/input/input';

@Component({
  selector: 'app-login',
  imports: [Button, Input, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly attemptedSubmit = signal(false);
  protected readonly signInMessage = signal('');

  protected updateEmail(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.email.set(input.value);
      this.signInMessage.set('');
    }
  }

  protected updatePassword(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.password.set(input.value);
      this.signInMessage.set('');
    }
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }

  protected signIn(event: SubmitEvent): void {
    event.preventDefault();
    this.attemptedSubmit.set(true);
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;

    this.signInMessage.set('Sign-in is unavailable because no authentication service is configured.');
  }
}
