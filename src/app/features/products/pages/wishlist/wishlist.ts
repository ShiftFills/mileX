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
import {
  ListingPrice,
  PRODUCT_FALLBACK_IMAGE,
  ProductCatalogService,
  ProductOffer,
} from '@core/services/product-catalog.service';
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
import { Product, WishlistRow } from '@shared/models';
import { Observable, Subscription, catchError, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import {
  variantImageSource,
  variantOptionsLabel,
} from '../../components/product-variant-selector/product-variant-selector';
import { WishlistService } from '../../services/wishlist.service';

const ALL = 'all';
/** Wishlist rows per move_to_cart/get request (LIMIT). */
// CHANGED (new)
const PAGE_SIZE = 10;

// CHANGED (new)
type SavedStatus = 'idle' | 'loading' | 'success' | 'error';
type SavedAction = 'move' | 'remove';

/**
 * What the product APIs returned for one PRODUCT_ID: products/get (the product, active or not, with its VARIANTS
 * prices; null when the API returns no such product) and product_variant/get (variant details, image and stock).
 */
// CHANGED (new)
// CHANGED: `offer` (loadProductOffer) replaces `product` (loadProduct), so inactive products keep their prices.
interface ProductEntry {
  offer: ProductOffer | null;
  variants: readonly ProductVariant[];
}

/** One move_to_cart/get row (identified by its CART_ID) and the product card shown for it. */
// CHANGED (new)
interface SavedItem {
  row: WishlistRow;
  product: Product;
  details: string[];
  /** Delisted (inactive product or variant): greyed out, no link to its page, cannot be moved to the cart. */
  // CHANGED (new)
  unavailable: boolean;
}

// CHANGED (new)
interface SavedPage {
  page: number;
  items: SavedItem[];
  hasNext: boolean;
  total?: number;
}

/**
 * The product card with these listing prices: the selling price, and the struck MRP with its "% OFF" only when the
 * prices have them (the product's own are replaced, e.g. by its variant's).
 */
// CHANGED (new)
function withListingPrice(product: Product, pricing: ListingPrice): Product {
  const card: Product = { ...product, price: pricing.price };
  delete card.originalPrice;
  delete card.discountLabel;
  if (pricing.originalPrice !== undefined && pricing.discountLabel !== undefined) {
    card.originalPrice = pricing.originalPrice;
    card.discountLabel = pricing.discountLabel;
  }
  return card;
}

/** The card shown with the variant's own image, when the variant has one. */
// CHANGED (new)
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
 * The card of a row without product data (products/get returned no row, or failed): the wishlist record itself,
 * with its PRODUCT_NAME and stored UNIT_PRICE (no MRP or badge). Missing product data says nothing about stock, so
 * the item is not reported as unavailable and can still be moved to the cart (the cart shows its stock).
 */
// CHANGED (new)
// CHANGED: no longer "Product unavailable" / out of stock: only stock data can make an item unavailable.
function rowOnlyProduct(row: WishlistRow): Product {
  return {
    id: String(row.productId),
    name: row.productName ?? `Product #${row.productId}`,
    description: '',
    price: row.unitPrice,
    currency: 'INR',
    imageUrl: PRODUCT_FALLBACK_IMAGE,
    category: 'uncategorized',
    inStock: true,
  };
}

/**
 * The card of one wishlist row (its CART_ID is the record; several rows can share a PRODUCT_ID), priced like the
 * product listing with the product's current prices:
 * - Name: the row's PRODUCT_NAME (else the product's).
 * - Prices: the products/get VARIANTS entry with the row's PRODUCT_VARIANT_ID, else the product's own. SELLING_PRICE,
 *   then PRICE (MRP) struck through with its "% OFF" only when it is higher (the listing's rule). The row's UNIT_PRICE
 *   is shown only without product data, and its DISCOUNT is not used.
 * - Image, brand and variant details: products/get and product_variant/get, as on the Product View.
 * - Delisted (products/get IS_ACTIVE "INACTIVE", or a variant whose STATUS is not ACTIVE): its prices greyed out,
 *   "no longer available", no link to its page, and no Move to Cart. Otherwise stock decides: zero stock is
 *   "Out of stock". A row without product data is never reported as unavailable (see rowOnlyProduct).
 */
// CHANGED (new)
// CHANGED: inactive products are delisted across the storefront (STATUS=ACTIVE), so they show as no longer available.
function savedItem(
  row: WishlistRow,
  entry: ProductEntry | undefined,
  brands: ReadonlyMap<string, string>,
): SavedItem {
  const offer = entry?.offer ?? null;
  if (!offer) {
    return {
      row,
      product: rowOnlyProduct(row),
      details: [`Qty: ${row.quantity}`, ...(entry ? [] : ['Product details could not be loaded.'])],
      unavailable: false,
    };
  }

  const { product, variantPrices } = offer;
  // A row saved without a variant is shown from the product itself.
  const variantPrice =
    row.variantId === undefined ? undefined : variantPrices.find((price) => price.variantId === String(row.variantId));
  const variant =
    row.variantId === undefined
      ? null
      : (entry?.variants.find((option) => option.id === String(row.variantId) && option.productId === row.productId) ??
        null);
  const brand = product.brandName ?? (product.brand ? brands.get(product.brand) : undefined);
  const details = [
    ...(brand ? [`Brand: ${brand}`] : []),
    ...(variant ? [[variant.name, variantOptionsLabel(variant)].filter(Boolean).join(' · ')] : []),
    `Qty: ${row.quantity}`,
  ];
  const card = withVariantImage(
    withListingPrice({ ...product, name: row.productName ?? product.name }, variantPrice ?? product),
    variant,
  );
  const variantStatus = variant?.status.trim().toUpperCase() ?? '';
  const delisted = product.isActive === false || (variantStatus !== '' && variantStatus !== 'ACTIVE');
  if (delisted) {
    return {
      row,
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
    row,
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
  // CHANGED (new): each saved product shows its own image (signed S3 URL).
  providers: [ProductImageDisplayService],
})
export class Wishlist {
  protected readonly wishlist = inject(WishlistService);
  private readonly cart = inject(CartService);
  protected readonly catalog = inject(ProductCatalogService);
  // CHANGED (new)
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

  // ---- Saved for later (move_to_cart/get): signed-in customers ----
  // CHANGED (new): a customer's wishlist is their cart rows saved for later. Products saved with the heart icon
  // (on this device only; there is no API for them) are still listed below it.
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
  private readonly pending = signal<{ cartId: string; action: SavedAction } | null>(null);
  protected readonly busy = computed(() => this.pending() !== null);
  /** Product API results by PRODUCT_ID while the page is open: paging back or refreshing requests no product again. */
  private readonly productEntries = new Map<number, ProductEntry>();
  /** The last page there can be, learned when a page past the end came back empty. */
  private lastPage: number | null = null;
  private request?: Subscription;

  // CHANGED (new): the wishlist shows catalog products, so it loads the catalog itself
  // (CartService no longer loads it on every page).
  constructor() {
    this.catalog.load();
    // CHANGED (new): a customer's saved items, and the S3 image URLs of the products on screen (one request per
    // distinct key; cached URLs make none).
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

  // CHANGED (new)
  protected changePage(page: number): void {
    if (this.savedStatus() === 'loading' || this.busy() || page === this.page()) return;
    this.page.set(page);
    this.loadSaved();
  }

  // CHANGED (new): "Sign in again" for a session without CUSTOMER_ID (returns to the wishlist), else "Try again".
  protected retrySaved(): void {
    if (this.needsSignIn()) {
      this.auth.clearSession();
      void this.router.navigate([this.routes.login], { queryParams: { returnUrl: this.routes.wishlist } });
      return;
    }
    if (this.savedStatus() !== 'loading') this.loadSaved();
  }

  /** The card button that shows this row's request in flight (heart: Remove, Add to Cart: Move to Cart). */
  // CHANGED (new)
  protected cardAction(item: SavedItem): 'wishlist' | 'add' | null {
    const pending = this.pending();
    if (pending?.cartId !== item.row.cartId) return null;
    return pending.action === 'move' ? 'add' : 'wishlist';
  }

  /** Remove: DELETE shopping_cart/delete with the row's CART_ID, PRODUCT_ID, SELLER_ID, CUSTOMER_ID and variant. */
  // CHANGED (new)
  protected removeSaved(item: SavedItem): void {
    this.runAction(item, 'remove', () => this.shoppingCart.removeSavedItem(item.row));
  }

  /** Move to Cart: PUT move_to_cart/update with the row's CART_ID. */
  // CHANGED (new)
  // CHANGED: PUT move_to_cart/update (it used to insert into the cart, then delete the saved row).
  protected moveToCart(item: SavedItem): void {
    if (!item.product.inStock) return;
    this.runAction(item, 'move', () => this.shoppingCart.moveToCart(item.row.cartId));
  }

  /**
   * Sends one action (one at a time: the card shows a spinner and every card's buttons are disabled), then reads the
   * current page again. Success is reported only when the row is gone from move_to_cart/get, so a backend that
   * accepted the request without changing the row is reported as a failure; a failed request keeps the row. The
   * cart is read again as well, so the header count and the cart page show the change.
   */
  private runAction(item: SavedItem, action: SavedAction, send: () => Observable<void>): void {
    if (this.pending()) return;
    const { cartId } = item.row;
    const name = item.product.name;
    this.pending.set({ cartId, action });
    send()
      .pipe(
        // The action succeeded; a failed refresh only means the list is read again below.
        switchMap(() => this.fetchPage(this.page()).pipe(catchError(() => of(null)))),
        finalize(() => this.pending.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.refreshCart();
          if (result?.items.some((entry) => entry.row.cartId === cartId)) {
            this.toast.showError(
              action === 'move'
                ? `${name} is still in your wishlist. It could not be moved to your cart.`
                : `${name} is still in your wishlist. It could not be removed.`,
            );
          } else {
            this.toast.showSuccess(
              action === 'move' ? `${name} was moved to your cart.` : `${name} was removed from your wishlist.`,
            );
          }
          if (result) this.applyPage(result);
          else this.loadSaved();
        },
        error: (error: unknown) => this.toast.showError(this.catalog.getErrorMessage(error)),
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

  /** One move_to_cart/get page (LIMIT / OFFSET) with the product card of each row. */
  private fetchPage(page: number): Observable<SavedPage> {
    return this.shoppingCart.getWishlist(PAGE_SIZE, (page - 1) * PAGE_SIZE).pipe(
      switchMap(({ rows, hasNext, total }) =>
        this.loadProductEntries(rows).pipe(
          map((brands) => ({
            page,
            items: rows.map((row) => savedItem(row, this.productEntries.get(row.productId), brands)),
            hasNext,
            ...(total !== undefined ? { total } : {}),
          })),
        ),
      ),
    );
  }

  /**
   * Loads each PRODUCT_ID not seen yet: products/get?PRODUCT_ID=<id> (image, prices with its VARIANTS prices, stock,
   * brand; inactive products included) and product_variant/get?PRODUCT_ID=<id>&VARIANT_ID=-1 (the details and image
   * of the row's PRODUCT_VARIANT_ID), plus the brand names (cached app-wide). A product that fails is shown from its
   * row and requested again next time.
   */
  private loadProductEntries(rows: readonly WishlistRow[]): Observable<ReadonlyMap<string, string>> {
    if (!rows.length) return of(new Map<string, string>());
    const brands$ = this.catalog.loadAllBrands().pipe(
      map((brands) => new Map(brands.map((brand) => [`brand-${brand.id}`, brand.label] as const))),
      catchError(() => of(new Map<string, string>())),
    );
    const missing = [...new Set(rows.map((row) => row.productId))].filter((id) => !this.productEntries.has(id));
    if (!missing.length) return brands$;

    let failed = false;
    return forkJoin({
      brands: brands$,
      entries: forkJoin(
        missing.map((id) =>
          forkJoin({
            offer: this.catalog.loadProductOffer(id),
            variants: this.variantService.loadProductVariants(id),
          }).pipe(
            tap((entry) => this.productEntries.set(id, entry)),
            catchError(() => {
              failed = true;
              return of(null);
            }),
          ),
        ),
      ),
    }).pipe(
      map(({ brands }) => {
        if (failed) this.toast.showError('Some product details could not be loaded. Please try again later.');
        return brands;
      }),
    );
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
