import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { CartService } from '../../services/cart.service';
import { CartItem } from '@shared/models';
import { Card } from '@shared/components/card/card';
import { Button } from '@shared/components/button/button';
import { Table, TableCellContext, TableColumn } from '@shared/components/table/table';

interface CartTableRow {
  item: CartItem;
  seller: string;
  sku: string;
  discount: number;
  tax: string;
}

@Component({
  selector: 'app-cart',
  imports: [Button, Card, CurrencyPipe, Table],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cart {
  protected readonly cart = inject(CartService);
  protected readonly routes = APP_ROUTES;
  protected readonly openActionMenuId = signal<string | null>(null);
  private readonly router = inject(Router);
  private readonly selectionCell = viewChild<TemplateRef<TableCellContext<CartTableRow>>>('selectionCell');
  private readonly productCell = viewChild<TemplateRef<TableCellContext<CartTableRow>>>('productCell');
  private readonly quantityCell = viewChild<TemplateRef<TableCellContext<CartTableRow>>>('quantityCell');
  private readonly unitPriceCell = viewChild<TemplateRef<TableCellContext<CartTableRow>>>('unitPriceCell');
  private readonly discountCell = viewChild<TemplateRef<TableCellContext<CartTableRow>>>('discountCell');
  private readonly totalCell = viewChild<TemplateRef<TableCellContext<CartTableRow>>>('totalCell');
  private readonly actionCell = viewChild<TemplateRef<TableCellContext<CartTableRow>>>('actionCell');

  protected readonly tableRows = computed<readonly CartTableRow[]>(() =>
    this.cart.items().map((item, index) => ({
      item,
      seller: 'Sunrise Trader',
      sku: this.skuFor(index),
      discount: Math.max(0, (item.product.originalPrice ?? item.product.price) - item.product.price),
      tax: 'Included',
    })),
  );
  protected readonly tableColumns = computed<readonly TableColumn<CartTableRow>[]>(() => [
    { key: 'selection', label: '', width: 'var(--cart-col-select)', selection: true, cellTemplate: this.selectionCell() },
    { key: 'product', label: 'Product', width: 'var(--cart-col-product)', cellTemplate: this.productCell() },
    { key: 'seller', label: 'Seller', width: 'var(--cart-col-seller)' },
    { key: 'sku', label: 'SKU', width: 'var(--cart-col-sku)' },
    { key: 'quantity', label: 'Quantity', width: 'var(--cart-col-quantity)', cellTemplate: this.quantityCell() },
    { key: 'unitPrice', label: 'Unit Price', width: 'var(--cart-col-price)', bold: true, cellTemplate: this.unitPriceCell() },
    { key: 'discount', label: 'Discount', width: 'var(--cart-col-discount)', cellTemplate: this.discountCell() },
    { key: 'tax', label: 'Tax', width: 'var(--cart-col-tax)' },
    { key: 'total', label: 'Total Amount', width: 'var(--cart-col-total)', bold: true, cellTemplate: this.totalCell() },
    { key: 'action', label: 'Action', width: 'var(--cart-col-action)', align: 'center', overflowVisible: true, cellTemplate: this.actionCell() },
  ]);

  constructor() {
    this.cart.seedDemoItems([
      'women-printed-maxi-dress-1', 'mens-cotton-t-shirt-1', 'smart-watch-1',
      'soft-chair-1', 'classic-watch-1', 'wireless-headphones-1',
    ]);
  }

  protected proceedToPay(): void {
    void this.router.navigate([this.routes.checkout]);
  }

  protected toggleActionMenu(productId: string): void {
    this.openActionMenuId.update((openId) => openId === productId ? null : productId);
  }

  protected removeActionItem(productId: string): void {
    this.cart.remove(productId);
    this.openActionMenuId.set(null);
  }

  @HostListener('document:click')
  protected closeActionMenu(): void {
    this.openActionMenuId.set(null);
  }

  @HostListener('document:keydown.escape')
  protected closeActionMenuOnEscape(): void {
    this.closeActionMenu();
  }

  protected browseProducts(): void {
    void this.router.navigate([this.routes.products]);
  }

  protected skuFor(index: number): string {
    return `MLEX-${String(index + 1).padStart(3, '0')}`;
  }

  protected discountFor(price: number, originalPrice: number | undefined, quantity = 1): number {
    return Math.max(0, (originalPrice ?? price) - price) * quantity;
  }

  protected discountTotal(): number {
    return this.cart.items().reduce(
      (total, item) => total + this.discountFor(item.product.price, item.product.originalPrice, item.quantity),
      0,
    );
  }

}
