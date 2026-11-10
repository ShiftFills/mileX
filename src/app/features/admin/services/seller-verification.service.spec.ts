import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { SellerVerificationRecord, SellerVerificationService } from './seller-verification.service';

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

    http
      .expectOne(
        (request) =>
          request.url === 'https://api.example.test/api/seller_verification/get' &&
          request.params.get('BUSINESS_TYPE_ID') === '-1' &&
          request.params.get('SELLER_ID') === '-1' &&
          request.params.get('DOCUMENT_VERIFICATION_STATUS') === 'PENDING' &&
          request.params.get('LIMIT') === '6' &&
          request.params.get('OFFSET') === '0',
      )
      .flush({
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

  it('sends selected business type and document status with date and pagination filters', () => {
    let result: unknown;
    service.getSellers(2, 5, 30, 42, 'Approved').subscribe((page) => (result = page));

    http
      .expectOne(
        (request) =>
          request.url.endsWith('/seller_verification/get') &&
          request.params.get('SELLER_ID') === '-1' &&
          request.params.get('BUSINESS_TYPE_ID') === '42' &&
          request.params.get('DOCUMENT_VERIFICATION_STATUS') === 'APPROVED' &&
          request.params.get('DAYS') === '30' &&
          request.params.get('STATUS_ID') === null &&
          request.params.get('VERIFICATION_STATUS') === null &&
          request.params.get('LIMIT') === '5' &&
          request.params.get('OFFSET') === '5',
      )
      .flush({
        status: true,
        message: 'Seller details fetched successfully',
        data: [
          {
            VERIFICATION_ID: 19,
            SELLER_ID: 7,
            SELLER_NAME: 'Approved Seller',
            VERIFICATION_STATUS: 'APPROVED',
          },
        ],
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
    service.getSellerDetails(59).subscribe((seller) => (result = seller));

    http
      .expectOne(
        (request) =>
          request.url.endsWith('/seller_verification/get') &&
          request.params.get('SELLER_ID') === '59' &&
          request.params.get('VERIFICATION_STATUS') === null &&
          request.params.get('LIMIT') === null &&
          request.params.get('OFFSET') === null,
      )
      .flush({
        status: true,
        message: 'Seller details fetched successfully',
        data: [
          {
            VERIFICATION_ID: 118,
            SELLER_ID: 59,
            SELLER_NAME: 'Selected Seller',
            BUSINESS_NAME: 'Selected Business',
            VERIFICATION_STATUS: 'PENDING',
            SELLER_STATUS: 'APPROVED',
            DOCUMENT_VERIFICATION_STATUS: 'APPROVED',
            DOCUMENT_STATUS: 'REJECTED',
            DOCUMENT_ID: 12,
            GST_CERTIFICATE: 'gst certificate.pdf',
            GST_CERTIFICATE_DOCUMENT_VERIFICATION_STATUS: 'APPROVED',
            PAN_CARD: 'pan.pdf',
            PAN_CARD_DOCUMENT_VERIFICATION_STATUS: 'REJECTED',
            BUSINESS_REGISTRATION_CERTIFICATE: 'registration.pdf',
            ADDRESS_PROOF: null,
            OWNER_DIRECTOR_ID_PROOF: 'owner-id.pdf',
            BANK_PROOF: 'bank.pdf',
            OTHER_SUPPORTING_DOCUMENT: null,
          },
        ],
      });

    expect(result).toMatchObject({
      id: 118,
      sellerId: 59,
      sellerName: 'Selected Seller',
      businessName: 'Selected Business',
      status: 'Approved',
      documentVerificationStatus: 'Approved',
    });
    const mappedSeller = result as SellerVerificationRecord;
    expect(
      mappedSeller.documents.find((document) => document.proofType === 'GST_CERTIFICATE'),
    ).toMatchObject({ required: true, status: 'Approved' });
    expect(
      mappedSeller.documents.find((document) => document.proofType === 'PAN_CARD'),
    ).toMatchObject({ required: true, status: 'Rejected' });
    expect(
      mappedSeller.documents.find((document) => document.proofType === 'OTHER_SUPPORTING_DOCUMENT'),
    ).toMatchObject({ required: false });
    expect(
      mappedSeller.documents.find(
        (document) => document.proofType === 'BUSINESS_REGISTRATION_CERTIFICATE',
      ),
    ).toMatchObject({ required: true, status: 'Pending' });
  });

  it('maps API seller approval statuses to the seller status model', () => {
    let approved: SellerVerificationRecord | null | undefined;
    let rejected: SellerVerificationRecord | null | undefined;
    service.getSellerDetails(59).subscribe((seller) => (approved = seller));
    service.getSellerDetails(60).subscribe((seller) => (rejected = seller));

    http
      .expectOne((request) => request.params.get('SELLER_ID') === '59')
      .flush({
        status: true,
        data: [
          {
            SELLER_ID: 59,
            VERIFICATION_STATUS: 'PENDING',
            SELLER_STATUS: 'APPROVED',
            DOCUMENT_STATUS: 'APPROVED',
          },
        ],
      });
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '60')
      .flush({
        status: true,
        data: [{ SELLER_ID: 60, SELLER_STATUS: 'REJECTED' }],
      });

    expect(approved?.status).toBe('Approved');
    expect(approved?.documentVerificationStatus).toBe('Approved');
    expect(rejected?.status).toBe('Rejected');
  });

  it('maps each document verification status and rejection reason from the API response', () => {
    let result: unknown;
    service.getSellerDetails(59).subscribe((seller) => (result = seller));
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '59')
      .flush({
        status: true,
        data: [
          {
            VERIFICATION_ID: 118,
            SELLER_ID: 59,
            VERIFICATION_STATUS: 'PENDING',
            DOCUMENT_ID: 12,
            GST_CERTIFICATE: 'gst.pdf',
            GST_CERTIFICATE_DOCUMENT_VERIFICATION_STATUS: 'REJECTED',
            GST_CERTIFICATE_REJECTION_REASON: 'Missing stamp',
            PAN_CARD: 'pan.pdf',
            PAN_CARD_DOCUMENT_VERIFICATION_STATUS: 'APPROVED',
          },
        ],
      });

    const documents = (result as SellerVerificationRecord | null)?.documents;
    expect(documents?.find((document) => document.proofType === 'GST_CERTIFICATE')).toMatchObject({
      status: 'Rejected',
      rejectionReason: 'Missing stamp',
    });
    expect(documents?.find((document) => document.proofType === 'PAN_CARD')).toMatchObject({
      status: 'Approved',
    });
  });

  it('maps the API individual status fields and keeps a missing optional document out of the gate', () => {
    let result: unknown;
    service.getSellerDetails(59).subscribe((seller) => (result = seller));
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '59')
      .flush({
        status: true,
        data: [
          {
            VERIFICATION_ID: 118,
            SELLER_ID: 59,
            SELLER_STATUS: 'PENDING',
            DOCUMENT_VERIFICATION_STATUS: 'APPROVED',
            DOCUMENT_STATUS: 'REJECTED',
            DOCUMENT_ID: 12,
            GST_CERTIFICATE: 'gst.pdf',
            GST_CERTIFICATION_STATUS: 'APPROVED',
            PAN_CARD: 'pan.pdf',
            PAN_CARD_STATUS: 'PENDING',
            BUSINESS_REGISTRATION_CERTIFICATE_STATUS: 'REJECTED',
            ADDRESS_PROOF_STATUS: 'APPROVED',
            OWNER_DIRECTOR_ID_PROOF_STATUS: 'APPROVED',
            BANK_PROOF_STATUS: 'APPROVED',
            OTHER_SUPPORTING_DOCUMENT: null,
            BUSINESS_REGISTRATION_CERTIFICATE: null,
          },
        ],
      });

    const documents = (result as SellerVerificationRecord | null)?.documents;
    const seller = result as SellerVerificationRecord;
    expect(seller.status).toBe('Pending');
    expect(seller.documentVerificationStatus).toBe('Approved');
    expect(documents?.find((document) => document.proofType === 'GST_CERTIFICATE')?.status).toBe(
      'Approved',
    );
    expect(documents?.find((document) => document.proofType === 'PAN_CARD')?.status).toBe(
      'Pending',
    );
    expect(
      documents?.find((document) => document.proofType === 'BUSINESS_REGISTRATION_CERTIFICATE'),
    ).toMatchObject({ status: 'Rejected', fileName: 'Not Available' });
    expect(documents?.find((document) => document.proofType === 'ADDRESS_PROOF')?.status).toBe(
      'Approved',
    );
    expect(
      documents?.find((document) => document.proofType === 'OWNER_DIRECTOR_ID_PROOF')?.status,
    ).toBe('Approved');
    expect(documents?.find((document) => document.proofType === 'BANK_PROOF')?.status).toBe(
      'Approved',
    );
    const optionalDocument = documents?.find(
      (document) => document.proofType === 'OTHER_SUPPORTING_DOCUMENT',
    );
    expect(optionalDocument).toMatchObject({ required: false, fileName: 'Not Available' });
    expect(optionalDocument?.status).toBeUndefined();
  });

  it('defaults a null or unexpected document verification status to Pending', () => {
    let result: unknown;
    service.getSellerDetails(59).subscribe((seller) => (result = seller));
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '59')
      .flush({
        status: true,
        data: [
          {
            VERIFICATION_ID: 118,
            SELLER_ID: 59,
            VERIFICATION_STATUS: 'APPROVED',
            DOCUMENT_VERIFICATION_STATUS: null,
          },
        ],
      });

    expect(result).toMatchObject({
      status: 'Approved',
      documentVerificationStatus: 'Pending',
    });
  });

  it('updates seller approval with the dynamic seller ID and approved decision', () => {
    let result: unknown;
    service
      .updateSellerDecision({
        SELLER_ID: 7,
        DECISION: 'APPROVED',
        UPDATED_BY: 1,
      })
      .subscribe((message) => (result = message));

    const request = http.expectOne('https://api.example.test/api/seller_approve_reject/update');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      SELLER_ID: 7,
      DECISION: 'APPROVED',
      UPDATED_BY: 1,
    });
    request.flush({ status: 'SUCCESS', message: 'Seller approved.' });

    expect(result).toBe('Seller approved.');
  });

  it('updates seller rejection and surfaces API failures', () => {
    let error: unknown;
    service
      .updateSellerDecision({
        SELLER_ID: 9,
        DECISION: 'REJECTED',
        UPDATED_BY: 1,
      })
      .subscribe({ error: (result: unknown) => (error = result) });

    const request = http.expectOne('https://api.example.test/api/seller_approve_reject/update');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      SELLER_ID: 9,
      DECISION: 'REJECTED',
      UPDATED_BY: 1,
    });
    request.flush({ status: false, message: 'Seller cannot be rejected.' });

    expect(error).toEqual(new Error('Seller cannot be rejected.'));
  });

  it('approves a selected proof using its document ID and proof type', () => {
    let result: unknown;
    service
      .approveDocument({
        DOCUMENT_ID: 12,
        PROOF_TYPE: 'GST_CERTIFICATE',
        UPDATED_BY: 1,
      })
      .subscribe((message) => (result = message));

    const request = http.expectOne('https://api.example.test/api/document_verification/approve');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      DOCUMENT_ID: 12,
      PROOF_TYPE: 'GST_CERTIFICATE',
      UPDATED_BY: 1,
    });
    request.flush({ status: true, message: 'Document approved.' });

    expect(result).toBe('Document approved.');
  });

  it('rejects a selected proof with a trimmed mandatory reason', () => {
    let result: unknown;
    service
      .rejectDocument({
        DOCUMENT_ID: 14,
        PROOF_TYPE: 'PAN_CARD',
        REJECTION_REASON: '  PAN copy is unreadable  ',
        UPDATED_BY: 1,
      })
      .subscribe((message) => (result = message));

    const request = http.expectOne('https://api.example.test/api/document_verification/reject');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      DOCUMENT_ID: 14,
      PROOF_TYPE: 'PAN_CARD',
      REJECTION_REASON: 'PAN copy is unreadable',
      UPDATED_BY: 1,
    });
    request.flush({ status: 'SUCCESS', message: 'Document rejected.' });

    expect(result).toBe('Document rejected.');
  });

  it('rejects an empty rejection reason and API failure envelopes', () => {
    expect(() =>
      service.rejectDocument({
        DOCUMENT_ID: 12,
        PROOF_TYPE: 'GST_CERTIFICATE',
        REJECTION_REASON: ' ',
        UPDATED_BY: 1,
      }),
    ).toThrowError('A rejection reason is required.');

    let error: unknown;
    service
      .approveDocument({
        DOCUMENT_ID: 12,
        PROOF_TYPE: 'GST_CERTIFICATE',
        UPDATED_BY: 1,
      })
      .subscribe({ error: (result: unknown) => (error = result) });
    http
      .expectOne('https://api.example.test/api/document_verification/approve')
      .flush({ status: false, message: 'Document is already approved.' });

    expect(error).toEqual(new Error('Document is already approved.'));
  });

  it('returns null for a successful empty details response', () => {
    let result: unknown;
    service.getSellerDetails(59).subscribe((seller) => (result = seller));
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '59')
      .flush({ status: true, data: [] });
    expect(result).toBeNull();
  });
});
