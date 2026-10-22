import { Injectable } from '@angular/core';
import { Refund } from '@shared/models';
import { REFUNDS } from '../data/refunds';

@Injectable({ providedIn: 'root' })
export class RefundService {
  readonly refunds: readonly Refund[] = REFUNDS;

  /** The refund for a return number, or the most recent one when no id is given. */
  find(id?: string): Refund | undefined {
    return id ? this.refunds.find((refund) => refund.id === id) : this.refunds[0];
  }

  /** Plain-text statement offered by "Download Refund Statement". */
  statementFor(refund: Refund): string {
    const rows: [string, string][] = [
      ['Order No.', refund.orderNo],
      ['Return No.', refund.id],
      ['Amount', refund.amount.toFixed(2)],
      ['Method', refund.method],
      ['Reference', refund.reference],
      ['Date', refund.processedOn],
      ['Status', 'Processed / Refunded'],
    ];
    return ['MileX Refund Statement', '', ...rows.map(([label, value]) => `${label}: ${value}`), ''].join('\n');
  }
}
