import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, catchError, finalize, map, tap } from 'rxjs';
import { APP_ROUTES, SELLER_LOGIN_QUERY } from '@core/constants/app-routes';
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
  /** True when opened from "Sell on MileX" (`/auth/login?audience=seller`). Display only. */
  protected readonly isSellerLogin = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('audience') === SELLER_LOGIN_QUERY.audience)),
    { initialValue: this.route.snapshot.queryParamMap.get('audience') === SELLER_LOGIN_QUERY.audience },
  );
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