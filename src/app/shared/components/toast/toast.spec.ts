import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastService } from '@core/services/toast.service';
import { Toast } from './toast';

describe('Toast', () => {
  let component: Toast;
  let fixture: ComponentFixture<Toast>;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Toast],
    }).compileComponents();

    fixture = TestBed.createComponent(Toast);
    component = fixture.componentInstance;
    toastService = TestBed.inject(ToastService);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays and dismisses a success notification', () => {
    toastService.showSuccess('Seller onboarding saved.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Seller onboarding saved.');
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.app-toast--success')).not.toBeNull();

    fixture.nativeElement.querySelector('button')?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.app-toast')).toBeNull();
  });

  it('marks error notifications as alerts', () => {
    toastService.showError('Bank details failed.');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Bank details failed.');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.app-toast--error')).not.toBeNull();
    toastService.dismiss();
  });
});
