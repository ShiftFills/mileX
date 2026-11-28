import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config/api.config';
import { APP_ROUTES } from '../constants/app-routes';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';

// CHANGED (new): a guest's 401 from a call a public page makes (e.g. product_variant/get on the Product View) reaches
// that page as its own error: no token refresh, no sign-out and no redirect. The page decides what to show.
describe('errorInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  /** A guest on `page` makes a request that the backend answers with 401; resolves to the error the caller gets. */
  async function guestUnauthorized(page: string): Promise<unknown> {
    vi.spyOn(router, 'url', 'get').mockReturnValue(page);
    const result = firstValueFrom(client.get('/api/product_variant/get')).catch((error: unknown) => error);
    const request = http.expectOne('/api/product_variant/get');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ status: 'FAILED', message: 'Access token is required' }, { status: 401, statusText: 'Unauthorized' });
    return result;
  }

  it("hands a guest's 401 on a public page back to the caller, with no refresh, sign-out or redirect", async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const error = await guestUnauthorized('/products/18');

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(401);
    http.expectNone('/api/user/refresh');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('still sends a guest on a protected page to Login, and back afterwards', async () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await guestUnauthorized('/orders/ORD0020');

    expect(navigate).toHaveBeenCalledWith([APP_ROUTES.login], { queryParams: { returnUrl: '/orders/ORD0020' } });
  });
});
