import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '@core/services/toast.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-toast',
  styleUrl: './toast.scss',
  templateUrl: './toast.html',
})
export class Toast {
  protected readonly toast = inject(ToastService);
}
