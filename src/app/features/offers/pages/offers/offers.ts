import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { ProductCatalogService } from '@core/services/product-catalog.service';
import { ToastService } from '@core/services/toast.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { Pagination } from '@shared/components/pagination/pagination';
import { SearchBox } from '@shared/components/search-box/search-box';
import { Select } from '@shared/components/select/select';
import { Offer, OfferStatus } from '@shared/models';
import { eventValue } from '@shared/utils/form-events';
import { OfferService, isPercentageOffer, offerTypeLabel } from '../../services/offer.service';

const STATUS_TONES: Record<OfferStatus, BadgeTone> = {
  Active: 'success',
  Upcoming: 'info',
  Expired: 'neutral',
};
const COPIED_RESET_MS = 2000;

// CHANGED (new): offers come from offer_discount/get, so the card colours, image and paging live here.
/** Card colours, given in turn to the cards on screen. */
const THEMES = ['sunrise', 'rose', 'aqua', 'lavender', 'mint'] as const;
type OfferTheme = (typeof THEMES)[number];
/** Offers per page. */
const PAGE_SIZE = 5;
const STATUS_OPTIONS: readonly OfferStatus[] = ['Active', 'Upcoming', 'Expired'];
type OfferSort = 'featured' | 'ending' | 'newest' | 'name';
const SORT_OPTIONS: readonly { value: OfferSort; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'ending', label: 'Ending soonest' },
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Offer name (A–Z)' },
];

/** One offer card: the offer, plus what the card shows about it. */
interface OfferCard {
  offer: Offer;
  theme: OfferTheme;
  percentage: boolean;
  typeLabel: string;
  /** "On Electronics": its categories, else its products ('' when it names neither). */
  tagline: string;
  /** Applicable Products on the card: "Realme Narzo 70", or "Realme Narzo 70 + 1 more" (the arrow opens them all). */
  productSummary: string;
  categories: string;
}

function dateTime(date: string, missing: number): number {
  const time = Date.parse(date);
  return Number.isFinite(time) ? time : missing;
}

function sortOffers(offers: readonly Offer[], sort: OfferSort): readonly Offer[] {
  switch (sort) {
    case 'ending':
      // Expired offers go last; offers without an end date go after those that have one.
      return [...offers].sort((a, b) =>
        Number(a.status === 'Expired') - Number(b.status === 'Expired') ||
        dateTime(a.endDate, Infinity) - dateTime(b.endDate, Infinity),
      );
    case 'newest':
      return [...offers].sort((a, b) => dateTime(b.startDate, -Infinity) - dateTime(a.startDate, -Infinity));
    case 'name':
      return [...offers].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    default:
      return offers;
  }
}

function offerCard(offer: Offer, index: number): OfferCard {
  const names = (targets: readonly { name: string }[]): string => targets.map((target) => target.name).join(', ');
  const products = names(offer.products);
  const categories = names(offer.categories);
  const [firstProduct] = offer.products;
  return {
    offer,
    theme: THEMES[index % THEMES.length],
    percentage: isPercentageOffer(offer),
    typeLabel: offerTypeLabel(offer.offerType),
    tagline: categories || products ? `On ${categories || products}` : '',
    // CHANGED: the first product (and how many more); the card's arrow opens all of them as product cards.
    productSummary: firstProduct
      ? offer.products.length > 1 ? `${firstProduct.name} + ${offer.products.length - 1} more` : firstProduct.name
      : '',
    categories,
  };
}

