import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RadarPoint } from '../../data/admin-dashboard';

const CENTER_X = 100;
const CENTER_Y = 92;
const RADIUS = 68;
const STRETCH_X = 1.1;
const STRETCH_Y = 0.94;
const LABEL_OFFSET = 13;
const RINGS = [1 / 3, 2 / 3, 1];

interface Vertex {
  x: number;
  y: number;
}

/** Radar (spider) chart drawn as inline SVG: one axis per entry, first axis pointing up. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-radar-chart',
  styleUrl: './radar-chart.scss',
  templateUrl: './radar-chart.html',
})
export class RadarChart {
  readonly points = input.required<readonly RadarPoint[]>();
  readonly ariaLabel = input('Radar chart');

  protected readonly rings = computed(() => RINGS.map((scale) => toPoints(this.points().map((_, i) => vertex(i, this.points().length, scale)))));

  protected readonly axes = computed(() => this.points().map((_, i) => vertex(i, this.points().length, 1)));

  protected readonly labels = computed(() =>
    this.points().map((point, i) => ({ text: point.label, ...vertex(i, this.points().length, 1 + LABEL_OFFSET / RADIUS) })),
  );

  protected readonly vertices = computed(() => this.points().map((point, i) => vertex(i, this.points().length, point.value)));

  protected readonly area = computed(() => toPoints(this.vertices()));

  protected readonly center = { x: CENTER_X, y: CENTER_Y };
}

function vertex(index: number, count: number, scale: number): Vertex {
  const angle = (index / count) * Math.PI * 2;
  return {
    x: CENTER_X + Math.sin(angle) * RADIUS * STRETCH_X * scale,
    y: CENTER_Y - Math.cos(angle) * RADIUS * STRETCH_Y * scale,
  };
}

function toPoints(vertices: readonly Vertex[]): string {
  return vertices.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ');
}
