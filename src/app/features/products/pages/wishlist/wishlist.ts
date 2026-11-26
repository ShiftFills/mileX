import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { productCategoryLabel } from '@core/constants/product-categories';
import { AuthService } from '@core/services/auth.service';
import { PRODUCT_FALLBACK_IMAGE, ProductCatalogService } from '@core/services/product-catalog.service';
import { CartService } from '@core/services/cart.service';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { ToastService } from '@core/services/toast.service';
import { ProductVariant, ProductVariantService } from '@features/admin/services/product-variant.service';
import { ShoppingCartService } from '@features/cart/services/shopping-cart.service';
import { Alert } from '@shared/components/alert/alert';
import { Card } from '@shared/components/card/card';
import { Filter, FilterOption } from '@shared/components/filter/filter';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Pagination } from '@shared/components/pagination/pagination';
import { ProductCard } from '@shared/components/product-card/product-card';
import { Product, WishlistItem } from '@shared/models';
import { Observable, Subscription, catchError, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import {
  variantImageSource,
  variantOptionsLabel,
} from '../../components/product-variant-selector/product-variant-selector';
import { WishlistService } from '../../services/wishlist.service';

const ALL = 'all';
/** Wishlist items per wishlist/get request (LIMIT). */
const PAGE_SIZE = 10;
/** Units Move to Cart adds (as a product card's Add to Cart does). */
// CHANGED (new)
const MOVE_QUANTITY = 1;

type SavedStatus = 'idle' | 'loading' | 'success' | 'error';
type SavedAction = 'move' | 'remove';

/** One wishlist/get item (identified by PRODUCT_ID and PRODUCT_VARIANT_ID) and the product card shown for it. */
// CHANGED: a wishlist/get item (it was a move_to_cart/get row, identified by its CART_ID).
interface SavedItem {
  /** `PRODUCT_ID:PRODUCT_VARIANT_ID`: several variants of one product can be saved, each its own card. */
  key: string;
  item: WishlistItem;
  product: Product;
  details: string[];
  /** The SELLER_ID Move to Cart sends: the saved variant's, else the product's (as on the Product View). */
  sellerId?: number;
  /** Delisted (inactive product or variant): greyed out, no link to its page, cannot be moved to the cart. */
  unavailable: boolean;
}

interface SavedPage {
  page: number;
  items: SavedItem[];
  hasNext: boolean;
  total?: number;
}

/** The card shown with the variant's own image, when the variant has one. */
function withVariantImage(card: Product, variant: ProductVariant | null): Product {
  const image = variant ? variantImageSource(variant) : {};
  if (!image.imageKey && !image.imageUrl) return card;
  const withImage: Product = { ...card, imageUrl: image.imageUrl ?? PRODUCT_FALLBACK_IMAGE };
  delete withImage.imageKey;
  delete withImage.imagePath;
  if (image.imageKey) withImage.imageKey = image.imageKey;
  return withImage;
}

/**
 * The card of one wishlist item, from the wishlist/get row itself:
 * - Name, SKU, image, and prices priced like the product listing: SELLING_PRICE, then PRICE (MRP) struck through with
 *   its "% OFF" only when it is higher.
 * - Brand (from BRAND_ID) and the saved variant's name and options, image and stock from product_variant/get, when
 *   they could be loaded (without them, the card is shown from the row alone).
 * - Delisted (IS_ACTIVE "INACTIVE", or a variant whose STATUS is not ACTIVE): its prices greyed out, "no longer
 *   available", no link to its page, and no Move to Cart. Otherwise stock decides: zero stock is "Out of stock".
 */
// CHANGED: from the wishlist/get row (it combined a move_to_cart/get row with products/get and product_variant/get).
function savedItem(
  item: WishlistItem,
  variants: readonly ProductVariant[] | undefined,
  brands: ReadonlyMap<string, string>,
): SavedItem {
  const { product } = item;
  const variant =
    variants?.find((option) => option.id === String(item.variantId) && option.productId === item.productId) ?? null;
  const brand = product.brandName ?? (product.brand ? brands.get(product.brand) : undefined);
  const details = [
    ...(brand ? [`Brand: ${brand}`] : []),
    ...(variant ? [[variant.name, variantOptionsLabel(variant)].filter(Boolean).join(' · ')] : []),
    ...(product.sku ? [`SKU: ${product.sku}`] : []),
  ];
  const card = withVariantImage(product, variant);
  const sellerId = variant?.sellerId ?? product.sellerId;
  const entry = {
    key: `${item.productId}:${item.variantId}`,
    item,
    ...(sellerId !== undefined && sellerId !== null ? { sellerId } : {}),
  };
  const variantStatus = variant?.status.trim().toUpperCase() ?? '';
  const delisted = product.isActive === false || (variantStatus !== '' && variantStatus !== 'ACTIVE');
  if (delisted) {
    return {
      ...entry,
      product: { ...card, inStock: false },
      details: [
        ...details,
        product.isActive === false ? 'This product is no longer available.' : 'This variant is no longer available.',
      ],
      unavailable: true,
    };
  }
  const inStock = variant ? variant.stock > 0 : product.inStock;
  return {
    ...entry,
    product: { ...card, inStock },
    details: inStock ? details : [...details, 'Out of stock'],
    unavailable: false,
  };
}

@Component({
  selector: 'app-wishlist',
  imports: [Alert, Card, Filter, LoadingSpinner, NgTemplateOutlet, PageHeading, Pagination, ProductCard, RouterLink],
  templateUrl: './wishlist.html',
  styleUrl: './wishlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Each saved product shows its own image (signed S3 URL).
  providers: [ProductImageDisplayService],
})
export class Wishlist {
  protected readonly wishlist = inject(WishlistService);
  private readonly cart = inject(CartService);
  protected readonly catalog = inject(ProductCatalogService);
  private readonly auth = inject(AuthService);
  private readonly shoppingCart = inject(ShoppingCartService);
  private readonly variantService = inject(ProductVariantService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly productImages = inject(ProductImageDisplayService);
  protected readonly routes = APP_ROUTES;

  private readonly selectedCategory = signal(ALL);
  protected readonly notice = signal('');

  protected readonly filterOptions = computed<FilterOption[]>(() => {
    const products = this.wishlist.products();
    const counts = new Map<string, number>();
    for (const { category } of products) counts.set(category, (counts.get(category) ?? 0) + 1);
    return [
      { value: ALL, label: 'All', count: products.length },
      ...[...counts.keys()].sort().map((category) => ({
        value: category,
        label: productCategoryLabel(category),
        count: counts.get(category) ?? 0,
      })),
    ];
  });

  /** Falls back to "All" when the last item of the selected category is removed. */
  protected readonly activeCategory = computed(() => {
    const selected = this.selectedCategory();
    return this.filterOptions().some((option) => option.value === selected && option.count) ? selected : ALL;
  });

  /** Filtered products displayed in the responsive product grid. */
  protected readonly products = computed<Product[]>(() => {
    const category = this.activeCategory();
    const products = this.wishlist
      .products()
      .filter((product) => category === ALL || product.category === category);
    return products;
  });

  // ---- The account's wishlist (wishlist/get): signed-in customers ----
  // CHANGED: the wishlist APIs (wishlist/get, wishlist/manage) replace the saved-for-later cart rows
  // (move_to_cart/get, move_to_cart/update, shopping_cart/delete). Products saved on this device earlier are still
  // listed below it.
  protected readonly isCustomer = computed(
    () => this.auth.user()?.userType?.trim().toUpperCase() === 'CUSTOMER',
  );
  /** A customer session without a CUSTOMER_ID: retrying cannot help, the customer has to sign in again (as in the cart). */
  protected readonly needsSignIn = computed(() => this.isCustomer() && this.auth.customerId() === undefined);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly page = signal(1);
  protected readonly savedStatus = signal<SavedStatus>('idle');
  protected readonly savedError = signal('');
  protected readonly savedItems = signal<readonly SavedItem[]>([]);
  protected readonly hasNext = signal(false);
  protected readonly total = signal<number | undefined>(undefined);
  protected readonly showPagination = computed(() => this.page() > 1 || this.hasNext());
  /** The Remove / Move to Cart request in flight. One at a time, so two page refreshes never overwrite each other. */
  private readonly pending = signal<{ key: string; action: SavedAction } | null>(null);
  protected readonly busy = computed(() => this.pending() !== null);
  /** product_variant/get results by PRODUCT_ID while the page is open: paging back or refreshing requests none again. */
  // CHANGED: variants only (each wishlist/get row already carries its product's details, so no products/get).
  private readonly productVariants = new Map<number, readonly ProductVariant[]>();
  /** The last page there can be, learned when a page past the end came back empty. */
  private lastPage: number | null = null;
  private request?: Subscription;

  // The wishlist shows catalog products saved on this device, so it loads the catalog itself.
  constructor() {
    this.catalog.load();
    // A customer's wishlist, and the S3 image URLs of the products on screen (one request per distinct key; cached
    // URLs make none).
    if (this.isCustomer()) this.loadSaved();
    effect(() => {
      const products = this.savedItems().map((item) => item.product);
      untracked(() => this.productImages.show(products));
    });
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  protected remove(productId: string): void {
    this.wishlist.toggle(productId);
  }

  protected addToCart(product: Product): void {
    this.cart.add(product);
    this.notice.set(`${product.name} added to your cart`);
  }

  protected retryLoad(): void {
    this.catalog.load();
  }

  protected changePage(page: number): void {
    if (this.savedStatus() === 'loading' || this.busy() || page === this.page()) return;
    this.page.set(page);
    this.loadSaved();
  }

  /** "Sign in again" for a session without CUSTOMER_ID (returns to the wishlist), else "Try again". */
  protected retrySaved(): void {
    if (this.needsSignIn()) {
      this.auth.clearSession();
      void this.router.navigate([this.routes.login], { queryParams: { returnUrl: this.routes.wishlist } });
      return;
    }
    if (this.savedStatus() !== 'loading') this.loadSaved();
  }

  /** The card button that shows this item's request in flight (heart: Remove, Add to Cart: Move to Cart). */
  protected cardAction(item: SavedItem): 'wishlist' | 'add' | null {
    const pending = this.pending();
    if (pending?.key !== item.key) return null;
    return pending.action === 'move' ? 'add' : 'wishlist';
  }

  /** Remove (the filled heart): POST wishlist/manage with the item's PRODUCT_ID, PRODUCT_VARIANT_ID and "REMOVE". */
  // CHANGED: wishlist/manage (it was DELETE shopping_cart/delete with the saved row's IDs).
  protected removeSaved(entry: SavedItem): void {
    const { productId, variantId } = entry.item;
    this.runAction(entry, 'remove', () => this.wishlist.manage(productId, variantId, 'REMOVE'));
  }

  /**
   * Move to Cart: POST shopping_cart/insert with the item's PRODUCT_ID, PRODUCT_VARIANT_ID, its seller and the
   * selling price shown on the card (one unit, with the Product View's placeholder amounts: no discount or tax), then
   * POST wishlist/manage "REMOVE", so the item leaves the wishlist only once it is in the cart.
   */
  // CHANGED: shopping_cart/insert + wishlist/manage (move_to_cart/update needed a saved cart row's CART_ID, which a
  // wishlist item does not have).
  protected moveToCart(entry: SavedItem): void {
    if (!entry.product.inStock || entry.unavailable) return;
    const { productId, variantId } = entry.item;
    const sellerId = entry.sellerId;
    if (sellerId === undefined) {
      this.toast.showError(`${entry.product.name} cannot be moved to your cart right now. Seller details are missing.`);
      return;
    }
    const unitPrice = entry.product.price;
    let added = false;
    this.runAction(
      entry,
      'move',
      () =>
        this.shoppingCart
          .addItem({
            PRODUCT_ID: productId,
            SELLER_ID: sellerId,
            PRODUCT_VARIANT_ID: variantId,
            QUANTITY: MOVE_QUANTITY,
            UNIT_PRICE: unitPrice,
            DISCOUNT: 0,
            TAX: 0,
            TOTAL_AMOUNT: unitPrice * MOVE_QUANTITY,
          })
          .pipe(
            tap(() => (added = true)),
            switchMap(() => this.wishlist.manage(productId, variantId, 'REMOVE')),
          ),
      (message) => {
        if (!added) return message;
        // In the cart, but still saved: the header count and the cart page show the new row.
        this.refreshCart();
        return `${entry.product.name} was added to your cart, but is still in your wishlist. ${message}`;
      },
    );
  }

  /**
   * Sends one action (one at a time: the card shows a spinner and every card's buttons are disabled). Once the API
   * reports success the card leaves the screen, then the current page is read again to fill its place. A failed
   * request keeps the card and shows the API's message (`failureMessage` can reword it). Move to Cart also reads the
   * cart again, so the header count and the cart page show the change.
   */
  private runAction(
    entry: SavedItem,
    action: SavedAction,
    send: () => Observable<void>,
    failureMessage: (message: string) => string = (message) => message,
  ): void {
    if (this.pending()) return;
    const { key } = entry;
    const name = entry.product.name;
    this.pending.set({ key, action });
    send()
      .pipe(
        tap(() => {
          this.savedItems.update((items) => items.filter((item) => item.key !== key));
          this.toast.showSuccess(
            action === 'move' ? `${name} was moved to your cart.` : `${name} was removed from your wishlist.`,
          );
          if (action === 'move') this.refreshCart();
        }),
        // The action succeeded; a failed refresh only leaves the page as it is now.
        switchMap(() => this.fetchPage(this.page()).pipe(catchError(() => of(null)))),
        finalize(() => this.pending.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          if (result) this.applyPage(result);
        },
        error: (error: unknown) => this.toast.showError(failureMessage(this.catalog.getErrorMessage(error))),
      });
  }

  private loadSaved(): void {
    this.request?.unsubscribe();
    if (this.needsSignIn()) {
      this.showSavedError('A valid customer ID is unavailable. Sign in again to load your wishlist.');
      return;
    }
    this.savedStatus.set('loading');
    this.savedError.set('');
    this.request = this.fetchPage(this.page())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.applyPage(result),
        error: (error: unknown) => this.showSavedError(this.catalog.getErrorMessage(error)),
      });
  }

  private showSavedError(message: string): void {
    this.savedError.set(message);
    this.savedStatus.set('error');
    this.toast.showError(message);
  }

  private applyPage(result: SavedPage): void {
    if (!result.items.length && result.page > 1) {
      // Past the end (its last items were removed, or the page before ended exactly at LIMIT): show the page before.
      this.lastPage = result.page - 1;
      this.page.set(result.page - 1);
      this.loadSaved();
      return;
    }
    this.savedItems.set(result.items);
    this.hasNext.set(result.hasNext && (this.lastPage === null || result.page < this.lastPage));
    this.total.set(result.total);
    this.savedStatus.set('success');
  }

  /** One wishlist/get page (LIMIT / OFFSET) with the product card of each item. */
  // CHANGED: wishlist/get (WishlistService.loadPage) replaces move_to_cart/get.
  private fetchPage(page: number): Observable<SavedPage> {
    return this.wishlist.loadPage(PAGE_SIZE, (page - 1) * PAGE_SIZE).pipe(
      switchMap(({ items, hasNext, total }) =>
        this.loadVariantDetails(items).pipe(
          map((brands) => ({
            page,
            items: items.map((item) => savedItem(item, this.productVariants.get(item.productId), brands)),
            hasNext,
            ...(total !== undefined ? { total } : {}),
          })),
        ),
      ),
    );
  }

  /**
   * The details a wishlist/get row does not carry: the brand names (cached app-wide) and, for each PRODUCT_ID not seen
   * yet, product_variant/get?PRODUCT_ID=<id>&VARIANT_ID=-1 (the saved variant's name, options, image, seller and
   * stock). A product whose variants fail is shown from its row and requested again next time.
   */
  // CHANGED: no products/get per product any more (the wishlist/get row has the product's name, image and prices).
  private loadVariantDetails(items: readonly WishlistItem[]): Observable<ReadonlyMap<string, string>> {
    if (!items.length) return of(new Map<string, string>());
    const brands$ = this.catalog.loadAllBrands().pipe(
      map((brands) => new Map(brands.map((brand) => [`brand-${brand.id}`, brand.label] as const))),
      catchError(() => of(new Map<string, string>())),
    );
    const missing = [...new Set(items.map((item) => item.productId))].filter((id) => !this.productVariants.has(id));
    if (!missing.length) return brands$;

    return forkJoin({
      brands: brands$,
      variants: forkJoin(
        missing.map((id) =>
          this.variantService.loadProductVariants(id).pipe(
            tap((variants) => this.productVariants.set(id, variants)),
            catchError(() => of(null)),
          ),
        ),
      ),
    }).pipe(map(({ brands }) => brands));
  }

  /** Reads the customer's cart again, so the header count and the cart page show the change. */
  private refreshCart(): void {
    const customerId = this.auth.customerId();
    if (customerId === undefined) return;
    this.shoppingCart
      .getCart(customerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.cart.mergeFetchedItems(items),
        // The wishlist action already succeeded; the cart page reads the cart again when it opens.
        error: () => undefined,
      });
  }
}
