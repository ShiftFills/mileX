import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { Button } from '@shared/components/button/button';

@Component({
  selector: 'app-product-gallery',
  imports: [Button],
  templateUrl: './product-gallery.html',
  styleUrl: './product-gallery.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductGallery {
  readonly images = input.required<readonly string[]>();
  readonly name = input('');
  readonly wishlisted = input(false);
  /** Disables the heart (e.g. while the page's variants load, so it always has a variant to save). */
  // CHANGED (new)
  readonly wishlistDisabled = input(false);
  /** True while an image URL is still loading (e.g. a signed S3 URL); with no image, the placeholder shows it. */
  // CHANGED (new)
  readonly loading = input(false);
  readonly wishlistToggle = output<void>();
  /** An image (its URL) could not be displayed, so the page can fetch a fresh S3 URL for it. */
  // CHANGED (new)
  readonly imageError = output<string>();

  /** Image URLs that failed to load (e.g. a variant image missing on the server). */
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());

  /**
   * The images that can be shown: failed ones are skipped, so a missing variant image falls back
   * to the product image. With none left, the "no image" placeholder is shown.
   */
  // CHANGED (new): load-failure fallback for the Product View's variant images.
  // CHANGED: an empty list (no image, or every image failed) shows the placeholder instead of a broken image.
  protected readonly visibleImages = computed(() =>
    this.images().filter((image) => !this.failedImages().has(image)),
  );

  /** Resets to the first image whenever the image set changes (e.g. another product or variant). */
  // CHANGED: follows visibleImages (was images) so dropping a failed image shows the next one.
  protected readonly index = linkedSignal<readonly string[], number>({
    source: this.visibleImages,
    computation: () => 0,
  });

  protected step(delta: number): void {
    const count = this.visibleImages().length;
    if (count > 1) this.index.update((value) => (value + delta + count) % count);
  }

  protected select(index: number): void {
    this.index.set(index);
  }

  // CHANGED (new): called by the <img> (error) events.
  // CHANGED: also reports the failed URL to the page.
  protected markFailed(image: string): void {
    if (!this.failedImages().has(image)) {
      this.failedImages.update((failed) => new Set(failed).add(image));
      this.imageError.emit(image);
    }
  }
}
