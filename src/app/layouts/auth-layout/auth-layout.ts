import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Card } from '@shared/components/card/card';

/** Distraction-free shell for login/register: no header or footer. */
@Component({
  selector: 'app-auth-layout',
  imports: [Card, RouterOutlet, RouterLink],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {
  private readonly router = inject(Router);
  protected readonly isLogin = signal(false);
  protected readonly isRegister = signal(false);

  protected onActivate(): void {
    const segments =
      this.router.parseUrl(this.router.url).root.children['primary']?.segments ?? [];
    const page = segments[segments.length - 1]?.path;
    this.isLogin.set(page === 'login');
    this.isRegister.set(page === 'register');
  }
}
