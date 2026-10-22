import { Directive, ElementRef, HostListener, output } from '@angular/core';

/** Emits when a click lands outside the element carrying this directive. */
@Directive({
  selector: '[appClickOutside]',
  standalone: true,
})
export class ClickOutside {
  readonly clickedOutside = output<void>();

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (event.target instanceof Node && !this.elementContains(event.target)) {
      this.clickedOutside.emit();
    }
  }

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  private elementContains(target: Node): boolean {
    return this.host.nativeElement.contains(target);
  }
}
