import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { SalesPoint } from '../../data/admin-dashboard';

/** Smooth area chart (inline SVG, no chart library) with a hover/focus tooltip for each period. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sales-chart',
  styleUrl: './sales-chart.scss',
  templateUrl: './sales-chart.html',
})
export class SalesChart {
  readonly points = input.required<readonly SalesPoint[]>();
  readonly axis = input<readonly string[]>([]);
  readonly year = input('2026');
  /** Index highlighted when nothing is hovered. */
  readonly defaultIndex = input(0);

  private readonly hovered = signal<number | null>(null);

  protected readonly activeIndex = computed(() => this.hovered() ?? this.defaultIndex());

  /** Chart coordinates: x and y both in 0-100 (y measured from the top). */
  protected readonly coords = computed(() => {
    const points = this.points();
    const last = Math.max(points.length - 1, 1);
    return points.map((point, index) => ({ x: (index / last) * 100, y: 100 - point.value }));
  });

  protected readonly active = computed(() => {
    const index = this.activeIndex();
    return { point: this.points()[index], coord: this.coords()[index] };
  });

  protected readonly linePath = computed(() => smoothPath(this.coords()));

  protected readonly areaPath = computed(() => `${this.linePath()} L 100 100 L 0 100 Z`);

  protected setHovered(index: number | null): void {
    this.hovered.set(index);
  }
}

/** Cubic path through the points; slopes are zeroed at turning points so peaks and dips never overshoot. */
function smoothPath(coords: readonly { x: number; y: number }[]): string {
  if (!coords.length) return '';
  const slopes = coords.map((current, i) => {
    const prev = coords[i - 1];
    const next = coords[i + 1];
    if (!prev || !next) return 0;
    const before = (current.y - prev.y) / (current.x - prev.x);
    const after = (next.y - current.y) / (next.x - current.x);
    return before * after <= 0 ? 0 : (before + after) / 2;
  });
  let path = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const reach = (b.x - a.x) / 3;
    path += ` C ${a.x + reach} ${a.y + slopes[i] * reach} ${b.x - reach} ${b.y - slopes[i + 1] * reach} ${b.x} ${b.y}`;
  }
  return path;
}
