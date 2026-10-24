import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface StepperStep {
  label: string;
  /** Small line under the label (large variant only). */
  caption?: string;
  /** SVG path data on a 24x24 grid, drawn in the marker while this step is the current one. */
  icon?: string;
  /** SVG path data on a 24x24 grid, drawn in the marker (instead of its number) while the step is upcoming. */
  upcomingIcon?: string;
}

/**
 * Horizontal progress steps. Steps before `current` are done (check mark), the step at
 * `current` is highlighted, later steps are upcoming. `compact` suits page headers (numbered
 * inline steps); `large` suits a lifecycle card (markers with a label and caption below).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-stepper',
  styleUrl: './stepper.scss',
  templateUrl: './stepper.html',
})
export class Stepper {
  readonly steps = input.required<readonly StepperStep[]>();
  /** Zero-based index of the current step. */
  readonly current = input(0);
  readonly size = input<'compact' | 'large'>('compact');
  /** Fit the large variant into a phone-width row instead of scrolling it. */
  readonly mobileFit = input(false);
  readonly ariaLabel = input('Progress');
}
