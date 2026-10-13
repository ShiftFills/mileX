import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { SearchBox } from '@shared/components/search-box/search-box';

@Component({
  selector: 'app-storefront-header',
  imports: [RouterLink, RouterLinkActive, SearchBox],
  templateUrl: './storefront-header.html',
  styleUrl: './storefront-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontHeader {
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  private readonly router = inject(Router);
  protected readonly routes = APP_ROUTES;
  protected readonly searchTerm = signal('');
  protected readonly supportMenuOpen = signal(false);
  protected readonly accountMenuOpen = signal(false);
  protected readonly moreMenuOpen = signal(false);
  protected readonly moreMenuPosition = signal({ left: 0, top: 0 });
  private readonly moreTrigger = viewChild.required<ElementRef<HTMLButtonElement>>('moreTrigger');

  protected toggleAccountMenu(): void {
    this.accountMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  protected toggleSupportMenu(): void {
    this.supportMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeSupportMenu(): void {
    this.supportMenuOpen.set(false);
  }

  protected toggleMoreMenu(): void {
    if (!this.moreMenuOpen()) {
      const { left, bottom } = this.moreTrigger().nativeElement.getBoundingClientRect();
      const menuWidth = 11 * 16;
      this.moreMenuPosition.set({
        left: Math.min(left, Math.max(8, window.innerWidth - menuWidth - 8)),
        top: bottom + 4,
      });
    }
    this.moreMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeMoreMenu(): void {
    this.moreMenuOpen.set(false);
  }

  protected search(searchTerm: string): void {
    void this.router.navigate([this.routes.products], {
      queryParams: { q: searchTerm || null },
    });
  }
}
