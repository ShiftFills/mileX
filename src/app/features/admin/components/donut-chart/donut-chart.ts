import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface DonutSlice {
  label: string;
  percent: number;
  color: string;
}

const RADIUS = 52;
const STROKE = 15;
const GAP = 3;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Ring chart with rounded, evenly gapped segments and a caption in the middle. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-donut-chart',
  styleUrl: './donut-chart.scss',
  templateUrl: './donut-chart.html',
})
export class DonutChart {
  readonly slices = input.required<readonly DonutSlice[]>();
  readonly caption = input('');
  readonly value = input('');

  protected readonly radius = RADIUS;
  protected readonly stroke = STROKE;

  protected readonly segments = computed(() => {
    const slices = this.slices();
    const total = slices.reduce((sum, slice) => sum + slice.percent, 0) || 1;
    let offset = 0;
    return slices.map((slice) => {
      const length = (slice.percent / total) * CIRCUMFERENCE;
      // Round caps stretch each arc by half the stroke on both ends, so shorten it by one stroke plus the gap.
      const visible = Math.max(length - STROKE - GAP, 0.01);
      const segment = {
        color: slice.color,
        dash: `${visible} ${CIRCUMFERENCE - visible}`,
        offset: -(offset + (STROKE + GAP) / 2),
      };
      offset += length;
      return segment;
    });
  });
}
