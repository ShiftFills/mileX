import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders the login form with required fields', () => {
    const email = fixture.nativeElement.querySelector('#login-email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;

    expect(email.required).toBe(true);
    expect(email.type).toBe('email');
    expect(password.required).toBe(true);
    expect(password.type).toBe('password');
  });

  it('toggles password visibility', () => {
    const toggle = fixture.nativeElement.querySelector('.login-password-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();

    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    expect(password.type).toBe('text');

    toggle.click();
    fixture.detectChanges();
    expect(password.type).toBe('password');
  });

  it('does not authenticate when no authentication service is configured', async () => {
    const email = fixture.nativeElement.querySelector('#login-email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#login-password') as HTMLInputElement;
    email.value = 'seller@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    password.value = 'example-password';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('no authentication service is configured');
  });
});
