import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { ProductVariant } from '@features/admin/services/product-variant.service';
import { BadgeTone } from '@shared/components/badge/badge';

/**
 * Storefront URL of a variant image. VARIANT_IMAGE is only a file name, so it is served from
 * /uploads/<file name> (the same rule the project uses for return images and seller documents).
 * Full URLs and absolute paths are kept as they are. Returns '' when the variant has no image.
 */
// CHANGED (new): storefront only; the shared variant reader keeps VARIANT_IMAGE as sent.
export function variantImageUrl(variant: Pick<ProductVariant, 'imagePath'>): string {
  const path = variant.imagePath.trim();
  if (!path) return '';
  if (/^(?:https?:|blob:|data:)/i.test(path) || path.startsWith('/')) return path;
  const uploadPath = path.startsWith('uploads/') ? path : `uploads/${path}`;
  return `/${uploadPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')}`;
}

// CHANGED (new): variant display helpers shared by the selector and the selected-variant card.

/** The variant attributes a customer can choose by, in display order. */
export type VariantOptionKey = 'colour' | 'size' | 'material';

export const VARIANT_OPTIONS: readonly { key: VariantOptionKey; label: string }[] = [
  { key: 'colour', label: 'Colour' },
  { key: 'size', label: 'Size' },
  { key: 'material', label: 'Material' },
];

/** Products with this many units or fewer show "Only N left" (same limit as the Product View's stock badge). */
const LOW_STOCK_LIMIT = 5;

/** Trimmed text, or '' for null, empty or the variant reader's '—' placeholder. */
export function variantText(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  return text === '—' ? '' : text;
}

/**
 * The display value of one variant attribute: COLOUR_NAME / SIZE_NAME / MATERIAL_NAME, else
 * COLOR / SIZE / MATERIAL when that is text rather than a numeric lookup ID. '' when neither is set.
 */
export function variantOptionValue(variant: ProductVariant, key: VariantOptionKey): string {
  const [name, raw] =
    key === 'colour'
      ? [variant.colorName, variant.color]
      : key === 'size'
        ? [variant.sizeName, variant.size]
        : [variant.materialName, variant.material];
  const fallback = variantText(raw);
  return variantText(name) || (/^\d+$/.test(fallback) ? '' : fallback);
}

/** The variant's attribute values joined like "Brown / M / Leather" ('' when it has none). */
export function variantOptionsLabel(variant: ProductVariant): string {
  return VARIANT_OPTIONS.map(({ key }) => variantOptionValue(variant, key))
    .filter(Boolean)
    .join(' / ');
}

export function variantStockStatus(stock: number): { label: string; tone: BadgeTone } {
  if (stock <= 0) return { label: 'Out of stock', tone: 'danger' };
  if (stock <= LOW_STOCK_LIMIT) return { label: `Only ${stock} left`, tone: 'warning' };
  return { label: 'In stock', tone: 'success' };
}

const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'currentcolor']);

/** A CSS colour for a colour swatch: a hex COLOR, else the colour name (or its last word, "Navy Blue" -> blue). */
function swatchColor(variant: ProductVariant, label: string): string {
  for (const candidate of [variant.color, label, label.split(/\s+/).pop() ?? '']) {
    const text = variantText(candidate);
    if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(text)) return text;
    const name = text.toLowerCase().replace(/[^a-z]/g, '');
    if (name && !CSS_WIDE_KEYWORDS.has(name) && typeof CSS !== 'undefined' && CSS.supports?.('color', name)) {
      return name;
    }
  }
  return '';
}

/**
 * - available: a variant with this value and the other selected values is in stock
 * - out: such a variant exists but is out of stock
 * - unavailable: no variant has this value with the other selected values (choosing it changes them)
 */
type ChoiceStatus = 'available' | 'out' | 'unavailable';

interface OptionChoice {
  value: string;
  selected: boolean;
  status: ChoiceStatus;
  /** CSS colour of a colour swatch ('' shows the colour's initial instead). */
  swatch: string;
}

interface OptionGroup {
  key: VariantOptionKey;
  label: string;
  /** The selected variant's value ('' when it has none). */
  selected: string;
  choices: readonly OptionChoice[];
}

/**
 * True when two variants do not contradict each other on the given attribute:
 * an attribute only one of them has (or neither) does not count against the match.
 */
function sameOption(a: ProductVariant, b: ProductVariant, key: VariantOptionKey): boolean {
  const first = variantOptionValue(a, key);
  const second = variantOptionValue(b, key);
  return !first || !second || first === second;
}

/**
 * Variant selection on the Product View, above Quantity and Add to Cart: colour swatches,
 * size and material chips (only for attributes the product's variants have), and one card per
 * variant with its image, price and stock.
 */
