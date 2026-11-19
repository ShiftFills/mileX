import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductVariant } from '@features/admin/services/product-variant.service';
import {
  ProductVariantSelector,
  variantOptionValue,
  variantOptionsLabel,
  variantStockStatus,
} from './product-variant-selector';

// CHANGED (new): the Product View's variant picker (swatches, chips and cards).
function variant(id: string, overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id, productId: 1, name: `Variant ${id}`, imageUrl: '/images/latest-gadgets.svg', imagePath: '', sku: '—',
    barcode: '', color: '', material: '', size: '', weight: '', stock: 5, price: 100, sellerId: null,
    sellerName: '', createdBy: null, status: 'ACTIVE', sizeName: '', colorName: '', materialName: '',
    ...overrides,
  };
}

describe('ProductVariantSelector', () => {
  let fixture: ComponentFixture<ProductVariantSelector>;
  let emitted: string[];

  beforeEach(() => {
    fixture = TestBed.createComponent(ProductVariantSelector);
    emitted = [];
    fixture.componentInstance.selectedChange.subscribe((id) => emitted.push(id));
  });

  function render(variants: ProductVariant[], selectedId: string | null): void {
    fixture.componentRef.setInput('variants', variants);
    fixture.componentRef.setInput('selectedId', selectedId);
    fixture.componentRef.setInput('fallbackImage', '/images/product.svg');
    fixture.detectChanges();
  }

  const labels = (): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.variant-selector__label') as NodeListOf<HTMLElement>, (label) =>
      (label.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  const buttons = (key: string): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(`[aria-labelledby="variant-option-${key}"] button`));
  const click = (key: string, value: string): void => {
    buttons(key).find((button) => button.textContent?.includes(value))?.click();
  };

  it('reads attribute names, ignores numeric lookup IDs and empty values, and labels stock', () => {
    expect(variantOptionValue(variant('1', { colorName: ' Navy Blue ', color: '7' }), 'colour')).toBe('Navy Blue');
    expect(variantOptionValue(variant('1', { size: 'XL' }), 'size')).toBe('XL');
    expect(variantOptionValue(variant('1', { size: '12' }), 'size')).toBe('');
    expect(variantOptionValue(variant('1', { materialName: '—' }), 'material')).toBe('');
    expect(variantOptionsLabel(variant('1', { colorName: 'Red', materialName: 'Cotton' }))).toBe('Red / Cotton');
    expect([0, 3, 5, 6].map((stock) => variantStockStatus(stock))).toEqual([
      { label: 'Out of stock', tone: 'danger' },
      { label: 'Only 3 left', tone: 'warning' },
      { label: 'Only 5 left', tone: 'warning' },
      { label: 'In stock', tone: 'success' },
    ]);
  });

  it('shows a single variant\'s values without variant cards', () => {
    render([variant('1', { colorName: 'Red', sizeName: 'M' })], '1');

    expect(labels()).toEqual(['Colour: Red', 'Size: M']);
    expect(fixture.nativeElement.querySelector('.variant-selector__card')).toBeNull();
  });

  it('renders nothing for a single variant without colour, size or material', () => {
    render([variant('1')], '1');

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('shows only variant cards when the variants have no attributes, and emits the clicked one', () => {
    render([variant('1', { name: 'Basic' }), variant('2', { name: 'Pro', stock: 0, imagePath: 'pro.png' })], '1');

    expect(labels()).toEqual(['Variant: Basic (2 available)']);
    const cards: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('.variant-selector__card'));
    expect(cards.map((card) => card.querySelector('img')?.getAttribute('src'))).toEqual(['/images/product.svg', '/uploads/pro.png']);
    expect(cards[1].classList.contains('is-out')).toBe(true);

    cards[0].click();
    cards[1].click();
    expect(emitted).toEqual(['2']);
  });

  it('keeps the other selected values when choosing, preferring a variant in stock for an equal match', () => {
    const variants = [
      variant('1', { colorName: 'Red', sizeName: 'S', stock: 0 }),
      variant('2', { colorName: 'Red', sizeName: 'M' }),
      variant('3', { colorName: 'Blue', sizeName: 'S' }),
      variant('4', { colorName: 'Green', sizeName: 'S', stock: 0 }),
      variant('5', { colorName: 'Green', sizeName: 'S', stock: 4 }),
    ];
    render(variants, '3');

    // Red in size S exists but is out of stock; size M only comes in Red.
    expect(buttons('colour').map((button) => button.className.match(/is-(active|out|unavailable)/)?.[0] ?? '')).toEqual([
      'is-out', 'is-active', '',
    ]);
    expect(buttons('size').map((button) => button.className.match(/is-(active|out|unavailable)/)?.[0] ?? '')).toEqual([
      'is-active', 'is-unavailable',
    ]);

    click('colour', 'Red');
    click('colour', 'Green');
    click('size', 'M');
    expect(emitted).toEqual(['1', '5', '2']);
  });

  it('uses a hex COLOR for the swatch and the initial when the colour is unknown', () => {
    render([variant('1', { colorName: 'Signal', color: '#ff0000' }), variant('2', { colorName: 'Mystery' })], '1');

    const dots: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.variant-selector__dot'));
    expect(dots[0].style.getPropertyValue('--swatch')).toBe('#ff0000');
    expect(dots[1].textContent?.trim()).toBe('M');
  });
});
