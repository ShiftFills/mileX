import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@core/services/auth.service';
import {
  SellerAccountRecord,
  SellerOnboardingPayload,
  SellerOnboardingService,
} from './seller-onboarding.service';

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

  it('submits onboarding and returns the seller IDs from its response', () => {
    const payload: SellerOnboardingPayload = {
      BUSINESS_NAME: 'ABC Electronics',
      SELLER_NAME: 'Arun Kumar',
      BUSINESS_TYPE: 13,
      EMAIL: 'arun@example.com',
      MOBILE_NUMBER: 9675433210,
      BUSINESS_ADDRESS: 'Anna Salai',
      CITY: 'Chennai',
      STATE: 33,
      COUNTRY: 1,
      PINCODE: '600002',
      GST_NUMBER: '33ABCDE1234F1Z5',
      PAN_NUMBER: 'ABCDE1234F',
      BUSINESS_REGISTRATION_NUMBER: 'REG1001',
      CONTACT_PERSON_NAME: 'Arun Kumar',
      CONTACT_PERSON_MOBILE: 9876543210,
      CONTACT_PERSON_EMAIL: 'arun@example.com',
      USER_NAME: 'arun_seller',
      USER_PASSWORD: 'Seller@123',
      // CHANGED: CREATED_BY removed from the seller_onboarding/insert payload.
    };
    let result: void | undefined;
    let sellerResult: unknown;
    service.submit(payload).subscribe((response) => (result = response));
    service.submitWithResult(payload).subscribe((response) => (sellerResult = response));

    const requests = http.match(
      (request) => request.url.endsWith('/seller_onboarding/insert') && request.method === 'POST',
    );
    expect(requests).toHaveLength(2);
    requests[0].flush({ STATUS: 'SUCCESS', MESSAGE: 'Seller created successfully' });
    requests[1].flush({
      status: true,
      SELLER_ID: 42,
      USER_ID: 2,
    });

    expect(result).toBeUndefined();
    expect(sellerResult).toEqual({ sellerId: 42, userId: 2 });
  });

  it('rejects onboarding success responses missing USER_ID required for later updates', () => {
    let result: unknown;
    let error: unknown;
    service.submitWithResult({} as SellerOnboardingPayload).subscribe({
      next: (response) => (result = response),
      error: (response: unknown) => (error = response),
    });

    http
      .expectOne(
        (request) => request.url.endsWith('/seller_onboarding/insert') && request.method === 'POST',
      )
      .flush({
        status: true,
        data: { SELLER_ID: 42 },
      });

    expect(result).toBeUndefined();
    expect(error).toEqual(
      new Error('The seller onboarding API did not return a valid USER_ID required for updates.'),
    );
  });

  it('posts file names or nulls with the seller and creator IDs as JSON', () => {
    let result: unknown;
    service
      .uploadDocuments(
        {
          gstCertificate: new File(['gst'], 'gst-certificate.pdf'),
          panCard: new File(['pan'], 'pan-card.png'),
          registrationCertificate: new File(['registration'], 'registration.pdf'),
          addressProof: new File(['address'], 'address-proof.jpg'),
          ownerIdProof: new File(['owner'], 'owner-id.pdf'),
          bankProof: new File(['bank'], 'bank-proof.pdf'),
        },
        42,
      )
      .subscribe((response) => (result = response));

    const request = http.expectOne(
      (candidate) =>
        candidate.url.endsWith('/seller_docs/insert') && candidate.method === 'POST',
    );
    expect(request.request.body).toEqual({
      GST_CERTIFICATE: 'gst-certificate.pdf',
      PAN_CARD: 'pan-card.png',
      BUSINESS_REGISTRATION_CERTIFICATE: 'registration.pdf',
      ADDRESS_PROOF: 'address-proof.jpg',
      OWNER_DIRECTOR_ID_PROOF: 'owner-id.pdf',
      BANK_PROOF: 'bank-proof.pdf',
      OTHER_SUPPORTING_DOCUMENT: null,
      SELLER_ID: 42,
      // CHANGED: CREATED_BY removed from the seller_docs/insert payload.
    });
    request.flush({ status: true, message: 'Documents saved', DOCUMENT_ID: 17 });

    expect(result).toEqual({ documentId: 17, message: 'Documents saved' });
  });

  it('posts null when a document was not uploaded', () => {
    let result: unknown;
    service.uploadDocuments({}, 3).subscribe((response) => (result = response));

    const request = http.expectOne(
      (candidate) =>
        candidate.url.endsWith('/seller_docs/insert') && candidate.method === 'POST',
    );
    expect(request.request.body).toEqual({
      GST_CERTIFICATE: null,
      PAN_CARD: null,
      BUSINESS_REGISTRATION_CERTIFICATE: null,
      ADDRESS_PROOF: null,
      OWNER_DIRECTOR_ID_PROOF: null,
      BANK_PROOF: null,
      OTHER_SUPPORTING_DOCUMENT: null,
      SELLER_ID: 3,
      // CHANGED: CREATED_BY removed from the seller_docs/insert payload.
    });
    request.flush({ status: true, DOCUMENT_ID: 18 });

    expect(result).toEqual({
      documentId: 18,
      message: 'Seller documents uploaded successfully.',
    });
  });

  it('rejects a successful document insert response when DOCUMENT_ID is missing', () => {
    let result: unknown;
    let error: unknown;
    service.uploadDocuments({}, 42).subscribe({
      next: (response) => (result = response),
      error: (response: unknown) => (error = response),
    });

    http
      .expectOne((candidate) => candidate.url.endsWith('/seller_docs/insert'))
      .flush({ status: true, message: 'Documents inserted successfully.' });

    expect(result).toBeUndefined();
    expect(error).toEqual(
      new Error('The seller documents insert response did not return a valid DOCUMENT_ID.'),
    );
  });

  it('rejects an explicit document insert failure response', () => {
    let result: unknown;
    service.uploadDocuments({}, 42).subscribe({
      next: (response) => (result = response),
      error: (error: unknown) => (result = error),
    });

    http
      .expectOne((candidate) => candidate.url.endsWith('/seller_docs/insert'))
      .flush({ status: 'FAILURE', message: 'Document insert failed.' });

    expect(result).toEqual(new Error('Document insert failed.'));
  });

  it('posts bank details with the seller and creator IDs', () => {
    let result: unknown;
    service
      .saveBankDetails(
        {
          ACCOUNT_HOLDER_NAME: 'Seller',
          BANK_NAME: 'Example Bank',
          BRANCH_NAME: 'Central',
          ACCOUNT_NUMBER: '123456789',
          CONFIRM_ACCOUNT_NUMBER: '123456789',
          IFSC_CODE: 'ABCD0123456',
          ACCOUNT_TYPE: 2,
        },
        42,
      )
      .subscribe((response) => (result = response));

    const request = http.expectOne(
      (candidate) =>
        candidate.url.endsWith('/seller_bank_details/insert') && candidate.method === 'POST',
    );
    expect(request.request.body).toEqual({
      ACCOUNT_HOLDER_NAME: 'Seller',
      BANK_NAME: 'Example Bank',
      BRANCH_NAME: 'Central',
      ACCOUNT_NUMBER: '123456789',
      CONFIRM_ACCOUNT_NUMBER: '123456789',
      IFSC_CODE: 'ABCD0123456',
      ACCOUNT_TYPE: 2,
      SELLER_ID: 42,
      // CHANGED: CREATED_BY removed from the seller_bank_details/insert payload.
    });
    request.flush({ status: true, message: 'Bank details saved', BANK_DETAIL_ID: 24 });

    expect(result).toEqual({ bankDetailId: 24, message: 'Bank details saved' });
  });

  it('loads existing seller, document, and bank records using their API identifiers', () => {
    let seller: unknown;
    let documents: unknown;
    let bankDetails: unknown;
    service.getSeller(42).subscribe((record) => (seller = record));
    service.getSellerDocuments(7, 42).subscribe((record) => (documents = record));
    service.getSellerBankDetails(9, 42).subscribe((record) => (bankDetails = record));

    http.expectOne(
      (request) =>
        request.url.endsWith('/seller_onboarding/get') &&
        request.params.get('SELLER_ID') === '42',
    ).flush({ STATUS: 'SUCCESS', DATA: [{ SELLER_ID: 42, USER_ID: 2 }] });
    http.expectOne(
      (request) =>
        request.url.endsWith('/seller_docs/get') &&
        request.params.get('DOCUMENT_ID') === '7',
    ).flush({ status: 'SUCCESS', data: { DOCUMENT_ID: 7, SELLER_ID: 42 } });
    http.expectOne(
      (request) =>
        request.url.endsWith('/seller_bank_details/get') &&
        request.params.get('BANK_DETAIL_ID') === '9' &&
        request.params.get('SELLER_ID') === '42',
    ).flush({ STATUS: 'SUCCESS', DATA: { BANK_DETAIL_ID: 9, SELLER_ID: 42 } });

    expect(seller).toEqual({ SELLER_ID: 42, USER_ID: 2 });
    expect(documents).toEqual({ DOCUMENT_ID: 7, SELLER_ID: 42 });
    expect(bankDetails).toEqual({ BANK_DETAIL_ID: 9, SELLER_ID: 42 });
  });

  it('resolves a seller and approval status using the logged-in USER_ID', () => {
    let seller: unknown;
    service.getSellerForUser(8).subscribe((record) => (seller = record));

    http
      .expectOne(
        (request) =>
          request.url.endsWith('/seller_onboarding/get') &&
          request.params.get('USER_ID') === '8' &&
          request.params.get('SELLER_ID') === null,
      )
      .flush({
        STATUS: 'SUCCESS',
        DATA: [
          {
            USER_ID: 8,
            SELLER_ID: 42,
            SELLER_STATUS: 'ACTIVE',
            DOCUMENT_ID: 7,
            BANK_DETAIL_ID: 9,
          },
        ],
      });

    expect(seller).toEqual({
      userId: 8,
      sellerId: 42,
      sellerStatus: 'ACTIVE',
      documentId: 7,
      bankDetailId: 9,
    });
  });

  it('shares and caches seller lookup results for repeated guard subscriptions in one session', () => {
    let first: unknown;
    let second: unknown;
    service.getSellerForUser(8).subscribe((record) => (first = record));
    service.getSellerForUser(8).subscribe((record) => (second = record));

    http
      .expectOne(
        (request) =>
          request.url.endsWith('/seller_onboarding/get') &&
          request.params.get('USER_ID') === '8',
      )
      .flush({
        STATUS: 'SUCCESS',
        DATA: [{ USER_ID: 8, SELLER_ID: 42, SELLER_STATUS: 'ACTIVE' }],
      });

    expect(first).toEqual({ userId: 8, sellerId: 42, sellerStatus: 'ACTIVE' });
    expect(second).toEqual(first);

    let cached: unknown;
    service.getSellerForUser(8).subscribe((record) => (cached = record));
    expect(cached).toEqual(first);
    http.expectNone((request) => request.url.endsWith('/seller_onboarding/get'));
  });

  it('fetches seller status again when the authenticated access token changes', () => {
    const auth = TestBed.inject(AuthService);
    let status: SellerAccountRecord | null | undefined;

    auth.setSession(
      { id: '8', email: '', firstName: 'Seller', lastName: '', userType: 'SELLER' },
      'first-token',
    );
    service.getSellerForUser(8).subscribe((record) => (status = record));
    http
      .expectOne((request) => request.params.get('USER_ID') === '8')
      .flush({ STATUS: 'SUCCESS', DATA: [{ USER_ID: 8, SELLER_ID: 42, SELLER_STATUS: 'PENDING' }] });
    expect(status?.sellerStatus).toBe('PENDING');

    auth.setSession(
      { id: '8', email: '', firstName: 'Seller', lastName: '', userType: 'SELLER' },
      'second-token',
    );
    service.getSellerForUser(8).subscribe((record) => (status = record));
    http
      .expectOne((request) => request.params.get('USER_ID') === '8')
      .flush({ STATUS: 'SUCCESS', DATA: [{ USER_ID: 8, SELLER_ID: 42, SELLER_STATUS: 'ACTIVE' }] });

    expect(status?.sellerStatus).toBe('ACTIVE');
  });

  it('returns no seller record when the USER_ID lookup has no matches', () => {
    let seller: unknown = 'not loaded';
    service.getSellerForUser(8).subscribe((record) => (seller = record));
    http
      .expectOne((request) => request.params.get('USER_ID') === '8')
      .flush({ STATUS: 'SUCCESS', DATA: [] });

    expect(seller).toBeNull();
  });

  it('rejects a seller lookup response associated with a different USER_ID', () => {
    let failure: unknown;
    service.getSellerForUser(8).subscribe({
      error: (error: unknown) => (failure = error),
    });
    http
      .expectOne((request) => request.params.get('USER_ID') === '8')
      .flush({ STATUS: 'SUCCESS', DATA: [{ USER_ID: 9, SELLER_ID: 42 }] });

    expect(failure).toEqual(
      new Error('The seller lookup API returned USER_ID 9 for the requested USER_ID 8.'),
    );
  });

  it('loads document and bank records with the selected seller record IDs', () => {
    let documents: unknown;
    let bankDetails: unknown;
    service.getSellerDocumentsForSeller(42, 7).subscribe((record) => (documents = record));
    service.getSellerBankDetailsForSeller(42, 9).subscribe((record) => (bankDetails = record));

    http.expectOne(
      (request) =>
        request.url.endsWith('/seller_docs/get') &&
        request.params.get('DOCUMENT_ID') === '7',
    ).flush({ STATUS: 'SUCCESS', DATA: { DOCUMENT_ID: 7, SELLER_ID: 42 } });
    http.expectOne(
      (request) =>
        request.url.endsWith('/seller_bank_details/get') &&
        request.params.get('BANK_DETAIL_ID') === '9' &&
        request.params.get('SELLER_ID') === '42',
    ).flush({ STATUS: 'SUCCESS', DATA: { BANK_DETAIL_ID: 9, SELLER_ID: 42 } });

    expect(documents).toEqual({ DOCUMENT_ID: 7, SELLER_ID: 42 });
    expect(bankDetails).toEqual({ BANK_DETAIL_ID: 9, SELLER_ID: 42 });
  });

  it('does not send related GET requests when a required record ID is missing', () => {
    const errors: string[] = [];
    service.getSellerDocumentsForSeller(42).subscribe({
      error: (error: unknown) => errors.push(error instanceof Error ? error.message : ''),
    });
    service.getSellerBankDetailsForSeller(42).subscribe({
      error: (error: unknown) => errors.push(error instanceof Error ? error.message : ''),
    });

    expect(errors).toEqual([
      'The selected seller record does not provide a DOCUMENT_ID.',
      'The selected seller record does not provide a BANK_DETAIL_ID.',
    ]);
  });

  it('rejects a document record fetched by ID when it belongs to another seller', () => {
    let error: unknown;
    service.getSellerDocuments(7, 42).subscribe({ error: (result: unknown) => (error = result) });

    http
      .expectOne((request) => request.url.endsWith('/seller_docs/get'))
      .flush({ STATUS: 'SUCCESS', DATA: { DOCUMENT_ID: 7, SELLER_ID: 49 } });

    expect(error).toEqual(
      new Error('The seller documents API returned SELLER_ID 49 for the requested SELLER_ID 42.'),
    );
  });

  it('rejects a bank-details response that does not match both requested IDs', () => {
    let error: unknown;
    service.getSellerBankDetails(9, 42).subscribe({ error: (result: unknown) => (error = result) });

    http
      .expectOne((request) => request.url.endsWith('/seller_bank_details/get'))
      .flush({ STATUS: 'SUCCESS', DATA: { BANK_DETAIL_ID: 9, SELLER_ID: 41 } });

    expect(error).toEqual(
      new Error('The seller bank details API returned SELLER_ID 41 for the requested SELLER_ID 42.'),
    );
  });

  it('updates seller details with the provided seller and user IDs', () => {
    let result: unknown;
    const payload = {
      SELLER_ID: 42,
      BUSINESS_NAME: 'ABC Electronics Updated',
      SELLER_NAME: 'Arun Kumar',
      BUSINESS_TYPE: 13,
      EMAIL: 'arun@example.com',
      MOBILE_NUMBER: 8248557656,
      BUSINESS_ADDRESS: 'Anna Salai',
      CITY: 'Chennai',
      STATE: 33,
      COUNTRY: 1,
      PINCODE: '600002',
      GST_NUMBER: '33ABCDE1234F1Z5',
      PAN_NUMBER: 'ABCPE1234F',
      BUSINESS_REGISTRATION_NUMBER: 'REG1001',
      CONTACT_PERSON_NAME: 'Arun Kumar',
      CONTACT_PERSON_MOBILE: 9876543210,
      CONTACT_PERSON_EMAIL: 'arun@example.com',
      USER_ID: 2,
      USER_NAME: 'arun_seller',
      USER_PASSWORD: 'Seller@123',
      UPDATED_BY: 1,
    };
    service.updateSeller(payload).subscribe((response) => (result = response));

    const request = http.expectOne(
      (candidate) =>
        candidate.url.endsWith('/seller_onboarding/update') && candidate.method === 'PUT',
    );
    expect(request.request.body).toEqual(payload);
    request.flush({ STATUS: 'SUCCESS', MESSAGE: 'Seller updated' });
    expect(result).toBe('Seller updated');
  });

  it('updates documents with document and seller IDs and bank details with both record IDs', () => {
    let documentResult: unknown;
    let bankResult: unknown;
    const documentPayload = {
      DOCUMENT_ID: 7,
      GST_CERTIFICATE: null,
      PAN_CARD: 'pan-card.pdf',
      BUSINESS_REGISTRATION_CERTIFICATE: null,
      ADDRESS_PROOF: null,
      OWNER_DIRECTOR_ID_PROOF: null,
      BANK_PROOF: null,
      OTHER_SUPPORTING_DOCUMENT: null,
      SELLER_ID: 42,
      UPDATED_BY: 1,
    };
    const bankPayload = {
      BANK_DETAIL_ID: 9,
      ACCOUNT_HOLDER_NAME: 'Arun Kumar',
      BANK_NAME: 'State Bank of India',
      BRANCH_NAME: 'Chennai Main Branch',
      ACCOUNT_NUMBER: '123456789012',
      CONFIRM_ACCOUNT_NUMBER: '123456789012',
      IFSC_CODE: 'SBIN0001234',
      ACCOUNT_TYPE: 2,
      SELLER_ID: 42,
      UPDATED_BY: 1,
    };
    service.updateDocuments(documentPayload).subscribe((response) => (documentResult = response));
    service.updateBankDetails(bankPayload).subscribe((response) => (bankResult = response));

    const documentsRequest = http.expectOne(
      (candidate) =>
        candidate.url.endsWith('/seller_docs/update') && candidate.method === 'PUT',
    );
    const bankRequest = http.expectOne(
      (candidate) =>
        candidate.url.endsWith('/seller_bank_details/update') && candidate.method === 'PUT',
    );
    expect(documentsRequest.request.body).toEqual(documentPayload);
    expect(bankRequest.request.body).toEqual(bankPayload);
    documentsRequest.flush({ STATUS: 'SUCCESS' });
    bankRequest.flush({ status: 'SUCCESS' });

    expect(documentResult).toBe('Seller documents updated successfully.');
    expect(bankResult).toBe('Bank details updated successfully.');
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