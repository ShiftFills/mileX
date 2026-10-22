import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { SearchBox } from '@shared/components/search-box/search-box';
import { ClickOutside } from '@shared/directives/click-outside';

interface AccountLink {
  label: string;
  route: string;
  /** SVG path data on a 24x24 grid (stroke icon). */
  icon: string;
}

@Component({
  selector: 'app-storefront-header',
  imports: [ClickOutside, RouterLink, RouterLinkActive, SearchBox],
  templateUrl: './storefront-header.html',
  styleUrl: './storefront-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorefrontHeader {
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  private readonly router = inject(Router);
  protected readonly routes = APP_ROUTES;
  protected readonly accountLinks: readonly AccountLink[] = [
    { label: 'My Orders', route: APP_ROUTES.orders, icon: 'M3 4h18v4H3zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4' },
    { label: 'My Addresses', route: APP_ROUTES.addresses, icon: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z' },
    { label: 'Offers / Discounts', route: APP_ROUTES.offers, icon: 'M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4ZM7.5 7.5h.01' },
    { label: 'My Account', route: APP_ROUTES.account, icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0' },
    { label: 'Help & Support', route: APP_ROUTES.support, icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01' },
  ];
  protected readonly logoutIcon = 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9';
  protected readonly userName = computed(() => {
    const user = this.auth.user();
    return user ? `${user.firstName} ${user.lastName}`.trim() : '';
  });
  protected readonly searchTerm = signal('');
  protected readonly supportMenuOpen = signal(false);
  protected readonly accountMenuOpen = signal(false);
  protected readonly moreMenuOpen = signal(false);
  protected readonly mobileCategoriesOpen = signal(false);
  protected readonly moreMenuPosition = signal({ left: 0, top: 0 });
  private readonly moreTrigger = viewChild.required<ElementRef<HTMLButtonElement>>('moreTrigger');

  protected toggleAccountMenu(): void {
    this.accountMenuOpen.update((isOpen) => !isOpen);
  }

  protected closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  protected logout(): void {
    this.auth.clearSession();
    this.closeAccountMenu();
    void this.router.navigateByUrl(this.routes.home);
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

  protected toggleMobileCategories(): void {
    this.mobileCategoriesOpen.update((isOpen) => !isOpen);
  }

  protected closeMobileCategories(): void {
    this.mobileCategoriesOpen.set(false);
  }

  protected search(searchTerm: string): void {
    void this.router.navigate([this.routes.products], {
      queryParams: { q: searchTerm || null },
    });
  }
}
