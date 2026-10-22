import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';
import { Product } from '@shared/models';

type InfoTab = 'details' | 'specifications' | 'reviews';

@Component({
  selector: 'app-product-info-tabs',
  templateUrl: './product-info-tabs.html',
  styleUrl: './product-info-tabs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductInfoTabs {
  readonly product = input.required<Product>();

  protected readonly tabs: readonly { id: InfoTab; label: string }[] = [
    { id: 'details', label: 'Product Details' },
    { id: 'specifications', label: 'Specifications' },
    { id: 'reviews', label: 'Reviews' },
  ];

  protected readonly activeTab = linkedSignal<Product, InfoTab>({
    source: this.product,
    computation: () => 'details',
  });
}
