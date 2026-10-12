import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Card } from '@shared/components/card/card';

/** Distraction-free shell for login/register: no header or footer. */
@Component({
  selector: 'app-auth-layout',
  imports: [Card, RouterOutlet, RouterLink],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayout {}
