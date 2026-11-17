import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { AuthLayout } from './auth-layout';

@Component({ template: '' })
class RoutedPage {}

@Component({
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class TestHost {}

describe('AuthLayout', () => {
  let fixture: ComponentFixture<TestHost>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        provideRouter([
          {
            path: 'auth',
            component: AuthLayout,
            children: [
              { path: 'login', component: RoutedPage },
              { path: 'register', component: RoutedPage },
            ],
          },
        ]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHost);
    router = TestBed.inject(Router);
  });

  it('applies the login layout when a returnUrl query parameter is present', async () => {
    await router.navigateByUrl('/auth/login?returnUrl=%2Fadmin%2Fproducts%2Fvariants');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('.auth--login .auth__panel--login'),
    ).not.toBeNull();
  });

  it('continues to apply the registration layout', async () => {
    await router.navigateByUrl('/auth/register?returnUrl=%2Faccount');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelector('.auth--register .auth__panel--register'),
    ).not.toBeNull();
  });
});
