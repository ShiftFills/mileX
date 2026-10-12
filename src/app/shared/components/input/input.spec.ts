import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Input } from './input';

describe('Input', () => {
  let component: Input;
  let fixture: ComponentFixture<Input>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Input],
    }).compileComponents();

    fixture = TestBed.createComponent(Input);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('forwards field properties and native validation', () => {
    fixture.componentRef.setInput('type', 'email');
    fixture.componentRef.setInput('name', 'email');
    fixture.componentRef.setInput('required', true);
    fixture.componentRef.setInput('placeholder', 'Email');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('email');
    expect(input.name).toBe('email');
    expect(input.required).toBe(true);
    expect(input.placeholder).toBe('Email');
  });
});
