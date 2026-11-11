import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, tap } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
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
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly routes = APP_ROUTES;
  protected readonly userName = signal('');
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  protected readonly attemptedSubmit = signal(false);
  protected readonly signInMessage = signal('');
  protected readonly isSubmitting = signal(false);

  protected updateUserName(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.userName.set(input.value);
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
    if (this.isSubmitting()) return;
    this.attemptedSubmit.set(true);
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !form.reportValidity()) return;

    this.isSubmitting.set(true);
    this.signInMessage.set('');
    this.auth.login(this.userName(), this.password()).pipe(
      tap(() => {
        const userType = this.auth.user()?.userType?.trim().toUpperCase();
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        const safeReturnUrl =
          returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : undefined;
        const destination =
          userType === 'ADMIN'
            ? this.routes.adminDashboard
            : userType === 'SELLER'
              ? this.routes.allProducts
              : safeReturnUrl ?? this.routes.home;
        void this.router.navigateByUrl(destination);
      }),
      catchError((error: unknown) => {
        this.signInMessage.set(this.auth.getLoginErrorMessage(error));
        return EMPTY;
      }),
      finalize(() => this.isSubmitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }
}
