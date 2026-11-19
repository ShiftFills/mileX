import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ProductVariant } from '@features/admin/services/product-variant.service';
import { Badge } from '@shared/components/badge/badge';
import {
  variantImageUrl,
  variantOptionsLabel,
  variantStockStatus,
  variantText,
} from '../product-variant-selector/product-variant-selector';

/**
 * The selected variant's details on the Product View (below Add to Cart / Buy Now):
 * image, name, attribute values, price, stock, SKU, barcode, weight and seller ('-' for empty values).
 */
// CHANGED (new): its own component so its styles stay out of product-detail.scss (style budget).
@Component({
  selector: 'app-product-variant-details',
  imports: [Badge, CurrencyPipe],
  templateUrl: './product-variant-details.html',
  styleUrl: './product-variant-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariantDetails {
  readonly variant = input.required<ProductVariant>();
  /** Shown when the variant has no image or its image fails to load (the product image). */
  readonly fallbackImage = input('');

  /** The variant image URL that failed to load, if any. */
  private readonly failedImage = signal('');

  protected readonly image = computed(() => {
    const url = variantImageUrl(this.variant());
    return url && url !== this.failedImage() ? url : this.fallbackImage();
  });
  protected readonly options = computed(() => variantOptionsLabel(this.variant()));
  protected readonly stock = computed(() => variantStockStatus(this.variant().stock));
  protected readonly facts = computed(() => {
    const variant = this.variant();
    return [
      { label: 'SKU', value: variant.sku },
      { label: 'Barcode', value: variant.barcode },
      { label: 'Weight', value: variant.weight },
      { label: 'Sold by', value: variant.sellerName },
    ].map((fact) => ({ label: fact.label, value: variantText(fact.value) || '-' }));
  });

  protected useFallbackImage(): void {
    this.failedImage.set(variantImageUrl(this.variant()));
  }
}
