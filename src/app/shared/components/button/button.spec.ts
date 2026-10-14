import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Button } from './button';

describe('Button', () => {
  let component: Button;
  let fixture: ComponentFixture<Button>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Button],
    }).compileComponents();

    fixture = TestBed.createComponent(Button);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('forwards clicks from its native button', () => {
    let clicked = false;
    component.clicked.subscribe(() => (clicked = true));
    fixture.nativeElement.querySelector('button').click();
    expect(clicked).toBe(true);
  });

  it('applies the requested button type and disabled state', () => {
    fixture.componentRef.setInput('type', 'submit');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.type).toBe('submit');
    expect(button.disabled).toBe(true);
  });

  it('applies the compact size without changing the small size class', () => {
    fixture.componentRef.setInput('size', 'compact');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.classList).toContain('btn--compact');
    expect(button.classList).not.toContain('btn-sm');
  });
});
