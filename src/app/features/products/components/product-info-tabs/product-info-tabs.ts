import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { ProductVariant } from '@features/admin/services/product-variant.service';
import { Product } from '@shared/models';

// CHANGED: added the 'variants' tab.
type InfoTab = 'details' | 'specifications' |  'reviews';

// CHANGED (new): the product names the Product View passes in.
export interface ProductInfoNames {
  category: string;
  subCategory: string;
  brand: string;
}

/** The selected variant as shown in the Specifications tab ('-' for empty values). */
interface VariantRow {
  name: string;
  sku: string;
  barcode: string;
  size: string;
  colour: string;
  material: string;
  weight: string;
  price: number;
  stock: string;

}

const EMPTY_VALUE = '-';

/** '-' for null, empty or the variant reader's '—' placeholder. */
function shown(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  return text && text !== '—' ? text : EMPTY_VALUE;
}

function toVariantRow(variant: ProductVariant): VariantRow {
  const status = variant.status.trim().toLowerCase();
  return {
    name: shown(variant.name),
    sku: shown(variant.sku),
    barcode: shown(variant.barcode),
    // The *_NAME fields are the labels; SIZE / COLOR / MATERIAL may be IDs.
    size: shown(variant.sizeName),
    colour: shown(variant.colorName),
    material: shown(variant.materialName),
    weight: shown(variant.weight),
    price: variant.price,
    stock: variant.stock > 0 ? String(variant.stock) : 'Out of stock',
   
  };
}

@Component({
  selector: 'app-product-info-tabs',
  imports: [CurrencyPipe],
  templateUrl: './product-info-tabs.html',
  styleUrl: './product-info-tabs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductInfoTabs {
  readonly product = input.required<Product>();
  // CHANGED (new): product names and the selected variant (variants are chosen in the buy box).
  readonly names = input<ProductInfoNames>({ category: '', subCategory: '', brand: '' });
  readonly selectedVariant = input<ProductVariant | null>(null);

  // CHANGED: Variants sits between Specifications and Reviews.
  protected readonly tabs: readonly { id: InfoTab; label: string }[] = [
    { id: 'details', label: 'Product Details' },
    { id: 'specifications', label: 'Specifications' },
    // { id: 'variants', label: 'Variants' },
    { id: 'reviews', label: 'Reviews' },
  ];

  protected readonly activeTab = linkedSignal<Product, InfoTab>({
    source: this.product,
    computation: () => 'details',
  });

  // CHANGED (new): fixed product facts at the top of Specifications (the Product ID is not shown).
  protected readonly productFacts = computed(() => [
    { label: 'Category', value: shown(this.names().category) },
    { label: 'Subcategory', value: shown(this.names().subCategory) },
    { label: 'Brand', value: shown(this.names().brand) },
  ]);

  protected readonly selectedRow = computed(() => {
    const variant = this.selectedVariant();
    return variant ? toVariantRow(variant) : null;
  });
}
