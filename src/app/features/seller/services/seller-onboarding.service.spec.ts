import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SellerOnboardingPayload, SellerOnboardingService } from './seller-onboarding.service';

describe('SellerOnboardingService', () => {
  let service: SellerOnboardingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SellerOnboardingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads and maps business types from the lookup API', () => {
    let options: unknown;
    service.getBusinessTypes().subscribe((result) => (options = result));

    http
      .expectOne(
        (request) =>
          request.url.endsWith('/business_type/get') &&
          request.params.get('BUSINESS_TYPE_ID') === '-1',
      )
      .flush({
        STATUS: 'SUCCESS',
        DATA: [{ BUSINESS_TYPE_ID: 13, BUSINESS_TYPE_NAME: 'Retail Business' }],
      });

    expect(options).toEqual([{ id: '13', name: 'Retail Business' }]);
  });

  it('loads countries and states using their requested lookup IDs', () => {
    let countries: unknown;
    let states: unknown;
    service.getCountries().subscribe((result) => (countries = result));
    service.getStates('1').subscribe((result) => (states = result));

    http
      .expectOne(
        (request) =>
          request.url.endsWith('/country/get') && request.params.get('COUNTRY_ID') === '-1',
      )
      .flush({
        STATUS: 'SUCCESS',
        DATA: [{ COUNTRY_ID: 1, COUNTRY_NAME: 'India' }],
      });
    http
      .expectOne(
        (request) =>
          request.url.endsWith('/state/get') &&
          request.params.get('STATE_ID') === '-1' &&
          request.params.get('COUNTRY_ID') === '1',
      )
      .flush({
        STATUS: 'SUCCESS',
        DATA: [{ STATE_ID: 33, STATE_NAME: 'Tamil Nadu' }],
      });

    expect(countries).toEqual([{ id: '1', name: 'India' }]);
    expect(states).toEqual([{ id: '33', name: 'Tamil Nadu' }]);
  });

  it('submits the onboarding payload to the seller insert endpoint', () => {
    const payload: SellerOnboardingPayload = {
      BUSINESS_NAME: 'ABC Electronics',
      SELLER_NAME: 'Arun Kumar',
      BUSINESS_TYPE: 'Retail',
      EMAIL: 'arun@example.com',
      MOBILE_NUMBER: 9675433210,
      BUSINESS_ADDRESS: 'Anna Salai',
      CITY: 'Chennai',
      STATE: 'Tamil Nadu',
      COUNTRY: 'India',
      PINCODE: '600002',
      GST_NUMBER: '33ABCDE1234F1Z5',
      PAN_NUMBER: 'ABCDE1234F',
      BUSINESS_REGISTRATION_NUMBER: 'REG1001',
      CONTACT_PERSON_NAME: 'Arun Kumar',
      CONTACT_PERSON_MOBILE: 9876543210,
      CONTACT_PERSON_EMAIL: 'arun@example.com',
      USER_NAME: 'arun_seller',
      USER_PASSWORD: 'Seller@123',
      CREATED_BY: 1,
    };
    let result: void | undefined;
    service.submit(payload).subscribe((response) => (result = response));

    http
      .expectOne(
        (request) => request.url.endsWith('/seller_onboarding/insert') && request.method === 'POST',
      )
      .flush({ STATUS: 'SUCCESS', MESSAGE: 'Seller created successfully' });

    expect(result).toBeUndefined();
  });

  it('surfaces unsuccessful lookup responses as errors', () => {
    let error: unknown;
    service.getStates('1').subscribe({ error: (result: unknown) => (error = result) });
    http
      .expectOne((request) => request.url.endsWith('/state/get'))
      .flush({ STATUS: 'FAILURE', MESSAGE: 'State service unavailable' });
    expect(error).toEqual(new Error('State service unavailable'));
  });
});
