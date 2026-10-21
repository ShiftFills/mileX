import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileUpload } from './file-upload';

describe('FileUpload', () => {
  let component: FileUpload;
  let fixture: ComponentFixture<FileUpload>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileUpload],
    }).compileComponents();

    fixture = TestBed.createComponent(FileUpload);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('inputId', 'test-file');
    fixture.componentRef.setInput('name', 'testFile');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits the selected file and clears the native input for reselection', () => {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['document'], 'gst-certificate.pdf', { type: 'application/pdf' });
    const selectedFiles = [file];
    Object.defineProperty(input, 'files', { configurable: true, value: selectedFiles });
    const selected = vi.fn();
    component.fileSelected.subscribe(selected);

    input.dispatchEvent(new Event('change'));

    expect(selected).toHaveBeenCalledWith(file);
    expect(input.value).toBe('');
  });

  it('keeps an empty or cancelled selection from emitting a file', () => {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [] });
    const selected = vi.fn();
    component.fileSelected.subscribe(selected);

    input.dispatchEvent(new Event('change'));

    expect(selected).not.toHaveBeenCalled();
  });

  it('connects the Choose Files label to the configured input ID', () => {
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement;

    expect(input.id).toBe('test-file');
    expect(label.htmlFor).toBe(input.id);
  });

  it('emits every file when multiple selection is enabled', () => {
    fixture.componentRef.setInput('multiple', true);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.jpg', { type: 'image/jpeg' }),
    ];
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    const selected = vi.fn();
    component.fileSelected.subscribe(selected);

    input.dispatchEvent(new Event('change'));

    expect(input.multiple).toBe(true);
    expect(selected).toHaveBeenNthCalledWith(1, files[0]);
    expect(selected).toHaveBeenNthCalledWith(2, files[1]);
  });
});