@Component({
  selector: 'app-offers',
  // CHANGED: loading, error and empty states, search, filters, sort and paging (shared components).
  imports: [Alert, Badge, CurrencyPipe, DatePipe, DecimalPipe, LoadingSpinner, Pagination, RouterLink, SearchBox, Select],
  templateUrl: './offers.html',
  styleUrl: './offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Offers {
  protected readonly routes = APP_ROUTES;
  private readonly auth = inject(AuthService);
  private readonly offerService = inject(OfferService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  /** Id of the offer whose code was just copied (drives the "Copied" feedback). */
  protected readonly copiedId = signal<string | null>(null);
  private resetTimer?: ReturnType<typeof setTimeout>;

  // ---- Offers (offer_discount/get): signed-in customers only ----
  // CHANGED (new): the page lists offer_discount/get instead of demo offers. The API needs a customer's token, so a
  // guest (or a non-customer account) is asked to sign in as a customer instead.
  protected readonly isSignedIn = this.auth.isAuthenticated;
  protected readonly isCustomer = computed(() => this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER');
  protected readonly status = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly error = signal('');
  private readonly offers = signal<readonly Offer[]>([]);
  protected readonly offerCount = computed(() => this.offers().length);
  private request?: Subscription;

  // ---- Search, filters, sort and paging (over every offer loaded) ----
  protected readonly search = signal('');
  protected readonly typeFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly sortBy = signal<OfferSort>('featured');
  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly sortOptions = SORT_OPTIONS;
  /** The OFFER_TYPE values the offers use, e.g. "PERCENTAGE" shown as "Percentage". */
  protected readonly typeOptions = computed(() =>
    [...new Set(this.offers().map((offer) => offer.offerType).filter(Boolean))].map((value) => ({
      value,
      label: offerTypeLabel(value),
    })),
  );
  private readonly matchingOffers = computed(() => {
    const query = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    const status = this.statusFilter();
    const matches = this.offers().filter((offer) =>
      (!type || offer.offerType === type) &&
      (!status || offer.status === status) &&
      (!query || [
        offer.title,
        offer.code,
        offerTypeLabel(offer.offerType),
        ...offer.products.map((product) => product.name),
        ...offer.categories.map((category) => category.name),
      ].some((value) => value.toLowerCase().includes(query))),
    );
    return sortOffers(matches, this.sortBy());
  });
  protected readonly matchCount = computed(() => this.matchingOffers().length);
  protected readonly currentPage = computed(() =>
    Math.min(this.page(), Math.max(1, Math.ceil(this.matchCount() / PAGE_SIZE))),
  );
  protected readonly cards = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.matchingOffers()
      .slice(start, start + PAGE_SIZE)
      .map((offer, index) => offerCard(offer, index));
  });
  protected readonly hasFilters = computed(
    () => !!this.search().trim() || !!this.typeFilter() || !!this.statusFilter(),
  );

  constructor() {
    if (this.isCustomer()) this.load();
  }

  protected statusTone(status: OfferStatus): BadgeTone {
    return STATUS_TONES[status];
  }

  protected retry(): void {
    if (this.status() !== 'loading') this.load();
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected setType(event: Event): void {
    this.typeFilter.set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setStatus(event: Event): void {
    this.statusFilter.set(eventValue(event) ?? '');
    this.page.set(1);
  }

  protected setSort(event: Event): void {
    const value = eventValue(event);
    this.sortBy.set(SORT_OPTIONS.find((option) => option.value === value)?.value ?? 'featured');
    this.page.set(1);
  }

  protected setPage(page: number): void {
    this.page.set(page);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.typeFilter.set('');
    this.statusFilter.set('');
    this.page.set(1);
  }

  protected async copyCode(offer: Offer): Promise<void> {
    try {
      await navigator.clipboard.writeText(offer.code);
    } catch {
      return; // Clipboard blocked (insecure context / permissions): leave the code selectable.
    }
    this.copiedId.set(offer.id);
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.copiedId.set(null), COPIED_RESET_MS);
  }

  /** Reads every offer (one call per 50 rows); a failure shows the API's message with Try again. */
  private load(): void {
    this.request?.unsubscribe();
    this.status.set('loading');
    this.error.set('');
    this.request = this.offerService
      .loadOffers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offers) => {
          this.offers.set(offers);
          this.status.set('success');
        },
        error: (error: unknown) => {
          const message = this.catalog.getErrorMessage(error);
          this.error.set(message);
          this.status.set('error');
          this.toast.showError(message);
        },
      });
  }
}
