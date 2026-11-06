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
        request.params.get('SELLER_ID') === '-1' &&
        request.params.get('VERIFICATION_STATUS') === 'PENDING' &&
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

  it('requests the selected verification status and maps the boolean success envelope', () => {
    let result: unknown;
    service.getSellers(2, 5, 'Approved').subscribe((page) => (result = page));

    http.expectOne((request) =>
      request.url.endsWith('/seller_verification/get') &&
      request.params.get('SELLER_ID') === '-1' &&
      request.params.get('VERIFICATION_STATUS') === 'APPROVED' &&
      request.params.get('LIMIT') === '5' &&
      request.params.get('OFFSET') === '5',
    ).flush({
      status: true,
      message: 'Seller details fetched successfully',
      data: [{
        VERIFICATION_ID: 19,
        SELLER_ID: 7,
        SELLER_NAME: 'Approved Seller',
        VERIFICATION_STATUS: 'APPROVED',
      }],
      pagination: { totalRecords: 6 },
    });

    expect(result).toMatchObject({
      items: [{ id: 19, sellerId: 7, sellerName: 'Approved Seller', status: 'Approved' }],
      total: 6,
      hasNext: false,
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

  it('loads details for the selected seller and maps the returned seller record', () => {
    let result: unknown;
    service.getSellerDetails(59, 'Pending').subscribe((seller) => (result = seller));

    http.expectOne((request) =>
      request.url.endsWith('/seller_verification/get') &&
      request.params.get('SELLER_ID') === '59' &&
      request.params.get('VERIFICATION_STATUS') === 'PENDING' &&
      request.params.get('LIMIT') === null &&
      request.params.get('OFFSET') === null,
    ).flush({
      status: true,
      message: 'Seller details fetched successfully',
      data: [{
        VERIFICATION_ID: 118,
        SELLER_ID: 59,
        SELLER_NAME: 'Selected Seller',
        BUSINESS_NAME: 'Selected Business',
        VERIFICATION_STATUS: 'PENDING',
        GST_CERTIFICATE: 'gst certificate.pdf',
        PAN_CARD: 'pan.pdf',
        BUSINESS_REGISTRATION_CERTIFICATE: 'registration.pdf',
        ADDRESS_PROOF: null,
        OWNER_DIRECTOR_ID_PROOF: 'owner-id.pdf',
        BANK_PROOF: 'bank.pdf',
        OTHER_SUPPORTING_DOCUMENT: null,
      }],
    });

    expect(result).toMatchObject({
      id: 118,
      sellerId: 59,
      sellerName: 'Selected Seller',
      businessName: 'Selected Business',
      documents: [
        { name: 'GST Certificate', fileName: 'gst certificate.pdf', url: '/uploads/gst%20certificate.pdf' },
        { name: 'PAN Card', fileName: 'pan.pdf', url: '/uploads/pan.pdf' },
        { name: 'Business Registration Certificate', fileName: 'registration.pdf', url: '/uploads/registration.pdf' },
        { name: 'Address Proof', fileName: 'Not Available', url: '' },
        { name: 'Owner / Director ID Proof', fileName: 'owner-id.pdf', url: '/uploads/owner-id.pdf' },
        { name: 'Bank Proof', fileName: 'bank.pdf', url: '/uploads/bank.pdf' },
        { name: 'Other Supporting Document', fileName: 'Not Available', url: '' },
      ],
    });
  });

  it('returns null for a successful empty details response', () => {
    let result: unknown;
    service.getSellerDetails(59, 'Pending').subscribe((seller) => (result = seller));
    http.expectOne((request) => request.params.get('SELLER_ID') === '59').flush({ status: true, data: [] });
    expect(result).toBeNull();
  });
});
