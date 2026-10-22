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
    const url = this.router.url;
    this.isLogin.set(url.endsWith('/login'));
    this.isRegister.set(url.endsWith('/register'));
  }
}
