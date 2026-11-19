import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '@core/config/api.config';
import { AuthService } from '@core/services/auth.service';
import { SellerVerificationRecord, SellerVerificationService } from './seller-verification.service';

function tokenFor(userId: number): string {
  return `header.${btoa(JSON.stringify({ USER_ID: userId })).replace(/=/g, '')}.signature`;
}

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
    TestBed.inject(AuthService).setSession(
      { id: '60', email: '', firstName: 'Admin', lastName: '' },
      tokenFor(60),
    );
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
    let statusAliasApproved: SellerVerificationRecord | null | undefined;
    let activeSeller: SellerVerificationRecord | null | undefined;
    let lowercaseActiveSeller: SellerVerificationRecord | null | undefined;
    service.getSellerDetails(59).subscribe((seller) => (approved = seller));
    service.getSellerDetails(60).subscribe((seller) => (rejected = seller));
    service.getSellerDetails(61).subscribe((seller) => (statusAliasApproved = seller));
    service.getSellerDetails(62).subscribe((seller) => (activeSeller = seller));
    service.getSellerDetails(63).subscribe((seller) => (lowercaseActiveSeller = seller));

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
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '61')
      .flush({
        status: true,
        data: [{ SELLER_ID: 61, STATUS: 'APPROVED' }],
      });
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '62')
      .flush({
        status: true,
        data: [{ SELLER_ID: 62, SELLER_STATUS: 'ACTIVE' }],
      });
    http
      .expectOne((request) => request.params.get('SELLER_ID') === '63')
      .flush({
        status: true,
        data: [{ SELLER_ID: 63, SELLER_STATUS: 'active' }],
      });

    expect(approved?.status).toBe('Approved');
    expect(approved?.documentVerificationStatus).toBe('Approved');
    expect(rejected?.status).toBe('Rejected');
    expect(statusAliasApproved?.status).toBe('Approved');
    expect(activeSeller?.status).toBe('Approved');
    expect(lowercaseActiveSeller?.status).toBe('Pending');
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
      })
      .subscribe((message) => (result = message));

    const request = http.expectOne('https://api.example.test/api/seller_approve_reject/update');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      SELLER_ID: 7,
      DECISION: 'APPROVED',
      UPDATED_BY: 60,
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
      })
      .subscribe({ error: (result: unknown) => (error = result) });

    const request = http.expectOne('https://api.example.test/api/seller_approve_reject/update');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      SELLER_ID: 9,
      DECISION: 'REJECTED',
      UPDATED_BY: 60,
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
      })
      .subscribe((message) => (result = message));

    const request = http.expectOne('https://api.example.test/api/document_verification/approve');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      DOCUMENT_ID: 12,
      PROOF_TYPE: 'GST_CERTIFICATE',
      UPDATED_BY: 60,
    });
    request.flush({ status: true, message: 'Document approved.' });

    expect(result).toBe('Document approved.');
  });

  it('does not send review requests when the access token has no user ID', () => {
    TestBed.inject(AuthService).setSession(
      { id: '60', email: '', firstName: 'Admin', lastName: '' },
      'invalid-token',
    );
    let failure: unknown;
    service
      .approveDocument({ DOCUMENT_ID: 12, PROOF_TYPE: 'GST_CERTIFICATE' })
      .subscribe({ error: (error: unknown) => (failure = error) });

    expect(failure).toEqual(
      new Error('A valid authenticated user ID is required to review documents.'),
    );
    http.expectNone((request) => request.url.endsWith('/document_verification/approve'));
  });

  it('rejects a selected proof with a trimmed mandatory reason', () => {
    let result: unknown;
    service
      .rejectDocument({
        DOCUMENT_ID: 14,
        PROOF_TYPE: 'PAN_CARD',
        REJECTION_REASON: '  PAN copy is unreadable  ',
      })
      .subscribe((message) => (result = message));

    const request = http.expectOne('https://api.example.test/api/document_verification/reject');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      DOCUMENT_ID: 14,
      PROOF_TYPE: 'PAN_CARD',
      REJECTION_REASON: 'PAN copy is unreadable',
      UPDATED_BY: 60,
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
      }),
    ).toThrowError('A rejection reason is required.');

    let error: unknown;
    service
      .approveDocument({
        DOCUMENT_ID: 12,
        PROOF_TYPE: 'GST_CERTIFICATE',
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

  // CHANGED (new): the Seller Details dialog fields, read with the seller onboarding / bank details column names.
  it('maps the business, contact person, bank and status details of the selected seller', () => {
    let result: SellerVerificationRecord | null | undefined;
    service.getSellerDetails(45).subscribe((seller) => (result = seller));

    http.expectOne((request) =>
      request.url === 'https://api.example.test/api/seller_verification/get' && request.params.get('SELLER_ID') === '45',
    ).flush({
      status: 'SUCCESS',
      data: [{
        SELLER_ID: 45, SELLER_NAME: 'Rahul', BUSINESS_NAME: 'Ocean Electronics',
        BUSINESS_TYPE: 2, BUSINESS_TYPE_NAME: 'Partnership', BUSINESS_ADDRESS: ' 12 Market Road ', CITY: 'Chennai',
        STATE: 31, COUNTRY: 1, PINCODE: '600017', BUSINESS_REGISTRATION_NUMBER: 'REG-778',
        CONTACT_PERSON_NAME: 'Priya', CONTACT_PERSON_MOBILE: 9876500000, CONTACT_PERSON_EMAIL: 'priya@example.com',
        ACCOUNT_HOLDER_NAME: 'Ocean Electronics', BANK_NAME: 'State Bank of India', BRANCH_NAME: 'T Nagar',
        ACCOUNT_NUMBER: '123456789012', IFSC_CODE: 'SBIN0001234', ACCOUNT_TYPE_ID: 2,
        DOCUMENT_VERIFICATION_STATUS: 'PENDING', DOCUMENT_STATUS: 'SUBMITTED', REJECTION_REASON: null,
        VERIFICATION_REMARKS: '', CREATED_BY: 1, UPDATED_BY: 1, CREATED_AT: '2026-11-19T10:00:00Z',
      }],
    });

    expect(result?.details).toEqual({
      businessType: 'Partnership', businessAddress: '12 Market Road', city: 'Chennai', state: '31', country: '1',
      pincode: '600017', registrationNumber: 'REG-778',
      contactPersonName: 'Priya', contactPersonMobile: '9876500000', contactPersonEmail: 'priya@example.com',
      accountHolderName: 'Ocean Electronics', bankName: 'State Bank of India', branchName: 'T Nagar',
      accountNumber: '123456789012', ifscCode: 'SBIN0001234', accountType: '2',
      documentStatus: 'SUBMITTED', rejectionReason: '',
    });
  });
});
