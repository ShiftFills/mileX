import { TestBed } from '@angular/core/testing';
import { DocumentPreview } from './document-preview';

describe('DocumentPreview', () => {
  const createObjectURL = vi.fn(() => 'blob:preview');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  function setup(file: File) {
    const fixture = TestBed.createComponent(DocumentPreview);
    fixture.componentRef.setInput('file', file);
    fixture.componentRef.setInput('title', 'GST Certificate');
    fixture.detectChanges();
    return fixture;
  }

  it('shows the title, success status and the file actions', () => {
    const fixture = setup(new File(['x'], 'gst.pdf', { type: 'application/pdf' }));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('GST Certificate');
    expect(text).toContain('Uploaded successfully');
    expect(text).toContain('Replace file');
    expect(text).toContain('Remove');
    expect(text).toContain('Preview available for PDF, JPG and PNG files.');
  });

  it('renders an image preview for PNG files and a frame for PDFs', () => {
    const image = setup(new File(['x'], 'gst.png', { type: 'image/png' }));
    expect((image.nativeElement as HTMLElement).querySelector('img')).not.toBeNull();

    const pdf = setup(new File(['x'], 'gst.pdf', { type: 'application/pdf' }));
    expect((pdf.nativeElement as HTMLElement).querySelector('iframe')).not.toBeNull();
  });

  it('keeps zoom within 50%-200% in 25% steps', () => {
    const fixture = setup(new File(['x'], 'gst.png', { type: 'image/png' }));
    const component = fixture.componentInstance as unknown as {
      zoom: () => number;
      zoomIn: () => void;
      zoomOut: () => void;
    };

    for (let i = 0; i < 10; i += 1) component.zoomIn();
    expect(component.zoom()).toBe(200);
    for (let i = 0; i < 10; i += 1) component.zoomOut();
    expect(component.zoom()).toBe(50);
  });

  it('rejects unsupported replacement files and emits supported ones', () => {
    const fixture = setup(new File(['x'], 'gst.pdf', { type: 'application/pdf' }));
    const emitted: File[] = [];
    fixture.componentInstance.replaced.subscribe((file) => emitted.push(file));
    const component = fixture.componentInstance as unknown as { onReplace: (event: Event) => void };

    const pick = (file: File) => {
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file] });
      component.onReplace({ target: input } as unknown as Event);
    };

    pick(new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(emitted).toHaveLength(0);

    const next = new File(['y'], 'new.jpg', { type: 'image/jpeg' });
    pick(next);
    expect(emitted).toEqual([next]);
  });

  it('emits removed when Remove is pressed', () => {
    const fixture = setup(new File(['x'], 'gst.pdf', { type: 'application/pdf' }));
    const removed = vi.fn();
    fixture.componentInstance.removed.subscribe(removed);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.document-preview__remove button')
      ?.click();

    expect(removed).toHaveBeenCalledOnce();
  });
});
