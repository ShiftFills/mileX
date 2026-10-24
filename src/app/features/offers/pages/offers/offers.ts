import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_ROUTES } from '@core/constants/app-routes';
import { Badge, BadgeTone } from '@shared/components/badge/badge';
import { Offer, OfferStatus } from '@shared/models';
import { OfferService } from '../../services/offer.service';

const STATUS_TONES: Record<OfferStatus, BadgeTone> = {
  Active: 'success',
  Upcoming: 'info',
  Expired: 'neutral',
};
const COPIED_RESET_MS = 2000;

@Component({
  selector: 'app-offers',
  imports: [Badge, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './offers.html',
  styleUrl: './offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Offers {
  protected readonly routes = APP_ROUTES;
  protected readonly offers = inject(OfferService).offers;
  /** Id of the offer whose code was just copied (drives the "Copied" feedback). */
  protected readonly copiedId = signal<string | null>(null);
  private resetTimer?: ReturnType<typeof setTimeout>;

  protected statusTone(status: OfferStatus): BadgeTone {
    return STATUS_TONES[status];
  }

  protected async copyCode(offer: Offer): Promise<void> {
    try {
      await navigator.clipboard.writeText(offer.code);
    } catch {
      return; // Clipboard blocked (insecure context / permissions): leave the code selectable.
    }
    this.copiedId.set(offer.id);
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.copiedId.set(null), COPIED_RESET_MS);
  }
}
