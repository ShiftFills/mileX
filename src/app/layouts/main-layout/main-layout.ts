import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Footer } from '../components/footer/footer';
import { StorefrontHeader } from '../components/storefront-header/storefront-header';

/** Shared storefront shell: fixed header with a scrollable page and footer area. */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, StorefrontHeader, Footer],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayout {
}
