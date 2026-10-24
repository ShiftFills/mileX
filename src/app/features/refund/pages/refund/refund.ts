import { CurrencyPipe, DOCUMENT, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { PageHeading } from '@shared/components/page-heading/page-heading';
import { Stepper, StepperStep } from '@shared/components/stepper/stepper';
import { RefundService } from '../../services/refund.service';

const WALLET_ICON =
  'M3 7a2 2 0 0 1 2-2h12v3M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2ZM16 13.5h.01';

/** Lifecycle shown on the refund page; `Refund.stage` indexes into this list. */
const REFUND_STEPS: readonly StepperStep[] = [
  { label: 'Return Requested', caption: 'Initiated by buyer' },
  { label: 'Item Received', caption: 'Inspected at hub' },
  { label: 'Refund Approved', caption: 'Verified by merchant' },
  { label: 'Refund Processed', caption: 'Gateway transfer' },
  { label: 'Amount Credited', caption: 'Refund to account', icon: WALLET_ICON },
];

@Component({
  selector: 'app-refund',
  imports: [Badge, Button, Card, CurrencyPipe, DatePipe, PageHeading, RouterLink, Stepper],
  templateUrl: './refund.html',
  styleUrl: './refund.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Refund {
  /** Return number from `/refund/:id`; the latest refund is shown when omitted. */
  readonly id = input<string>();

  private readonly refunds = inject(RefundService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly routes = APP_ROUTES;
  protected readonly steps = REFUND_STEPS;
  protected readonly copied = signal(false);
  protected readonly refund = computed(() => this.refunds.find(this.id()));

  protected async copyReference(reference: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      return; // Clipboard blocked (insecure context / permissions): leave the text selectable.
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected downloadStatement(): void {
    const refund = this.refund();
    if (!refund) return;
    const url = URL.createObjectURL(
      new Blob([this.refunds.statementFor(refund)], { type: 'text/plain;charset=utf-8' }),
    );
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `refund-statement-${refund.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected contactSupport(): void {
    void this.router.navigate([this.routes.support]);
  }
}
