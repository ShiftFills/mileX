import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
  type: ToastType;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<ToastMessage | null>(null);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  showSuccess(message: string): void {
    this.show('success', message);
  }

  showError(message: string): void {
    this.show('error', message);
  }

  dismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
    this.current.set(null);
  }

  private show(type: ToastType, message: string): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.current.set({ type, message });
    this.dismissTimer = setTimeout(() => this.dismiss(), 5000);
  }
}