// CHANGED: was a row of variant chips. Its own component so its styles stay out of product-detail.scss (style budget).
@Component({
  selector: 'app-product-variant-selector',
  imports: [CurrencyPipe],
  templateUrl: './product-variant-selector.html',
  styleUrl: './product-variant-selector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductVariantSelector {
  /** The variants a customer can choose; the page passes only this product's ACTIVE ones. */
  readonly variants = input.required<readonly ProductVariant[]>();
  readonly selectedId = input<string | null>(null);
  /** Shown on a card whose variant has no image or whose image fails to load (the product image). */
  // CHANGED (new)
  readonly fallbackImage = input('');
  /** Emits the VARIANT_ID the customer chose. */
  readonly selectedChange = output<string>();

  protected readonly selected = computed(
    () => this.variants().find((variant) => variant.id === this.selectedId()) ?? null,
  );

  // CHANGED (new): one group per attribute that at least one variant has, with each distinct value once.
  protected readonly groups = computed<readonly OptionGroup[]>(() => {
    const variants = this.variants();
    const selected = this.selected();
    return VARIANT_OPTIONS.map(({ key, label }) => {
      const values = new Map<string, ProductVariant>();
      for (const variant of variants) {
        const value = variantOptionValue(variant, key);
        if (value && !values.has(value)) values.set(value, variant);
      }
      const choices = [...values].map(([value, first]): OptionChoice => {
        const matching = variants.filter(
          (variant) =>
            variantOptionValue(variant, key) === value &&
            (!selected || VARIANT_OPTIONS.every((other) => other.key === key || sameOption(variant, selected, other.key))),
        );
        return {
          value,
          selected: !!selected && variantOptionValue(selected, key) === value,
          status: !matching.length ? 'unavailable' : matching.some((variant) => variant.stock > 0) ? 'available' : 'out',
          swatch: key === 'colour' ? swatchColor(first, value) : '',
        };
      });
      return { key, label, selected: selected ? variantOptionValue(selected, key) : '', choices };
    }).filter((group) => group.choices.length > 0);
  });

  // CHANGED (new): variant cards (only useful when there is more than one variant).
  protected readonly cards = computed(() =>
    this.variants().length > 1
      ? this.variants().map((variant) => ({
          variant,
          image: this.imageFor(variant),
          options: variantOptionsLabel(variant),
          stock: variantStockStatus(variant.stock),
        }))
      : [],
  );

  /** Variants whose image failed to load; their cards show the fallback image. */
  private readonly brokenImages = signal<ReadonlySet<string>>(new Set());

  private readonly cardStrip = viewChild<ElementRef<HTMLElement>>('cardStrip');

  constructor() {
    // CHANGED (new): keeps the selected card visible in the sideways-scrolling strip (e.g. after choosing a colour).
    // Only the strip scrolls; the page itself never moves.
    afterRenderEffect(() => {
      this.selectedId();
      const strip = this.cardStrip()?.nativeElement;
      const card = strip?.querySelector<HTMLElement>('.variant-selector__card.is-active');
      if (!strip || !card) return;
      if (card.offsetLeft < strip.scrollLeft) {
        strip.scrollLeft = card.offsetLeft;
      } else if (card.offsetLeft + card.offsetWidth > strip.scrollLeft + strip.clientWidth) {
        strip.scrollLeft = card.offsetLeft + card.offsetWidth - strip.clientWidth;
      }
    });
  }

  protected hideImage(variantId: string): void {
    if (!this.brokenImages().has(variantId)) {
      this.brokenImages.update((ids) => new Set(ids).add(variantId));
    }
  }

  protected select(variant: ProductVariant): void {
    if (variant.id !== this.selectedId()) this.selectedChange.emit(variant.id);
  }

  /**
   * A colour / size / material value was chosen. Picks the variant with that value that keeps most of
   * the other selected values, preferring one in stock when the match is equally good.
   */
  // CHANGED (new)
  protected choose(key: VariantOptionKey, value: string): void {
    const selected = this.selected();
    const score = (variant: ProductVariant): number => {
      const kept = VARIANT_OPTIONS.filter(
        (other) =>
          other.key !== key &&
          !!selected &&
          variantOptionValue(selected, other.key) !== '' &&
          variantOptionValue(variant, other.key) === variantOptionValue(selected, other.key),
      ).length;
      return kept * 2 + (variant.stock > 0 ? 1 : 0);
    };
    let best: ProductVariant | null = null;
    for (const variant of this.variants()) {
      if (variantOptionValue(variant, key) === value && (!best || score(variant) > score(best))) best = variant;
    }
    if (best) this.select(best);
  }

  private imageFor(variant: ProductVariant): string {
    return (!this.brokenImages().has(variant.id) && variantImageUrl(variant)) || this.fallbackImage();
  }
}
