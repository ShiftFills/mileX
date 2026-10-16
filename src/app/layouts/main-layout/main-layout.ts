import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/footer/footer';
import { StorefrontHeader } from '../components/storefront-header/storefront-header';

/** Default storefront shell: header + page content + footer. */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, StorefrontHeader, Footer],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayout {}
