import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, mergeMap, of, tap } from 'rxjs';
import { productImageUrl } from '@shared/utils/product-image-url';
import { PRODUCT_FALLBACK_IMAGE } from './product-catalog.service';
import { S3ImageService } from './s3-image.service';

/** What a product (Product, or a table row built from one) knows about its image. */
export interface ProductImageSource {
  /** S3 key from PRODUCT_IMAGE ("<folder>/<file name>"). */
  imageKey?: string;
  /** PRODUCT_IMAGE when it is not an S3 key, e.g. a legacy "uploads/products/<file name>" path. */
  imagePath?: string;
  /** Image URL sent by the API; the catalog's stock image (PRODUCT_FALLBACK_IMAGE) counts as none. */
  imageUrl?: string;
}

/** Minimum time between two fresh signed URLs for the same image after it failed to display. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The image each product of one screen shows. Provide it in the component (`providers: [ProductImageDisplayService]`)
 * and call `show(products)` whenever products are loaded:
 * - An S3 key shows the signed `imageUrl` of `s3/images/<key>` (S3ImageService, cached app-wide until shortly
 *   before it expires, so other screens reuse it). One request per distinct key; an expired URL is never shown.
 * - A legacy PRODUCT_IMAGE path is shown through the existing /uploads route and never sent to the S3 API.
 * - `src()` is null while an S3 URL loads and when there is no usable image: the screen shows its placeholder.
 * - An image the browser cannot display gets one fresh signed URL (e.g. it expired), then the placeholder.
 */
// CHANGED (new): moved out of the All Products table so the Home page uses the same image handling.
@Injectable()
export class ProductImageDisplayService {
  private readonly s3Images = inject(S3ImageService);
  /** Signed URL per S3 key (null when it could not be loaded; no entry while loading). */
  private readonly urls = signal<ReadonlyMap<string, string | null>>(new Map());
  /** Image URLs the browser could not display. */
  private readonly failedSources = signal<ReadonlySet<string>>(new Set());
  private readonly refreshedAt = new Map<string, number>();
  private readonly requests = new Subject<{ key: string; refresh: boolean }>();

  constructor() {
    // mergeMap: several lists on one screen (e.g. Home sections) can be shown at the same time.
    this.requests
      .pipe(
        mergeMap(({ key, refresh }) =>
          this.s3Images.imageUrl(key, { refresh }).pipe(
            catchError(() => of(null)),
            tap((url) => this.urls.update((urls) => new Map(urls).set(key, url))),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Loads the URLs of these products' S3 images (keys with a valid URL make no request). */
  show(products: readonly ProductImageSource[]): void {
    const keys = [...new Set(products.flatMap((product) => product.imageKey ?? []))];
    const known = this.urls();
    const stale = keys.filter((key) => known.has(key) && !this.s3Images.hasFreshUrl(key));
    // An expired (or failed) URL is dropped first, so the product shows "loading" instead of it.
    if (stale.length) this.forget(stale);
    for (const key of keys) {
      if (!known.has(key) || stale.includes(key)) this.requests.next({ key, refresh: false });
    }
  }

  /** The image to show, or null for the placeholder. */
  src(product: ProductImageSource): string | null {
    const src = product.imageKey
      ? this.urls().get(product.imageKey) ?? null
      : product.imageUrl && product.imageUrl !== PRODUCT_FALLBACK_IMAGE
        ? product.imageUrl
        : productImageUrl(product.imagePath) ?? null;
    return src && !this.failedSources().has(src) ? src : null;
  }

  /** True while the product's S3 URL is loading. */
  loading(product: ProductImageSource): boolean {
    return !!product.imageKey && !this.urls().has(product.imageKey);
  }

  /** The browser could not display `src`: refresh an S3 URL once (per REFRESH_INTERVAL_MS), else the placeholder. */
  failed(product: ProductImageSource, src: string): void {
    this.failedSources.update((failed) => failed.has(src) ? failed : new Set(failed).add(src));
    const key = product.imageKey;
    if (!key || this.urls().get(key) !== src) return;
    const refreshedAt = this.refreshedAt.get(key);
    if (refreshedAt !== undefined && Date.now() - refreshedAt < REFRESH_INTERVAL_MS) return;
    this.refreshedAt.set(key, Date.now());
    this.forget([key]);
    this.requests.next({ key, refresh: true });
  }

  private forget(keys: readonly string[]): void {
    this.urls.update((urls) => {
      const next = new Map(urls);
      for (const key of keys) next.delete(key);
      return next;
    });
  }
}
