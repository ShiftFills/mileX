import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** "Showing 1–6 of 128 products" summary + page buttons. Parent owns the current page. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pagination',
  styleUrl: './pagination.scss',
  templateUrl: './pagination.html',
})
export class Pagination {
  readonly page = input(1);
  readonly pageSize = input(6);
  readonly total = input(0);
  readonly itemLabel = input('products');
  readonly ariaLabel = input('Pagination');
  readonly pageChange = output<number>();

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly rangeStart = computed(() => (this.total() ? (this.page() - 1) * this.pageSize() + 1 : 0));
  protected readonly rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.total()));
  protected readonly pageNumbers = computed(() => {
    const count = Math.min(this.pageCount(), 5);
    const first = Math.max(1, Math.min(this.page() - 2, this.pageCount() - count + 1));
    return Array.from({ length: count }, (_, index) => first + index);
  });
  protected readonly hasMore = computed(() => (this.pageNumbers().at(-1) ?? 0) < this.pageCount());

  protected go(page: number): void {
    if (page >= 1 && page <= this.pageCount() && page !== this.page()) this.pageChange.emit(page);
  }
}
