import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { AuthService } from '@core/services/auth.service';
import { CartService } from '@core/services/cart.service';
import { ProductImageDisplayService } from '@core/services/product-image-display.service';
import { ToastService } from '@core/services/toast.service';
import { ProductVariant, ProductVariantService } from '@features/admin/services/product-variant.service';
import { ShoppingCartService } from '@features/cart/services/shopping-cart.service';
import { Alert } from '@shared/components/alert/alert';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Dialog } from '@shared/components/dialog/dialog';
import { Input } from '@shared/components/input/input';
import { LoadingSpinner } from '@shared/components/loading-spinner/loading-spinner';
import { ProductCard } from '@shared/components/product-card/product-card';
import { Product } from '@shared/models';
import { EMPTY, catchError, distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { ProductGallery } from '../../components/product-gallery/product-gallery';
import { ProductInfoNames, ProductInfoTabs } from '../../components/product-info-tabs/product-info-tabs';
import { ProductVariantDetails } from '../../components/product-variant-details/product-variant-details';
import { ProductVariantSelector, variantImageSource } from '../../components/product-variant-selector/product-variant-selector';
import { ProductService } from '../../services/product.service';
import { WishlistService } from '../../services/wishlist.service';

const PINCODE_PATTERN = /^[1-9]\d{5}$/;
const RELATED_COUNT = 4;
const CATEGORY_PREFIX = 'category-';

// CHANGED (new): state of the product_variant/get call (moved here from the info tabs, which no longer show variants).
type VariantLoadStatus = 'idle' | 'loading' | 'success' | 'error';

/** DISCOUNT, TAX and TOTAL_AMOUNT sent to shopping_cart/insert. */
interface CartAmounts {
  discount: number;
  tax: number;
  total: number;
}

@Component({
  selector: 'app-product-detail',
  imports: [Alert, Badge, Button, Card, CurrencyPipe, Dialog, Input, LoadingSpinner, ProductCard, ProductGallery, ProductInfoTabs, ProductVariantDetails, ProductVariantSelector, RouterLink],
  // CHANGED (new): product and variant images from S3 (signed URLs), shared with Home and All Products.
  providers: [ProductImageDisplayService],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetail {
  protected readonly routes = APP_ROUTES;
  protected readonly id = input.required<string>();
  protected readonly quantity = signal(1);
  protected readonly addedToCart = signal(false);
  /** True while the shopping_cart/insert request is in flight; blocks duplicate clicks. */
  protected readonly adding = signal(false);
  protected readonly selectedColor = signal<string | null>(null);
  protected readonly selectedSize = signal<string | null>(null);
  protected readonly pincode = signal('');
  protected readonly deliveryMessage = signal<{ ok: boolean; text: string } | null>(null);
  protected readonly sizeGuideOpen = signal(false);
  protected readonly selectionError = signal('');
  protected readonly sizeChart = [
    { size: 'S', bust: '34', waist: '28' },
    { size: 'M', bust: '36', waist: '30' },
    { size: 'L', bust: '38', waist: '32' },
    { size: 'XL', bust: '40', waist: '34' },
    { size: 'XXL', bust: '42', waist: '36' },
  ];

  protected readonly wishlist = inject(WishlistService);
  protected readonly cart = inject(CartService);
  private readonly shoppingCart = inject(ShoppingCartService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly variantService = inject(ProductVariantService);
  // CHANGED (new): each product's and variant's own image (signed S3 URL from its PRODUCT_IMAGE / VARIANT_IMAGE).
  protected readonly productImages = inject(ProductImageDisplayService);

  // CHANGED: the viewed product is loaded by its PRODUCT_ID (products/get?PRODUCT_ID=<id>). It used to be looked
  // up in the full catalog, which does not contain most products, so the page showed "Product not found".
  protected readonly productStatus = signal<'loading' | 'success' | 'error'>('loading');
  protected readonly productError = signal('');
  private readonly loadedProduct = signal<Product | null>(null);
  private readonly productRetry = signal(0);
  protected readonly product = this.loadedProduct.asReadonly();

  // CHANGED (new): product_variant/get state for the viewed product.
  protected readonly variantStatus = signal<VariantLoadStatus>('idle');
  protected readonly variantError = signal('');
  private readonly loadedVariants = signal<readonly ProductVariant[]>([]);
  private readonly variantRetry = signal(0);
  protected readonly selectedVariantId = signal<string | null>(null);
  /** Category name from the public category lookup, used when products/get sends no CATEGORY_NAME. */
  private readonly lookedUpCategory = signal('');

  /** Variants a customer can choose: only this product's (PRODUCT_ID) and only STATUS "ACTIVE". */
  // CHANGED (new)
  protected readonly variants = computed(() => {
    const productId = Number(this.id());
    return this.loadedVariants().filter(
      (variant) => variant.productId === productId && variant.status.trim().toUpperCase() === 'ACTIVE',
    );
  });
  protected readonly selectedVariant = computed(
    () => this.variants().find((variant) => variant.id === this.selectedVariantId()) ?? null,
  );

  // CHANGED (new): what the buy box shows. A selected variant supplies price and stock; otherwise the product does.
  protected readonly price = computed(() => this.selectedVariant()?.price ?? this.product()?.price ?? 0);
  protected readonly inStock = computed(() => {
    const variant = this.selectedVariant();
    return variant ? variant.stock > 0 : (this.product()?.inStock ?? false);
  });
  protected readonly stockLeft = computed(() => this.selectedVariant()?.stock ?? this.product()?.stockLeft);
  protected readonly lowStock = computed(() => {
    const left = this.stockLeft();
    return left !== undefined && left > 0 && left <= 5;
  });
  /** Add to Cart / Buy Now are off when out of stock, while adding, and while the variants load. */
  protected readonly cartBlocked = computed(
    () => !this.inStock() || this.adding() || this.variantStatus() === 'loading',
  );
  protected readonly productNames = computed<ProductInfoNames>(() => {
    const item = this.product();
    return {
      category: item?.categoryName ?? this.lookedUpCategory(),
      subCategory: item?.subCategoryName ?? '',
      brand: item?.brandName ?? '',
    };
  });

  /** The viewed product's own image (signed S3 URL, API image URL or legacy path), or null. */
  // CHANGED (new)
  protected readonly productImage = computed(() => {
    const item = this.product();
    return item ? this.productImages.src(item) : null;
  });
  /** Each variant's own image URL (signed S3 URL or legacy /uploads URL), by variant ID. */
  // CHANGED (new)
  protected readonly variantImageUrls = computed(() => {
    const urls = new Map<string, string>();
    for (const variant of this.variants()) {
      const src = this.productImages.src(variantImageSource(variant));
      if (src) urls.set(variant.id, src);
    }
    return urls;
  });
  /** Shown by a variant card without an image of its own: the product's image (stock image if it has none). */
  // CHANGED (new)
  protected readonly variantFallbackImage = computed(() => this.productImage() ?? this.product()?.imageUrl ?? '');

  // CHANGED: the selected variant's image comes first; the gallery skips it if it fails to load.
  // CHANGED: both come from S3 when stored there; a product without any image shows the gallery placeholder
  // (it used to show the catalog's stock image).
  protected readonly images = computed(() => {
    if (!this.product()) return [];
    const productImage = this.productImage();
    const productImages = productImage ? [productImage] : [];
    const variant = this.selectedVariant();
    const variantImage = variant ? this.variantImageUrls().get(variant.id) ?? '' : '';
    return variantImage && !productImages.includes(variantImage) ? [variantImage, ...productImages] : productImages;
  });
  /** True while the product's or the selected variant's S3 URL is loading. */
  // CHANGED (new)
  protected readonly imagesLoading = computed(() => {
    const item = this.product();
    const variant = this.selectedVariant();
    return !!item && (this.productImages.loading(item) || (!!variant && this.productImages.loading(variantImageSource(variant))));
  });
  protected readonly colorName = computed(() => this.selectedColor() ?? this.product()?.colors?.[0]?.name ?? '');
  // CHANGED: limited by the selected variant's stock when there is one.
  protected readonly maxQuantity = computed(() => {
    const item = this.product();
    return Math.max(1, Math.min(this.stockLeft() ?? 10, item?.maxOrderQuantity ?? 10));
  });
  // CHANGED: no struck-through price or "% OFF" while a variant is selected (the variant API has no MRP).
  protected readonly discountPercent = computed(() => {
    const item = this.product();
    return !this.selectedVariant() && item?.originalPrice && item.originalPrice > item.price
      ? Math.round((1 - item.price / item.originalPrice) * 100)
      : 0;
  });
  protected readonly related = computed<Product[]>(() => {
    const current = this.product();
    if (!current) return [];
    const others = this.productService.products().filter((item) => item.id !== current.id);
    const sameCategory = others.filter((item) => item.category === current.category);
    const rest = others.filter((item) => item.category !== current.category);
    return [...sameCategory, ...rest].slice(0, RELATED_COUNT);
  });

  constructor() {
    // The full catalog is still used for "You may also like" and to restore the saved cart.
    this.productService.load();
    // CHANGED (new): a signed-in customer's saved items fill their hearts (one shopping_cart/get per session).
    this.wishlist.sync();
    // The same component instance is reused when navigating between products (e.g. "You may also like").
    effect(() => {
      this.id();
      untracked(() => this.resetSelection());
    });
    // CHANGED (new): the "You may also like" products' images (keys with a valid URL make no request).
    effect(() => {
      const related = this.related();
      untracked(() => this.productImages.show(related));
    });

    // CHANGED (new): loads the viewed product by its PRODUCT_ID (again for another product, or on Try again).
    toObservable(computed(() => ({ id: this.id(), retry: this.productRetry() })))
      .pipe(
        switchMap(({ id }) => {
          this.loadedProduct.set(null);
          this.productError.set('');
          const productId = Number(id);
          if (!id.trim() || !Number.isSafeInteger(productId) || productId <= 0) {
            // Not a product ID: there is nothing to load, so the page shows "Product not found".
            this.productStatus.set('success');
            return EMPTY;
          }
          this.productStatus.set('loading');
          return this.productService.loadProduct(productId).pipe(
            tap((item) => {
              this.loadedProduct.set(item);
              // CHANGED (new): the product image's signed S3 URL (cached app-wide while valid).
              if (item) this.productImages.show([item]);
              this.productStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.productError.set(this.productService.getErrorMessage(error));
              this.productStatus.set('error');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // CHANGED (new): loads the viewed product's variants once per product (and again on Retry).
    toObservable(computed(() => ({ id: this.id(), retry: this.variantRetry() })))
      .pipe(
        switchMap(({ id }) => {
          this.loadedVariants.set([]);
          this.selectedVariantId.set(null);
          this.variantError.set('');
          this.variantStatus.set('loading');
          return this.variantService.loadProductVariants(Number(id)).pipe(
            tap((variants) => {
              this.loadedVariants.set(variants);
              // CHANGED (new): the variant images' signed S3 URLs (one request per distinct key).
              this.productImages.show(variants.map(variantImageSource));
              // Default: the first variant in stock, otherwise the first one.
              const choices = this.variants();
              this.selectedVariantId.set((choices.find((variant) => variant.stock > 0) ?? choices[0])?.id ?? null);
              this.variantStatus.set('success');
            }),
            catchError((error: unknown) => {
              this.variantError.set(this.variantService.getErrorMessage(error));
              this.variantStatus.set('error');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // CHANGED (new): category name from the public (cached) category lookup when products/get has no CATEGORY_NAME.
    toObservable(this.product)
      .pipe(
        map((item) =>
          item && !item.categoryName && item.category.startsWith(CATEGORY_PREFIX)
            ? item.category.slice(CATEGORY_PREFIX.length)
            : null,
        ),
        distinctUntilChanged(),
        switchMap((categoryId) =>
          categoryId === null
            ? of('')
            : this.productService.loadCategories().pipe(
                map((categories) => categories.find((category) => category.id === categoryId)?.label ?? ''),
                catchError(() => of('')),
              ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((name) => this.lookedUpCategory.set(name));
  }

  // CHANGED (new): a variant chip was clicked.
  protected selectVariant(variantId: string): void {
    this.selectedVariantId.set(variantId);
    this.addedToCart.set(false);
    this.quantity.update((value) => Math.min(value, this.maxQuantity()));
  }

  // CHANGED (new): Retry after the variants call failed.
  protected retryVariants(): void {
    this.variantRetry.update((count) => count + 1);
  }

  protected selectColor(name: string): void {
    this.selectedColor.set(name);
  }

  protected selectSize(size: string): void {
    this.selectedSize.set(size);
    this.selectionError.set('');
  }

  protected changeQuantity(step: number): void {
    this.quantity.update((value) => Math.min(this.maxQuantity(), Math.max(1, value + step)));
  }

  protected updateQuantity(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const value = Number(input.value);
    if (Number.isInteger(value) && value >= 1 && value <= this.maxQuantity()) {
      this.quantity.set(value);
    } else {
      input.value = String(this.quantity());
    }
  }

  // CHANGED: sends the selected variant (if any); blocked while out of stock or while variants load.
  protected addToCart(): void {
    const item = this.product();
    if (!item || this.cartBlocked() || !this.hasValidSelection(item)) return;
    this.submitToCart(item, this.quantity(), () => this.addedToCart.set(true), this.selectedVariant());
  }

  protected buyNow(): void {
    const item = this.product();
    if (!item || this.cartBlocked() || !this.hasValidSelection(item)) return;
    // Go to checkout only after the cart API has accepted the item.
    this.submitToCart(item, this.quantity(), () => {
      void this.router.navigateByUrl(this.routes.checkout);
    }, this.selectedVariant());
  }

  protected addRelatedToCart(id: string): void {
    const item = this.productService.findById(id);
    if (item) this.submitToCart(item, 1);
  }

  // CHANGED: retries the product request (and the catalog, if it failed).
  protected retryLoad(): void {
    this.productRetry.update((count) => count + 1);
    this.productService.load();
  }

  /** The gallery heart: the viewed product's cart row for the selected variant (null: the row without a variant). */
  // CHANGED: the wishlist API (wishlist/save_for_later with that row's CART_ID and VARIANT_ID).
  protected toggleWishlist(): void {
    const item = this.product();
    if (item) this.wishlist.toggleProduct(item, this.selectedVariantId());
  }

  /** A "You may also like" card's heart: that product's cart row. */
  // CHANGED (new): split from toggleWishlist, which only handles the viewed product now.
  protected toggleRelatedWishlist(item: Product): void {
    this.wishlist.toggleProduct(item);
  }

  /** A gallery image failed to display: its S3 URL gets one fresh URL (it may have expired), then it is dropped. */
  // CHANGED (new)
  protected galleryImageFailed(src: string): void {
    const item = this.product();
    const variant = this.selectedVariant();
    if (item && src === this.productImage()) this.productImages.failed(item, src);
    else if (variant && src === this.variantImageUrls().get(variant.id)) this.productImages.failed(variantImageSource(variant), src);
  }

  protected updatePincode(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement) {
      this.pincode.set(input.value.replace(/\D/g, '').slice(0, 6));
      this.deliveryMessage.set(null);
    }
  }

  protected checkDelivery(): void {
    this.deliveryMessage.set(
      PINCODE_PATTERN.test(this.pincode())
        ? { ok: true, text: `Delivery available to ${this.pincode()} in 3 - 5 days.` }
        : { ok: false, text: 'Enter a valid 6-digit pincode.' },
    );
  }

  private hasValidSelection(item: Product): boolean {
    if (item.sizes?.length && !this.selectedSize()) {
      this.selectionError.set('Please select a size.');
      return false;
    }
    return true;
  }

  /**
   * Sends the product to the customer's cart through POST shopping_cart/insert,
   * then refreshes the cart from shopping_cart/get. `onAdded` runs after a successful insert.
   * With a `variant`, its VARIANT_ID, PRICE and SELLER_ID (when present) are sent instead of the product's.
   */
  // CHANGED: optional selected variant.
  private submitToCart(
    item: Product,
    quantity: number,
    onAdded?: () => void,
    variant: ProductVariant | null = null,
  ): void {
    if (this.adding()) return;

    if (!this.auth.isAuthenticated()) {
      void this.router.navigate([this.routes.login], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (this.auth.customerId() === undefined) {
      this.toast.showError('Only customer accounts can add items to the cart.');
      return;
    }
    // CHANGED: the selected variant's seller, ID and price; the product's when no variant is selected.
    const sellerId = variant?.sellerId ?? item.sellerId;
    const variantId = variant ? Number(variant.id) : item.variantId;
    const unitPrice = variant ? variant.price : item.price;
    if (sellerId === undefined) {
      this.toast.showError('This product cannot be added to the cart right now. Seller details are missing.');
      return;
    }
    if (variantId === undefined || !Number.isSafeInteger(variantId)) {
      this.toast.showError('This product cannot be added to the cart right now. Variant details are missing.');
      return;
    }

    const amounts = this.cartAmounts(unitPrice, quantity);
    const itemName = variant ? `${item.name} (${variant.name})` : item.name;
    this.adding.set(true);
    this.shoppingCart
      .addItem({
        PRODUCT_ID: Number(item.id),
        SELLER_ID: sellerId,
        PRODUCT_VARIANT_ID: variantId,
        QUANTITY: quantity,
        UNIT_PRICE: unitPrice,
        DISCOUNT: amounts.discount,
        TAX: amounts.tax,
        TOTAL_AMOUNT: amounts.total,
      })
      .pipe(
        finalize(() => this.adding.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.showSuccess(`${itemName} added to your cart.`);
          this.refreshCart();
          onAdded?.();
        },
        error: (error: unknown) => this.toast.showError(this.errorMessage(error)),
      });
  }

  /**
   * TEMPORARY PLACEHOLDER: the discount, tax and total rules are NOT confirmed yet.
   * This is the only place that decides DISCOUNT, TAX and TOTAL_AMOUNT. It currently sends
   * 0 discount, 0 tax and unit price x quantity. Do not use these values for real orders
   * until the confirmed calculation replaces this method.
   */
  // CHANGED: takes the unit price (the selected variant's or the product's) instead of the product.
  private cartAmounts(unitPrice: number, quantity: number): CartAmounts {
    return { discount: 0, tax: 0, total: unitPrice * quantity };
  }

  /** Re-reads the customer's cart so the header count and the cart page show the new row. */
  private refreshCart(): void {
    const customerId = this.auth.customerId();
    if (customerId === undefined) return;
    this.shoppingCart
      .getCart(customerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this.cart.mergeFetchedItems(items),
        // The item was already added; a failed refresh is picked up when the cart page opens.
        error: () => undefined,
      });
  }

  private errorMessage(error: unknown): string {
    const fallback = 'The item could not be added to the cart. Please try again.';
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      if (typeof body === 'string' && body.trim()) {
        try {
          const parsed: unknown = JSON.parse(body);
          if (typeof parsed === 'object' && parsed !== null) {
            const record = parsed as Record<string, unknown>;
            const message = record['message'] ?? record['MESSAGE'];
            if (typeof message === 'string' && message.trim()) return message.trim();
          }
        } catch {
          return body.trim();
        }
      }
      return error.status ? `${fallback} (HTTP ${error.status})` : fallback;
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }

  private resetSelection(): void {
    this.quantity.set(1);
    this.addedToCart.set(false);
    this.selectedColor.set(null);
    this.selectedSize.set(null);
    this.pincode.set('');
    this.deliveryMessage.set(null);
    this.selectionError.set('');
  }
}