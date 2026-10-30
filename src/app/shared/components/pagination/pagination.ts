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
  readonly total = input<number | undefined>(0);
  readonly totalPages = input<number | undefined>(undefined);
  readonly hasNext = input<boolean | undefined>(undefined);
  readonly itemLabel = input('products');
  readonly ariaLabel = input('Pagination');
  readonly pageChange = output<number>();

  protected readonly pageCount = computed(() => {
    const totalPages = this.totalPages();
    if (totalPages !== undefined) return Math.max(1, this.page(), totalPages);
    const total = this.total();
    if (total !== undefined) return Math.max(1, this.page(), Math.ceil(total / this.pageSize()));
    return Math.max(1, this.page() + (this.hasNext() ? 1 : 0));
  });
  protected readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  protected readonly rangeEnd = computed(() => {
    const total = this.total();
    return total === undefined ? this.page() * this.pageSize() : Math.min(this.page() * this.pageSize(), total);
  });
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
