import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Badge } from '@shared/components/badge/badge';
import { Button } from '@shared/components/button/button';

export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png';
const ACCEPTED_TYPES = DOCUMENT_ACCEPT.split(',');
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;

@Component({
  selector: 'app-document-preview',
  imports: [Badge, Button],
  templateUrl: './document-preview.html',
  styleUrl: './document-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPreview {
  private readonly sanitizer = inject(DomSanitizer);

  readonly file = input.required<File>();
  readonly title = input.required<string>();
  readonly replaced = output<File>();
  readonly removed = output<void>();

  protected readonly accept = DOCUMENT_ACCEPT;
  protected readonly page = signal(1);
  protected readonly pageCount = signal(1);
  protected readonly zoom = signal(100);
  protected readonly replaceError = signal<string | null>(null);
  private readonly objectUrl = signal<string | null>(null);
  private readonly viewer = viewChild<ElementRef<HTMLElement>>('viewer');

  protected readonly kind = computed<'pdf' | 'image' | 'unsupported'>(() => {
    const type = this.file().type;
    if (type === 'application/pdf') return 'pdf';
    return type === 'image/jpeg' || type === 'image/png' ? 'image' : 'unsupported';
  });

  protected readonly extension = computed(() => {
    const name = this.file().name;
    const dot = name.lastIndexOf('.');
    return dot > -1 ? name.slice(dot + 1, dot + 5).toUpperCase() : 'FILE';
  });

  protected readonly imageSrc = computed(() => (this.kind() === 'image' ? this.objectUrl() : null));

  protected readonly pdfSrc = computed<SafeResourceUrl | null>(() => {
    const url = this.objectUrl();
    if (this.kind() !== 'pdf' || !url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `${url}#page=${this.page()}&zoom=${this.zoom()}&toolbar=0&navpanes=0`,
    );
  });

  protected readonly canZoomOut = computed(() => this.zoom() > ZOOM_MIN);
  protected readonly canZoomIn = computed(() => this.zoom() < ZOOM_MAX);

  constructor() {
    effect((onCleanup) => {
      const file = this.file();
      const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
      this.objectUrl.set(url);
      this.page.set(1);
      this.zoom.set(100);
      this.pageCount.set(1);
      this.replaceError.set(null);
      let stale = false;
      if (file.type === 'application/pdf') {
        void DocumentPreview.countPdfPages(file).then((count) => {
          if (!stale) this.pageCount.set(count);
        });
      }
      onCleanup(() => {
        stale = true;
        if (url) URL.revokeObjectURL(url);
      });
    });
  }

  /** Best-effort page count read from the PDF page tree; falls back to a single page. */
  private static async countPdfPages(file: File): Promise<number> {
    try {
      const text = new TextDecoder('latin1').decode(await file.arrayBuffer());
      return Math.max(1, text.match(/\/Type\s*\/Page(?![A-Za-z])/g)?.length ?? 1);
    } catch {
      return 1;
    }
  }

  protected previousPage(): void {
    this.page.update((page) => Math.max(1, page - 1));
  }

  protected nextPage(): void {
    this.page.update((page) => Math.min(this.pageCount(), page + 1));
  }

  protected zoomOut(): void {
    this.zoom.update((zoom) => Math.max(ZOOM_MIN, zoom - ZOOM_STEP));
  }

  protected zoomIn(): void {
    this.zoom.update((zoom) => Math.min(ZOOM_MAX, zoom + ZOOM_STEP));
  }

  protected openFullscreen(): void {
    void this.viewer()?.nativeElement.requestFullscreen?.();
  }

  protected onReplace(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.replaceError.set('Please choose a PDF, JPG or PNG file.');
      return;
    }
    this.replaceError.set(null);
    this.replaced.emit(file);
  }
}
