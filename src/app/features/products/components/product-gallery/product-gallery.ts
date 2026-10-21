import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
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

  /** Resets to the first image whenever the image set changes (e.g. another product). */
  protected readonly index = linkedSignal<readonly string[], number>({
    source: this.images,
    computation: () => 0,
  });

  protected step(delta: number): void {
    const count = this.images().length;
    if (count > 1) this.index.update((value) => (value + delta + count) % count);
  }

  protected select(index: number): void {
    this.index.set(index);
  }
}
