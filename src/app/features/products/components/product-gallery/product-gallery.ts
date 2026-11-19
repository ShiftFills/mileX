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
  readonly wishlistToggle = output<void>();

  /** Image URLs that failed to load (e.g. a variant image missing on the server). */
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());

  /**
   * The images that can be shown: failed ones are skipped, so a missing variant image falls back
   * to the product image. If every image failed, the original list is kept.
   */
  // CHANGED (new): load-failure fallback for the Product View's variant images.
  protected readonly visibleImages = computed(() => {
    const images = this.images();
    const loadable = images.filter((image) => !this.failedImages().has(image));
    return loadable.length ? loadable : images;
  });

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
  protected markFailed(image: string): void {
    if (!this.failedImages().has(image)) {
      this.failedImages.update((failed) => new Set(failed).add(image));
    }
  }
}
