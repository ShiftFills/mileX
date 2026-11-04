import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { SellerVerificationService } from './seller-verification.service';

describe('SellerVerificationService', () => {
  let service: SellerVerificationService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api' },
      ],
    });
    service = TestBed.inject(SellerVerificationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('keeps the seller ID separate from the verification row ID', () => {
    let result: unknown;
    service.getSellers(1, 6).subscribe((page) => (result = page));

    http.expectOne(
      (request) =>
        request.url === 'https://api.example.test/api/seller_verification/get' &&
        request.params.get('LIMIT') === '6' &&
        request.params.get('OFFSET') === '0',
    ).flush({
      status: 'SUCCESS',
      data: [
        {
          VERIFICATION_ID: 18,
          SELLER_ID: 6,
          DOCUMENT_ID: 12,
          BANK_DETAIL_ID: 14,
          SELLER_NAME: 'Seller',
          BUSINESS_NAME: 'Example Business',
        },
      ],
      total: 1,
    });

    expect(result).toMatchObject({
      items: [{ id: 18, sellerId: 6, documentId: 12, bankDetailId: 14 }],
      total: 1,
    });
  });

  it('rejects listing rows without a seller ID needed to open the edit flow', () => {
    let error: unknown;
    service.getSellers(1, 6).subscribe({ error: (result: unknown) => (error = result) });

    http
      .expectOne((request) => request.url.endsWith('/seller_verification/get'))
      .flush({
        status: 'SUCCESS',
        data: [{ VERIFICATION_ID: 18, SELLER_NAME: 'Seller' }],
      });

    expect(error).toEqual(
      new Error('The seller verification API returned a seller with an invalid SELLER_ID.'),
    );
  });
});
