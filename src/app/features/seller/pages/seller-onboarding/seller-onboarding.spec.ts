import { NO_ERRORS_SCHEMA, type WritableSignal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { S3ImageService } from '@core/services/s3-image.service';
import { ToastService } from '@core/services/toast.service';
import { Home } from '@features/home/pages/home/home';
import { SellerOnboarding } from './seller-onboarding';

// CHANGED (new): seller documents are uploaded to S3 ("documents/<unique file name>") before seller_docs is saved.
const DOCUMENT_KEY = (extension: string) => expect.stringMatching(new RegExp(`^documents/[0-9a-f]{32}\\.${extension}$`));
function s3ImagesMock() {
  return {
    uploadImage: vi.fn((_file: File, fileName: string, folderName: string) => of(`${folderName}/${fileName}`)),
    imageUrl: vi.fn((key: string) => of(`https://bucket.s3.ap-south-1.amazonaws.com/${key}?X-Amz-Signature=abc`)),
    uploadErrorMessage: vi.fn((error: unknown, subject = 'The product image') =>
      `${subject} could not be uploaded. ${error instanceof Error ? error.message : ''}`.trim()),
  };
}
const s3Service = (mock = s3ImagesMock()) => mock as unknown as S3ImageService;
import {
  SellerOnboardingPayload,
  SellerOnboardingResult,
  SellerDocumentsResult,
  SellerBankDetailsResult,
  SellerOnboardingService,
} from '../../services/seller-onboarding.service';

// CHANGED (new): the bank_account_type/get options as SellerOnboardingService maps them.
const ACCOUNT_TYPES = [
  { id: '1', name: 'Savings Account' },
  { id: '2', name: 'Current Account' },
];

type ValidationHarness = {
  activeStep: WritableSignal<number>;
  attemptedNext: WritableSignal<boolean>;
  touchedFields: WritableSignal<Record<string, boolean>>;
  uploadedDocuments: WritableSignal<Record<string, File>>;
  values: WritableSignal<Record<string, string>>;
  displayValueFor: (name: string, options?: readonly { label: string; value: string }[]) => string;
  submitted: WritableSignal<boolean>;
  businessTypes: WritableSignal<{ label: string; value: string }[]>;
  states: WritableSignal<{ label: string; value: string }[]>;
  // CHANGED: account types are an API lookup; bankFields is a computed.
  accountTypes: WritableSignal<{ label: string; value: string }[]>;
  lookupStatus: WritableSignal<
    Record<'businessType' | 'country' | 'state' | 'accountType', 'loading' | 'success' | 'error'>
  >;
  bankFields: () => { name: string; options?: readonly { label: string; value: string }[] }[];
  loadLookup: (name: 'businessType' | 'country' | 'state' | 'accountType') => void;
  lookupPlaceholder: (fieldName: string, fallback: string) => string;
  errorFor: (name: string) => string | null;
  markTouched: (name: string) => void;
  documentFileNameFor: (name: string) => string;
  documentStatusFor: (name: string) => 'uploaded' | null;
  updateValue: (name: string, event: Event) => void;
  updateDocument: (name: string, file: File) => void;
  continue: () => void;
  previewDocument: WritableSignal<string | null>;
  previewedDocument: () => { name: string; label: string; file: File } | null;
  openPreview: (name: string) => void;
  removeDocument: (name: string) => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  isSubmitting(): boolean;
  isEditing(): boolean;
  isLookupDisabled(fieldName: string): boolean;
  lookupErrorFor(fieldName: string): string | null;
};

describe('SellerOnboarding validation', () => {
  let component: ValidationHarness;
  let submittedPayloads: SellerOnboardingPayload[];
  let submissionResult: Observable<SellerOnboardingResult>;
  let documentResult: Observable<SellerDocumentsResult>;
  let bankResult: Observable<SellerBankDetailsResult>;
  // CHANGED: seller_docs/insert receives the documents' S3 keys (it used to receive the files).
  let documentUploadCalls: { files: Readonly<Record<string, string>>; sellerId: number }[];
  let s3Images: ReturnType<typeof s3ImagesMock>;
  let apiCallOrder: string[];
  let updatePayloads: { seller?: unknown; documents?: unknown; bank?: unknown };
  let toastMessages: { type: 'success' | 'error'; message: string }[];
  let stateCountryIds: string[];
  let deferStateLookup: boolean;
  let stateLookupUnsubscribed: boolean;
  // CHANGED (new): Account Type lookup calls and the bank insert payloads sent.
  let accountTypeRequests: number;
  let accountTypesResult: Observable<{ id: string; name: string }[]>;
  let bankInsertPayloads: unknown[];
  // CHANGED (new): the applicantUserId each update API received.
  let updateApplicantIds: (number | undefined)[];

  beforeEach(() => {
    accountTypeRequests = 0;
    accountTypesResult = of(ACCOUNT_TYPES);
    bankInsertPayloads = [];
    updateApplicantIds = [];
    submittedPayloads = [];
    submissionResult = of({ sellerId: 42, userId: 2 });
    documentResult = of({ documentId: 17, message: 'Seller documents uploaded successfully.' });
    bankResult = of({ bankDetailId: 24, message: 'Bank details saved successfully.' });
    documentUploadCalls = [];
    s3Images = s3ImagesMock();
    apiCallOrder = [];
    updatePayloads = {};
    toastMessages = [];
    stateCountryIds = [];
    deferStateLookup = false;
    stateLookupUnsubscribed = false;
    const router = { navigateByUrl: vi.fn() } as unknown as Router;
    const sellerOnboarding = {
      getBusinessTypes: () =>
        of([
          { id: '1', name: 'partnership' },
          { id: '2', name: 'private-limited' },
          { id: '3', name: 'sole-proprietorship' },
          { id: '4', name: 'other' },
          { id: '5', name: 'Retail Business' },
        ]),
      getCountries: () => of([{ id: '1', name: 'India' }]),
      getStates: (countryId: string) => {
        stateCountryIds.push(countryId);
        if (deferStateLookup) {
          return new Observable(() => () => {
            stateLookupUnsubscribed = true;
          });
        }
        return of([
          { id: '1', name: 'karnataka' },
          { id: '2', name: 'Tamil Nadu' },
        ]);
      },
      getBankAccountTypes: () => {
        accountTypeRequests += 1;
        return accountTypesResult;
      },
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : 'Request failed',
      submitWithResult: (payload: SellerOnboardingPayload) => {
        submittedPayloads.push(payload);
        apiCallOrder.push('onboarding');
        return submissionResult;
      },
      uploadDocuments: (files: Readonly<Record<string, string>>, sellerId: number) => {
        documentUploadCalls.push({ files, sellerId });
        apiCallOrder.push('documents');
        return documentResult;
      },
      saveBankDetails: (details: unknown, _sellerId: number) => {
        bankInsertPayloads.push(details);
        apiCallOrder.push('bank');
        return bankResult;
      },
      updateSeller: (payload: unknown, applicantUserId?: number) => {
        updatePayloads.seller = payload;
        updateApplicantIds.push(applicantUserId);
        apiCallOrder.push('update-seller');
        return of('Seller updated');
      },
      updateDocuments: (payload: unknown, applicantUserId?: number) => {
        updatePayloads.documents = payload;
        updateApplicantIds.push(applicantUserId);
        apiCallOrder.push('update-documents');
        return of('Documents updated');
      },
      updateBankDetails: (payload: unknown, applicantUserId?: number) => {
        updatePayloads.bank = payload;
        updateApplicantIds.push(applicantUserId);
        apiCallOrder.push('update-bank');
        return of('Bank details updated');
      },
    } as unknown as SellerOnboardingService;
    const toast = {
      showSuccess: (message: string) => toastMessages.push({ type: 'success', message }),
      showError: (message: string) => toastMessages.push({ type: 'error', message }),
    } as unknown as ToastService;
    component = new SellerOnboarding(router, sellerOnboarding, toast, undefined, s3Service(s3Images)) as unknown as ValidationHarness;
    component.attemptedNext.set(true);
  });

  function chooseCountry(countryId = '1'): void {
    const select = document.createElement('select');
    const option = document.createElement('option');
    option.value = countryId;
    option.textContent = 'India';
    select.append(option);
    select.value = countryId;
    component.updateValue('country', { target: select } as unknown as Event);
  }

  function setValidSellerDetails(): void {
    chooseCountry();
    component.values.set({
      businessName: 'Example Business',
      businessType: '1',
      mobileNumber: '9876543210',
      city: 'Chennai',
      country: '1',
      gstNumber: 'GST123',
      registrationNumber: 'REG-123',
      contactEmail: 'contact@example.com',
      sellerName: 'Seller',
      email: 'seller@example.com',
      businessAddress: '1 Market Road',
      state: '1',
      pincode: '600001',
      panNumber: 'ABCDE1234F',
      contactPersonName: 'Contact Person',
      contactPersonMobile: '9876543210',
      userName: 'seller_user',
      userPassword: 'Seller@123',
      gstCertificate: 'gst.pdf',
      panCard: 'pan.pdf',
      registrationCertificate: 'registration.pdf',
      addressProof: 'address.pdf',
      ownerIdProof: 'id.pdf',
      bankProof: 'bank.pdf',
    });
  }

  it('does not advance or call Documents when onboarding fails', () => {
    setValidSellerDetails();
    submissionResult = throwError(() => new Error('Onboarding unavailable'));

    component.continue();

    expect(apiCallOrder).toEqual(['onboarding']);
    expect(component.activeStep()).toBe(1);
    expect(component.isSubmitting()).toBe(false);
    expect(toastMessages.at(-1)).toEqual({
      type: 'error',
      message: 'Onboarding unavailable',
    });
  });

  it('keeps the loader active and ignores repeated clicks during an API request', () => {
    let finishRequest: (() => void) | undefined;
    submissionResult = new Observable((subscriber) => {
      finishRequest = () => {
        subscriber.next({ sellerId: 42, userId: 2 });
        subscriber.complete();
      };
    });
    setValidSellerDetails();

    component.continue();
    component.continue();

    expect(component.isSubmitting()).toBe(true);
    expect(apiCallOrder).toEqual(['onboarding']);
    finishRequest?.();

    expect(component.isSubmitting()).toBe(false);
    expect(component.activeStep()).toBe(2);
  });

  it('does not call Bank Details when document insertion fails', () => {
    setValidSellerDetails();
    component.continue();
    documentResult = throwError(() => new Error('Documents unavailable'));

    component.continue();

    expect(apiCallOrder).toEqual(['onboarding', 'documents']);
    expect(component.activeStep()).toBe(2);
    expect(component.isSubmitting()).toBe(false);
    expect(toastMessages.at(-1)).toEqual({
      type: 'error',
      message: 'Documents unavailable',
    });
  });

  it('automatically navigates to Bank Details after Documents confirms success', () => {
    setValidSellerDetails();
    component.continue();
    let finishRequest: (() => void) | undefined;
    documentResult = new Observable((subscriber) => {
      finishRequest = () => {
        subscriber.next({ documentId: 17, message: 'Documents inserted.' });
        subscriber.complete();
      };
    });

    component.continue();
    component.continue();

    expect(apiCallOrder).toEqual(['onboarding', 'documents']);
    expect(component.activeStep()).toBe(2);
    expect(component.isSubmitting()).toBe(true);

    finishRequest?.();

    expect(component.activeStep()).toBe(3);
    expect(component.isSubmitting()).toBe(false);
    expect(toastMessages.at(-1)).toEqual({
      type: 'success',
      message: 'Documents inserted.',
    });
  });

  it('loads an existing seller and runs all UPDATE APIs in order on final submission', () => {
    const updatedSeller: unknown[] = [];
    const updatedDocuments: unknown[] = [];
    const updatedBankDetails: unknown[] = [];
    const apiOrder: string[] = [];
    const relatedGetIds: (number | string | undefined)[][] = [];
    const existingSellerService = {
      getSeller: () =>
        of({
          SELLER_ID: 42,
          USER_ID: 2,
          BUSINESS_NAME: 'Example Business',
          SELLER_NAME: 'Seller',
          BUSINESS_TYPE: 5,
          EMAIL: 'seller@example.com',
          MOBILE_NUMBER: 9876543210,
          BUSINESS_ADDRESS: '1 Market Road',
          CITY: 'Chennai',
          STATE: 'Tamil Nadu',
          COUNTRY: 'India',
          PINCODE: '600001',
          GST_NUMBER: 'GST123',
          PAN_NUMBER: 'ABCDE1234F',
          BUSINESS_REGISTRATION_NUMBER: 'REG-123',
          CONTACT_PERSON_NAME: 'Contact Person',
          CONTACT_PERSON_MOBILE: 9876543210,
          CONTACT_PERSON_EMAIL: 'contact@example.com',
          USER_NAME: 'seller_user',
        }),
      getSellerDocumentsForSeller: (sellerId: number, documentId?: number) => {
        relatedGetIds.push(['documents', sellerId, documentId]);
        return of({
          DOCUMENT_ID: 7,
          SELLER_ID: 42,
          GST_CERTIFICATE: 'gst.pdf',
          PAN_CARD: 'pan.pdf',
          BUSINESS_REGISTRATION_CERTIFICATE: 'registration.pdf',
          ADDRESS_PROOF: 'address.pdf',
          OWNER_DIRECTOR_ID_PROOF: 'id.pdf',
          BANK_PROOF: 'bank.pdf',
          OTHER_SUPPORTING_DOCUMENT: null,
        });
      },
      getSellerBankDetailsForSeller: (sellerId: number, bankDetailId?: number) => {
        relatedGetIds.push(['bank', sellerId, bankDetailId]);
        return of({
          BANK_DETAIL_ID: 9,
          SELLER_ID: 42,
          ACCOUNT_HOLDER_NAME: 'Contact Person',
          BANK_NAME: 'Example Bank',
          BRANCH_NAME: 'Central',
          ACCOUNT_NUMBER: '123456789',
          IFSC_CODE: 'ABCD0123456',
          // CHANGED: a saved Current Account, so the preselected ID differs from the first option.
          ACCOUNT_TYPE_ID: 2,
          ACCOUNT_TYPE: 'Current Account',
        });
      },
      getBusinessTypes: () => of([{ id: '5', name: 'Retail Business' }]),
      getCountries: () => of([{ id: '1', name: 'India' }]),
      getStates: () => of([{ id: '33', name: 'Tamil Nadu' }]),
      getBankAccountTypes: () => of(ACCOUNT_TYPES),
      updateSeller: (payload: unknown) => {
        updatedSeller.push(payload);
        apiOrder.push('seller');
        return of('Seller updated successfully.');
      },
      updateDocuments: (payload: unknown) => {
        updatedDocuments.push(payload);
        apiOrder.push('documents');
        return of('Documents updated successfully.');
      },
      updateBankDetails: (payload: unknown) => {
        updatedBankDetails.push(payload);
        apiOrder.push('bank');
        return of('Bank details updated successfully.');
      },
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : 'Request failed',
    } as unknown as SellerOnboardingService;
    const route = {
      snapshot: {
        queryParamMap: {
          get: (name: string) =>
            name === 'sellerId' ? '42' : name === 'documentId' ? '7' : name === 'bankDetailId' ? '9' : null,
        },
      },
    } as unknown as ActivatedRoute;
    const router = { navigateByUrl: vi.fn() } as unknown as Router;
    const toast = {
      showSuccess: vi.fn(),
      showError: vi.fn(),
    } as unknown as ToastService;
    const edit = new SellerOnboarding(router, existingSellerService, toast, route, s3Service()) as unknown as ValidationHarness;
    const setInput = (name: string, value: string) => {
      const input = document.createElement('input');
      input.value = value;
      edit.updateValue(name, { target: input } as unknown as Event);
    };

    expect(edit.isEditing()).toBe(true);
    expect(edit.values()).toMatchObject({
      businessName: 'Example Business',
      businessType: '5',
      country: '1',
      state: '33',
      gstCertificate: 'gst.pdf',
      bankName: 'Example Bank',
      accountType: '2',
    });
    expect(edit.displayValueFor('businessType', edit.businessTypes())).toBe('Retail Business');
    expect(edit.displayValueFor('accountType', edit.accountTypes())).toBe('Current Account');
    expect(edit.lookupStatus().accountType).toBe('success');
    expect(relatedGetIds).toEqual([
      ['documents', 42, 7],
      ['bank', 42, 9],
    ]);

    setInput('userPassword', 'Seller@123');
    setInput('businessName', 'Temporary Business Name');
    setInput('businessName', 'Example Business');
    edit.continue();
    expect(edit.activeStep()).toBe(2);
    expect(updatedSeller).toHaveLength(0);

    edit.goToStep(1);
    setInput('businessName', 'Example Business Updated');
    edit.continue();
    expect(edit.activeStep()).toBe(2);
    expect(updatedSeller).toHaveLength(0);

    edit.updateDocument('gstCertificate', new File(['new-gst'], 'gst-updated.pdf'));
    edit.continue();
    expect(edit.activeStep()).toBe(3);
    expect(updatedDocuments).toHaveLength(0);

    setInput('bankName', 'Updated Bank');
    expect(edit.bankFields().map((field) => [field.name, edit.errorFor(field.name)])).toEqual(
      edit.bankFields().map((field) => [field.name, null]),
    );
    edit.continue();
    expect(edit.activeStep()).toBe(4);
    expect(updatedBankDetails).toHaveLength(0);

    edit.continue();
    expect(edit.submitted()).toBe(true);
    expect(updatedBankDetails).toHaveLength(1);

    expect(updatedSeller).toHaveLength(1);
    expect(updatedSeller[0]).toMatchObject({
      SELLER_ID: 42,
      USER_ID: 2,
      BUSINESS_NAME: 'Example Business Updated',
      BUSINESS_TYPE: 5,
      STATE: 33,
      COUNTRY: 1,
      USER_PASSWORD: 'Seller@123',
    });
    expect(updatedDocuments).toHaveLength(1);
    // CHANGED: the replaced document is sent as its S3 key; the others keep their saved values.
    expect(updatedDocuments[0]).toMatchObject({
      DOCUMENT_ID: 7,
      SELLER_ID: 42,
      GST_CERTIFICATE: DOCUMENT_KEY('pdf'),
      PAN_CARD: 'pan.pdf',
    });
    expect(updatedBankDetails[0]).toMatchObject({
      BANK_DETAIL_ID: 9,
      SELLER_ID: 42,
      BANK_NAME: 'Updated Bank',
      // CHANGED: the preselected ACCOUNT_TYPE_ID is sent back unchanged.
      ACCOUNT_TYPE: 2,
    });
    expect(apiOrder).toEqual(['seller', 'documents', 'bank']);
    expect(toast.showSuccess).toHaveBeenCalledTimes(1);
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it('updates all existing records even when their details are unchanged', () => {
    const apiOrder: string[] = [];
    let updatePayload: unknown;
    let bankUpdatePayload: unknown;
    let bankApplicantUserId: number | undefined = -1;
    const service = {
      getSeller: () =>
        of({
          SELLER_ID: 42,
          USER_ID: 2,
          BUSINESS_NAME: 'Example Business',
          SELLER_NAME: 'Seller',
          BUSINESS_TYPE: 'Retail Business',
          EMAIL: 'seller@example.com',
          MOBILE_NUMBER: 9876543210,
          BUSINESS_ADDRESS: '1 Market Road',
          CITY: 'Chennai',
          STATE: 'Tamil Nadu',
          COUNTRY: 'India',
          PINCODE: '600001',
          GST_NUMBER: 'GST123',
          PAN_NUMBER: 'ABCDE1234F',
          BUSINESS_REGISTRATION_NUMBER: 'REG-123',
          CONTACT_PERSON_NAME: 'Contact Person',
          CONTACT_PERSON_MOBILE: 9876543210,
          CONTACT_PERSON_EMAIL: 'contact@example.com',
          USER_NAME: 'seller_user',
          USER_PASSWORD: 'Existing@123',
        }),
      getSellerDocumentsForSeller: () =>
        of({
          DOCUMENT_ID: 7,
          SELLER_ID: 42,
          GST_CERTIFICATE: 'gst.pdf',
          PAN_CARD: 'pan.pdf',
          BUSINESS_REGISTRATION_CERTIFICATE: 'registration.pdf',
          ADDRESS_PROOF: 'address.pdf',
          OWNER_DIRECTOR_ID_PROOF: 'id.pdf',
          BANK_PROOF: 'bank.pdf',
          OTHER_SUPPORTING_DOCUMENT: null,
        }),
      getSellerBankDetailsForSeller: () =>
        of({
          BANK_DETAIL_ID: 9,
          SELLER_ID: 42,
          ACCOUNT_HOLDER_NAME: 'Contact Person',
          BANK_NAME: 'Example Bank',
          BRANCH_NAME: 'Central',
          ACCOUNT_NUMBER: '123456789',
          IFSC_CODE: 'ABCD0123456',
          ACCOUNT_TYPE: 1,
        }),
      getBusinessTypes: () => of([{ id: '5', name: 'Retail Business' }]),
      getCountries: () => of([{ id: '1', name: 'India' }]),
      getStates: () => of([{ id: '33', name: 'Tamil Nadu' }]),
      getBankAccountTypes: () => of(ACCOUNT_TYPES),
      updateSeller: (payload: unknown) => {
        apiOrder.push('seller');
        updatePayload = payload;
        return of('Seller updated');
      },
      updateDocuments: () => {
        apiOrder.push('documents');
        return of('Documents updated');
      },
      updateBankDetails: (payload: unknown, applicantUserId?: number) => {
        apiOrder.push('bank');
        bankUpdatePayload = payload;
        bankApplicantUserId = applicantUserId;
        return of('Bank updated');
      },
      getErrorMessage: () => 'Update failed',
    } as unknown as SellerOnboardingService;
    const route = {
      snapshot: { queryParamMap: { get: (name: string) => (name === 'sellerId' ? '42' : null) } },
    } as unknown as ActivatedRoute;
    const toast = { showSuccess: vi.fn(), showError: vi.fn() } as unknown as ToastService;
    const edit = new SellerOnboarding(
      { navigateByUrl: vi.fn() } as unknown as Router,
      service,
      toast,
      route,
    ) as unknown as ValidationHarness;
    edit.continue();
    edit.continue();
    edit.continue();
    expect(edit.activeStep()).toBe(4);
    expect(apiOrder).toEqual([]);

    edit.continue();

    expect(apiOrder).toEqual(['seller', 'documents', 'bank']);
    expect(updatePayload).toMatchObject({ USER_PASSWORD: 'Existing@123' });
    // CHANGED: a record that stores the ID as ACCOUNT_TYPE (no ACCOUNT_TYPE_ID) is preselected too.
    expect(bankUpdatePayload).toMatchObject({ BANK_DETAIL_ID: 9, ACCOUNT_TYPE: 1 });
    // CHANGED: editing an existing seller (?sellerId=) never falls back to the seller's USER_ID.
    expect(bankApplicantUserId).toBeUndefined();
    expect(edit.submitted()).toBe(true);
    expect(toast.showSuccess).toHaveBeenCalledTimes(1);
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it('stops the edit update sequence on failure without overall success', () => {
    const apiOrder: string[] = [];
    const failure = new Error('Documents update failed');
    const service = {
      getSeller: () =>
        of({
          SELLER_ID: 42,
          USER_ID: 2,
          BUSINESS_NAME: 'Example Business',
          SELLER_NAME: 'Seller',
          BUSINESS_TYPE: 'Retail Business',
          EMAIL: 'seller@example.com',
          MOBILE_NUMBER: 9876543210,
          BUSINESS_ADDRESS: '1 Market Road',
          CITY: 'Chennai',
          STATE: 'Tamil Nadu',
          COUNTRY: 'India',
          PINCODE: '600001',
          GST_NUMBER: 'GST123',
          PAN_NUMBER: 'ABCDE1234F',
          BUSINESS_REGISTRATION_NUMBER: 'REG-123',
          CONTACT_PERSON_NAME: 'Contact Person',
          CONTACT_PERSON_MOBILE: 9876543210,
          CONTACT_PERSON_EMAIL: 'contact@example.com',
          USER_NAME: 'seller_user',
        }),
      getSellerDocumentsForSeller: () =>
        of({
          DOCUMENT_ID: 7,
          SELLER_ID: 42,
          GST_CERTIFICATE: 'gst.pdf',
          PAN_CARD: 'pan.pdf',
          BUSINESS_REGISTRATION_CERTIFICATE: 'registration.pdf',
          ADDRESS_PROOF: 'address.pdf',
          OWNER_DIRECTOR_ID_PROOF: 'id.pdf',
          BANK_PROOF: 'bank.pdf',
          OTHER_SUPPORTING_DOCUMENT: null,
        }),
      getSellerBankDetailsForSeller: () =>
        of({
          BANK_DETAIL_ID: 9,
          SELLER_ID: 42,
          ACCOUNT_HOLDER_NAME: 'Contact Person',
          BANK_NAME: 'Example Bank',
          BRANCH_NAME: 'Central',
          ACCOUNT_NUMBER: '123456789',
          IFSC_CODE: 'ABCD0123456',
          ACCOUNT_TYPE: 1,
        }),
      getBusinessTypes: () => of([{ id: '5', name: 'Retail Business' }]),
      getCountries: () => of([{ id: '1', name: 'India' }]),
      getStates: () => of([{ id: '33', name: 'Tamil Nadu' }]),
      getBankAccountTypes: () => of(ACCOUNT_TYPES),
      updateSeller: () => {
        apiOrder.push('seller');
        return of('Seller updated');
      },
      updateDocuments: () => {
        apiOrder.push('documents');
        return throwError(() => failure);
      },
      updateBankDetails: () => {
        apiOrder.push('bank');
        return of('Bank updated');
      },
      getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Update failed',
    } as unknown as SellerOnboardingService;
    const route = {
      snapshot: { queryParamMap: { get: (name: string) => (name === 'sellerId' ? '42' : null) } },
    } as unknown as ActivatedRoute;
    const toast = { showSuccess: vi.fn(), showError: vi.fn() } as unknown as ToastService;
    const edit = new SellerOnboarding(
      { navigateByUrl: vi.fn() } as unknown as Router,
      service,
      toast,
      route,
    ) as unknown as ValidationHarness;
    const password = document.createElement('input');
    password.value = 'Seller@123';
    edit.updateValue('userPassword', { target: password } as unknown as Event);

    edit.continue();
    edit.continue();
    edit.continue();
    edit.continue();

    expect(apiOrder).toEqual(['seller', 'documents']);
    expect(edit.submitted()).toBe(false);
    expect(edit.isSubmitting()).toBe(false);
    expect(toast.showSuccess).not.toHaveBeenCalled();
    expect(toast.showError).toHaveBeenCalledWith(failure.message);
  });

  it('does not attempt updates when loading returns related records for a different seller', () => {
    const updateSeller = vi.fn(() => of('Seller updated'));
    const updateDocuments = vi.fn(() => of('Documents updated'));
    const updateBankDetails = vi.fn(() => of('Bank details updated'));
    const loadError = new Error(
      'The seller documents API returned SELLER_ID 49 for the requested SELLER_ID 42.',
    );
    const service = {
      getSeller: () => of({ SELLER_ID: 42, USER_ID: 2, COUNTRY: 'India' }),
      getSellerDocumentsForSeller: () => throwError(() => loadError),
      getSellerBankDetailsForSeller: () =>
        of({ BANK_DETAIL_ID: 9, SELLER_ID: 42, ACCOUNT_TYPE: 1 }),
      getBusinessTypes: () => of([{ id: '5', name: 'Retail Business' }]),
      getCountries: () => of([{ id: '1', name: 'India' }]),
      getStates: () => of([{ id: '33', name: 'Tamil Nadu' }]),
      getBankAccountTypes: () => of(ACCOUNT_TYPES),
      updateSeller,
      updateDocuments,
      updateBankDetails,
      getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Update failed',
    } as unknown as SellerOnboardingService;
    const route = {
      snapshot: { queryParamMap: { get: (name: string) => (name === 'sellerId' ? '42' : null) } },
    } as unknown as ActivatedRoute;
    const toast = { showSuccess: vi.fn(), showError: vi.fn() } as unknown as ToastService;
    const edit = new SellerOnboarding(
      { navigateByUrl: vi.fn() } as unknown as Router,
      service,
      toast,
      route,
    ) as unknown as ValidationHarness;

    expect(edit.isEditing()).toBe(true);
    expect(edit.values()).toEqual({});
    expect(toast.showError).toHaveBeenCalledWith(loadError.message);
    edit.continue();
    expect(updateSeller).not.toHaveBeenCalled();
    expect(updateDocuments).not.toHaveBeenCalled();
    expect(updateBankDetails).not.toHaveBeenCalled();
  });

  it.each([
    ['businessName', 'Business name is required.'],
    ['businessType', 'Please select a business type.'],
    ['mobileNumber', 'Mobile number is required.'],
    ['city', 'City is required.'],
    ['country', 'Please select a country.'],
    ['gstNumber', 'GST number is required.'],
    ['registrationNumber', 'Business registration number is required.'],
    ['contactEmail', 'Contact person email is required.'],
    ['sellerName', 'Seller name is required.'],
    ['email', 'Email is required.'],
    ['businessAddress', 'Business address is required.'],
    ['state', 'Please select a state.'],
    ['pincode', 'Pincode is required.'],
    ['panNumber', 'PAN number is required.'],
    ['contactPersonName', 'Contact person name is required.'],
    ['contactPersonMobile', 'Contact person mobile is required.'],
    ['userName', 'Account username is required.'],
    ['userPassword', 'Account password is required.'],
  ])('uses the specific required message for %s', (name, message) => {
    expect(component.errorFor(name)).toBe(message);
  });

  it.each([
    ['businessName', 'Business name is required.'],
    ['city', 'City is required.'],
    ['sellerName', 'Seller name is required.'],
    ['businessAddress', 'Business address is required.'],
    ['contactPersonName', 'Contact person name is required.'],
  ])('rejects whitespace-only %s', (name, message) => {
    component.values.set({ [name]: '   \t  ' });
    expect(component.errorFor(name)).toBe(message);
  });

  it.each([
    ['mobileNumber', '5123456789', 'Please enter a valid 10-digit mobile number.'],
    ['mobileNumber', '987654321', 'Please enter a valid 10-digit mobile number.'],
    ['contactPersonMobile', '+91 9876543210', 'Please enter a valid 10-digit mobile number.'],
    ['contactPersonMobile', '987654321a', 'Please enter a valid 10-digit mobile number.'],
    ['contactEmail', 'person@invalid', 'Please enter a valid email address.'],
    ['email', 'not-an-email', 'Please enter a valid email address.'],
    ['email', 'person..name@example.com', 'Please enter a valid email address.'],
    ['panNumber', 'ABCDE1234', 'Please enter a valid PAN number (e.g., ABCDE1234F).'],
    ['panNumber', '12345ABCDE', 'Please enter a valid PAN number (e.g., ABCDE1234F).'],
    ['pincode', '56000', 'Please enter a valid 6-digit PIN code.'],
    ['pincode', '56000A', 'Please enter a valid 6-digit PIN code.'],
    ['pincode', '000001', 'Please enter a valid 6-digit PIN code.'],
  ])('rejects invalid %s values', (name, value, message) => {
    component.values.set({ [name]: value });
    expect(component.errorFor(name)).toBe(message);
  });

  it.each([
    ['mobileNumber', '9876543210'],
    ['contactPersonMobile', '6123456789'],
    ['contactEmail', 'person+seller@example.co.in'],
    ['email', 'seller@example.com'],
    ['gstNumber', '27AAPFU0939F1ZV'],
    ['gstNumber', '27AAACR5055K1Z7'],
    ['gstNumber', '33AAHFG9837H2Z4'],
    ['panNumber', 'ABCDE1234F'],
    ['pincode', '560001'],
  ])('accepts valid %s values', (name, value) => {
    component.values.set({ [name]: value });
    expect(component.errorFor(name)).toBeNull();
  });

  it('trims surrounding whitespace for values while preserving their stored input', () => {
    component.values.set({ panNumber: '  abcde1234f  ' });
    expect(component.errorFor('panNumber')).toBeNull();
    expect(component.values()['panNumber']).toBe('  abcde1234f  ');

    component.values.set({ pincode: ' 560001 ' });
    expect(component.errorFor('pincode')).toBeNull();
  });

  it('clears the PAN format error as soon as the value becomes valid', () => {
    component.values.set({ panNumber: 'ABCDE1234' });
    expect(component.errorFor('panNumber')).toBe(
      'Please enter a valid PAN number (e.g., ABCDE1234F).',
    );

    component.values.set({ panNumber: 'ABCDE1234F' });
    expect(component.errorFor('panNumber')).toBeNull();
  });

  it('accepts non-empty GST values without format validation', () => {
    const input = document.createElement('input');
    input.value = '33AABCS1234F1Z5';
    component.updateValue('gstNumber', { target: input } as unknown as Event);

    expect(component.errorFor('gstNumber')).toBeNull();
    expect(component.values()['gstNumber']).toBe('33AABCS1234F1Z5');
  });

  it('shows only the required GST message for an empty value after validation is attempted', () => {
    component.values.set({ gstNumber: '' });
    expect(component.errorFor('gstNumber')).toBe('GST number is required.');

    component.attemptedNext.set(false);
    expect(component.errorFor('gstNumber')).toBeNull();
  });

  it('shows a required GST message only after the field is blurred', () => {
    component.attemptedNext.set(false);
    component.values.set({ gstNumber: 'not-a-gstin' });
    expect(component.errorFor('gstNumber')).toBeNull();

    component.values.set({ gstNumber: '' });
    expect(component.errorFor('gstNumber')).toBeNull();

    component.markTouched('gstNumber');
    expect(component.errorFor('gstNumber')).toBe('GST number is required.');
  });

  it('rejects dropdown values that are not among the available options', () => {
    component.values.set({ businessType: 'forged-value' });
    expect(component.errorFor('businessType')).toBe('Please select a valid option.');

    component.activeStep.set(3);
    component.values.set({ accountType: 'forged-value' });
    expect(component.errorFor('accountType')).toBe('Please select a valid option.');

    component.activeStep.set(1);
    component.values.set({ country: 'unlisted-country' });
    expect(component.errorFor('country')).toBe('Please select a valid option.');

    component.values.set({ state: 'unlisted-state' });
    expect(component.errorFor('state')).toBe('Please select a valid option.');
  });

  it('does not enable a lookup dropdown when the API returns an empty option list', () => {
    component.businessTypes.set([]);
    component.lookupStatus.update((status) => ({ ...status, businessType: 'success' }));

    expect(component.isLookupDisabled('businessType')).toBe(true);
    expect(component.lookupErrorFor('businessType')).toBe('No options are currently available.');
  });

  it('accepts dropdown values from the configured options', () => {
    component.values.set({ businessType: '1' });
    chooseCountry();
    component.values.update((values) => ({ ...values, state: '1' }));
    expect(component.errorFor('businessType')).toBeNull();
    expect(component.errorFor('country')).toBeNull();
    expect(component.errorFor('state')).toBeNull();

    // CHANGED: account type values are API ACCOUNT_TYPE_IDs.
    component.activeStep.set(3);
    component.values.set({ accountType: '2' });
    expect(component.errorFor('accountType')).toBeNull();
    component.values.set({ accountType: '9' });
    expect(component.errorFor('accountType')).toBe('Please select a valid option.');
    component.values.set({ accountType: 'current' });
    expect(component.errorFor('accountType')).toBe('Please select a valid option.');
  });

  // CHANGED (new): the Account Type dropdown is populated from bank_account_type/get.
  it('loads the account types once and offers ACCOUNT_TYPE as label and ACCOUNT_TYPE_ID as value', () => {
    expect(accountTypeRequests).toBe(1);
    expect(component.lookupStatus().accountType).toBe('success');
    expect(component.bankFields().find(({ name }) => name === 'accountType')?.options).toEqual([
      { label: 'Savings Account', value: '1' },
      { label: 'Current Account', value: '2' },
    ]);
    expect(component.isLookupDisabled('accountType')).toBe(false);
    expect(component.lookupPlaceholder('accountType', 'Select account type')).toBe('Select account type');
  });

  it('shows the account type loading and error states and loads them again on retry', () => {
    let finish: (() => void) | undefined;
    accountTypesResult = new Observable((subscriber) => {
      finish = () => {
        subscriber.next(ACCOUNT_TYPES);
        subscriber.complete();
      };
    });
    component.loadLookup('accountType');
    expect(component.isLookupDisabled('accountType')).toBe(true);
    expect(component.lookupPlaceholder('accountType', 'Select account type')).toBe('Loading options…');
    finish?.();
    expect(component.isLookupDisabled('accountType')).toBe(false);

    accountTypesResult = throwError(() => new Error('Bank account types are unavailable'));
    component.loadLookup('accountType');
    expect(component.lookupStatus().accountType).toBe('error');
    expect(component.isLookupDisabled('accountType')).toBe(true);
    expect(component.lookupPlaceholder('accountType', 'Select account type')).toBe('Options unavailable');
    expect(component.lookupErrorFor('accountType')).toBe('Bank account types are unavailable');

    // "Retry options" calls loadLookup again.
    accountTypesResult = of(ACCOUNT_TYPES);
    component.loadLookup('accountType');
    expect(component.lookupStatus().accountType).toBe('success');
    expect(component.lookupErrorFor('accountType')).toBeNull();
    expect(component.accountTypes()).toHaveLength(2);
  });

  it('loads states using the selected country ID and clears state on country changes', () => {
    chooseCountry('1');
    component.values.update((values) => ({ ...values, state: '1' }));
    chooseCountry('2');

    expect(stateCountryIds).toEqual(['1', '2']);
    expect(component.values()).toMatchObject({ country: '2', state: '' });
  });

  it('does not request state options until a country is selected', () => {
    expect(stateCountryIds).toEqual([]);
    expect(component.isLookupDisabled('state')).toBe(true);
  });

  it('cancels the state request and clears options when the country is cleared', () => {
    deferStateLookup = true;
    chooseCountry('1');
    expect(stateCountryIds).toEqual(['1']);

    chooseCountry('');

    expect(stateLookupUnsubscribed).toBe(true);
    expect(component.states()).toEqual([]);
    expect(component.isLookupDisabled('state')).toBe(true);
  });

  it('requires a non-whitespace registration number for every supported business type', () => {
    for (const businessType of ['private-limited', 'partnership', 'sole-proprietorship', 'other']) {
      component.values.set({ businessType, registrationNumber: '   ' });
      expect(component.errorFor('registrationNumber')).toBe(
        'Business registration number is required.',
      );
    }
  });

  it('accepts nonblank registration numbers without applying a specific format', () => {
    const registrationNumbersByType = [
      ['private-limited', '8727263733333'],
      ['partnership', 'REG/KA/2024-25'],
      ['sole-proprietorship', 'SHOP-REG/KA/24-25'],
      ['other', 'ABC/2024-25'],
    ];

    for (const [businessType, registrationNumber] of registrationNumbersByType) {
      component.values.set({ businessType, registrationNumber });
      expect(component.errorFor('registrationNumber')).toBeNull();
    }
  });

  it('blocks continuing when a non-empty field has an invalid format', () => {
    component.values.set({ panNumber: 'ABCDE1234' });
    component.continue();

    expect(component.activeStep()).toBe(1);
    expect(component.submitted()).toBe(false);
  });

  it('shows document filenames and uploaded status only for files actually selected', () => {
    expect(component.documentFileNameFor('gstCertificate')).toBe('');
    expect(component.documentStatusFor('gstCertificate')).toBeNull();

    const file = new File(['certificate'], 'tax-registration.pdf', { type: 'application/pdf' });
    component.updateDocument('gstCertificate', file);

    expect(component.documentFileNameFor('gstCertificate')).toBe('tax-registration.pdf');
    expect(component.documentStatusFor('gstCertificate')).toBe('uploaded');
  });

  it('stores and replaces the optional supporting document without requiring it', () => {
    expect(component.documentFileNameFor('supportingDocument')).toBe('');
    expect(component.documentStatusFor('supportingDocument')).toBeNull();
    expect(component.errorFor('supportingDocument')).toBeNull();

    const firstFile = new File(['first'], 'supporting-document.pdf', { type: 'application/pdf' });
    component.updateDocument('supportingDocument', firstFile);
    expect(component.documentFileNameFor('supportingDocument')).toBe('supporting-document.pdf');
    expect(component.documentStatusFor('supportingDocument')).toBe('uploaded');
    expect(component.values()['supportingDocument']).toBe('supporting-document.pdf');

    const replacement = new File(['replacement'], 'updated-supporting-document.png', {
      type: 'image/png',
    });
    component.updateDocument('supportingDocument', replacement);
    expect(component.documentFileNameFor('supportingDocument')).toBe(
      'updated-supporting-document.png',
    );
    expect(component.uploadedDocuments()['supportingDocument']).toBe(replacement);
  });

  it.each([
    ['accountHolder', 'Account holder name is required.'],
    ['bankName', 'Bank name is required.'],
    ['branchName', 'Branch name is required.'],
    ['accountNumber', 'Account number is required.'],
    ['confirmAccountNumber', 'Please confirm your account number.'],
    ['accountType', 'Please select an account type.'],
  ])('uses the correct required message for %s on Step 3', (name, message) => {
    component.activeStep.set(3);
    expect(component.errorFor(name)).toBe(message);
  });

  it.each(['accountHolder', 'bankName', 'branchName'])('rejects whitespace-only %s', (name) => {
    component.activeStep.set(3);
    component.values.set({ [name]: '   ' });
    expect(component.errorFor(name)).not.toBeNull();
  });

  it('requires a numeric account number without imposing a length limit', () => {
    component.activeStep.set(3);
    component.values.set({ accountNumber: '12AB34' });
    expect(component.errorFor('accountNumber')).toBe('Account number must contain digits only.');

    component.values.set({ accountNumber: '12345' });
    expect(component.errorFor('accountNumber')).toBeNull();
  });

  it('requires one confirmation field and reports then clears a mismatch', () => {
    component.activeStep.set(3);
    expect(component.bankFields().filter(({ name }) => name === 'confirmAccountNumber')).toHaveLength(
      1,
    );
    expect(component.bankFields().some(({ name }) => name === 'confirmAccountNumberAgain')).toBe(
      false,
    );

    component.values.set({ accountNumber: '123456789', confirmAccountNumber: '123456780' });
    expect(component.errorFor('confirmAccountNumber')).toBe('Account numbers do not match.');

    component.values.set({ accountNumber: '123456789', confirmAccountNumber: '123456789' });
    expect(component.errorFor('confirmAccountNumber')).toBeNull();
  });

  it('blocks Step 3 progression when account numbers do not match', () => {
    component.activeStep.set(3);
    chooseCountry();
    component.values.set({
      businessName: 'Example Business',
      businessType: '1',
      mobileNumber: '9876543210',
      city: 'Bengaluru',
      country: '1',
      gstNumber: '27AAPFU0939F1ZV',
      registrationNumber: 'REG-123',
      contactEmail: 'contact@example.com',
      sellerName: 'Seller',
      email: 'seller@example.com',
      businessAddress: '1 Market Road',
      state: '1',
      pincode: '560001',
      panNumber: 'ABCDE1234F',
      contactPersonName: 'Contact Person',
      contactPersonMobile: '9876543210',
      userName: 'seller_user',
      userPassword: 'Seller@123',
      gstCertificate: 'certificate.pdf',
      panCard: 'pan.pdf',
      registrationCertificate: 'registration.pdf',
      addressProof: 'address.pdf',
      ownerIdProof: 'id.pdf',
      bankProof: 'bank.pdf',
      accountHolder: 'Seller',
      bankName: 'Example Bank',
      branchName: 'Central',
      accountNumber: '123456789',
      confirmAccountNumber: '123456780',
      accountType: '2',
    });
    component.continue();

    expect(component.activeStep()).toBe(3);
    expect(component.errorFor('confirmAccountNumber')).toBe('Account numbers do not match.');
  });

  it('uploads documents after onboarding succeeds before saving bank details', () => {
    component.activeStep.set(1);
    chooseCountry();
    component.values.set({
      businessName: 'Example Business',
      businessType: '1',
      mobileNumber: '9876543210',
      city: 'Chennai',
      country: '1',
      gstNumber: 'GST123',
      registrationNumber: 'REG-123',
      contactEmail: 'contact@example.com',
      sellerName: 'Seller',
      email: 'seller@example.com',
      businessAddress: '1 Market Road',
      state: '1',
      pincode: '600001',
      panNumber: 'ABCDE1234F',
      contactPersonName: 'Contact Person',
      contactPersonMobile: '9876543210',
      userName: 'seller_user',
      userPassword: 'Seller@123',
      gstCertificate: 'gst.pdf',
      panCard: 'pan.pdf',
      registrationCertificate: 'registration.pdf',
      addressProof: 'address.pdf',
      ownerIdProof: 'id.pdf',
      bankProof: 'bank.pdf',
      accountHolder: 'Seller',
      bankName: 'Example Bank',
      branchName: 'Central',
      ifscCode: 'ABCD0123456',
      accountNumber: '123456789',
      confirmAccountNumber: '123456789',
      accountType: '2',
    });
    const gstCertificate = new File(['certificate'], 'gst.pdf', { type: 'application/pdf' });
    component.uploadedDocuments.set({ gstCertificate });

    component.continue();
    expect(apiCallOrder).toEqual(['onboarding']);
    expect(component.activeStep()).toBe(2);

    component.continue();
    expect(apiCallOrder).toEqual(['onboarding', 'documents']);
    expect(component.activeStep()).toBe(3);

    component.continue();

    expect(apiCallOrder).toEqual(['onboarding', 'documents', 'bank']);
    // CHANGED: the document is uploaded to S3 and seller_docs/insert gets its key.
    expect(s3Images.uploadImage).toHaveBeenCalledWith(gstCertificate, expect.stringMatching(/^[0-9a-f]{32}\.pdf$/), 'documents');
    expect(documentUploadCalls).toEqual([
      { files: { gstCertificate: DOCUMENT_KEY('pdf') }, sellerId: 42 },
    ]);
    expect(component.activeStep()).toBe(4);
    expect(toastMessages.map(({ type }) => type)).toEqual(['success', 'success', 'success']);
  });

  it('submits the mapped seller details and waits for API success before completing', () => {
    component.activeStep.set(1);
    chooseCountry();
    component.values.set({
      businessName: 'ABC Electronics',
      sellerName: 'Arun Kumar',
      businessType: '5',
      email: 'arun@example.com',
      mobileNumber: '9675433210',
      businessAddress: 'Anna Salai',
      city: 'Chennai',
      state: '2',
      country: '1',
      pincode: '600002',
      gstNumber: '33AAHFG9837H2Z4',
      panNumber: 'AAHFG9837H',
      registrationNumber: 'REG1001',
      contactPersonName: 'Arun Kumar',
      contactPersonMobile: '9876543210',
      contactEmail: 'arun@example.com',
      userName: 'arun_seller',
      userPassword: 'Seller@123',
      gstCertificate: 'gst.pdf',
      panCard: 'pan.pdf',
      registrationCertificate: 'registration.pdf',
      addressProof: 'address.pdf',
      ownerIdProof: 'id.pdf',
      bankProof: 'bank.pdf',
      accountHolder: 'Arun Kumar',
      bankName: 'Example Bank',
      branchName: 'Chennai',
      ifscCode: 'ABCD0123456',
      accountNumber: '123456789',
      confirmAccountNumber: '123456789',
      accountType: '2',
    });

    const gstCertificate = new File(['certificate'], 'gst.pdf', { type: 'application/pdf' });
    component.uploadedDocuments.set({ gstCertificate });

    component.continue();
    component.continue();
    component.continue();
    component.continue();

    expect(component.submitted()).toBe(true);
    expect(component.isSubmitting()).toBe(false);
    expect(submittedPayloads).toEqual([
      {
        BUSINESS_NAME: 'ABC Electronics',
        SELLER_NAME: 'Arun Kumar',
        BUSINESS_TYPE: 5,
        EMAIL: 'arun@example.com',
        MOBILE_NUMBER: 9675433210,
        BUSINESS_ADDRESS: 'Anna Salai',
        CITY: 'Chennai',
        STATE: 2,
        COUNTRY: 1,
        PINCODE: '600002',
        GST_NUMBER: '33AAHFG9837H2Z4',
        PAN_NUMBER: 'AAHFG9837H',
        BUSINESS_REGISTRATION_NUMBER: 'REG1001',
        CONTACT_PERSON_NAME: 'Arun Kumar',
        CONTACT_PERSON_MOBILE: 9876543210,
        CONTACT_PERSON_EMAIL: 'arun@example.com',
        USER_NAME: 'arun_seller',
        USER_PASSWORD: 'Seller@123',
        // CHANGED: CREATED_BY removed from the seller_onboarding/insert payload.
      },
    ]);
    // CHANGED: the bank insert sends the selected ACCOUNT_TYPE_ID (Current Account = 2).
    expect(bankInsertPayloads).toEqual([
      {
        ACCOUNT_HOLDER_NAME: 'Arun Kumar',
        BANK_NAME: 'Example Bank',
        BRANCH_NAME: 'Chennai',
        ACCOUNT_NUMBER: '123456789',
        CONFIRM_ACCOUNT_NUMBER: '123456789',
        IFSC_CODE: 'ABCD0123456',
        ACCOUNT_TYPE: 2,
      },
    ]);
    expect(apiCallOrder).toEqual(['onboarding', 'documents', 'bank']);
    // CHANGED: seller_docs/insert gets the uploaded document's S3 key.
    expect(documentUploadCalls).toEqual([
      { files: { gstCertificate: DOCUMENT_KEY('pdf') }, sellerId: 42 },
    ]);
  });

  it('retains all INSERT IDs, avoids duplicate INSERTs, and updates after Review edits', () => {
    setValidSellerDetails();
    component.values.update((current) => ({
      ...current,
      accountHolder: 'Seller',
      bankName: 'Example Bank',
      branchName: 'Central',
      accountNumber: '123456789',
      confirmAccountNumber: '123456789',
      ifscCode: 'ABCD0123456',
      accountType: '2',
    }));

    component.continue();
    component.continue();
    component.continue();
    expect(apiCallOrder).toEqual(['onboarding', 'documents', 'bank']);
    expect(component.activeStep()).toBe(4);
    expect(updatePayloads).toEqual({});

    component.goToStep(1);
    component.continue();
    component.continue();
    component.continue();
    expect(apiCallOrder).toEqual(['onboarding', 'documents', 'bank']);
    expect(component.activeStep()).toBe(4);
    // CHANGED (new): the selection survives moving between steps, and the options are not fetched again.
    expect(component.values()['accountType']).toBe('2');
    expect(component.displayValueFor('accountType', component.accountTypes())).toBe('Current Account');
    expect(accountTypeRequests).toBe(1);

    component.continue();
    expect(apiCallOrder).toEqual([
      'onboarding',
      'documents',
      'bank',
      'update-seller',
      'update-documents',
      'update-bank',
    ]);
    expect(updatePayloads.seller).toMatchObject({ SELLER_ID: 42, USER_ID: 2 });
    expect(updatePayloads.documents).toMatchObject({ DOCUMENT_ID: 17, SELLER_ID: 42 });
    expect(updatePayloads.bank).toMatchObject({ BANK_DETAIL_ID: 24, SELLER_ID: 42, ACCOUNT_TYPE: 2 });
    expect(bankInsertPayloads).toMatchObject([{ ACCOUNT_TYPE: 2 }]);
    // CHANGED: the guest applicant's own USER_ID (from the onboarding insert) goes to every update.
    expect(updateApplicantIds).toEqual([2, 2, 2]);
    expect(component.submitted()).toBe(true);
  });

  it('stops at the bank step and shows an error toast when the bank API fails', () => {
    component.activeStep.set(1);
    chooseCountry();
    component.values.set({
      businessName: 'ABC Electronics',
      sellerName: 'Arun Kumar',
      businessType: '5',
      email: 'arun@example.com',
      mobileNumber: '9675433210',
      businessAddress: 'Anna Salai',
      city: 'Chennai',
      state: '2',
      country: '1',
      pincode: '600002',
      gstNumber: '33AAHFG9837H2Z4',
      panNumber: 'AAHFG9837H',
      registrationNumber: 'REG1001',
      contactPersonName: 'Arun Kumar',
      contactPersonMobile: '9876543210',
      contactEmail: 'arun@example.com',
      userName: 'arun_seller',
      userPassword: 'Seller@123',
      gstCertificate: 'gst.pdf',
      panCard: 'pan.pdf',
      registrationCertificate: 'registration.pdf',
      addressProof: 'address.pdf',
      ownerIdProof: 'id.pdf',
      bankProof: 'bank.pdf',
      accountHolder: 'Arun Kumar',
      bankName: 'Example Bank',
      branchName: 'Chennai',
      ifscCode: 'ABCD0123456',
      accountNumber: '123456789',
      confirmAccountNumber: '123456789',
      accountType: '2',
    });
    bankResult = throwError(() => new Error('Bank service unavailable'));

    component.continue();
    component.continue();
    component.continue();

    expect(component.submitted()).toBe(false);
    expect(component.isSubmitting()).toBe(false);
    expect(component.activeStep()).toBe(3);
    expect(apiCallOrder).toEqual(['onboarding', 'documents', 'bank']);
    expect(toastMessages.at(-1)).toEqual({
      type: 'error',
      message: 'Bank service unavailable',
    });
  });

  describe('document preview', () => {
    const pdf = () => new File(['gst'], 'gst.pdf', { type: 'application/pdf' });

    it('continues from Documents without visiting Preview or issuing duplicate requests', () => {
      setValidSellerDetails();
      component.continue();
      expect(component.activeStep()).toBe(2);

      for (const name of [
        'gstCertificate',
        'panCard',
        'registrationCertificate',
        'addressProof',
        'ownerIdProof',
        'bankProof',
      ]) {
        component.updateDocument(name, pdf());
      }

      expect(component.previewDocument()).toBeNull();
      component.continue();

      expect(component.activeStep()).toBe(3);
      expect(component.previewDocument()).toBeNull();
      expect(apiCallOrder).toEqual(['onboarding', 'documents']);
      expect(documentUploadCalls).toHaveLength(1);
      expect(component.uploadedDocuments()).toHaveProperty('gstCertificate');
    });

    it('keeps the document list open after upload until the user requests preview', () => {
      component.activeStep.set(2);
      const file = pdf();
      component.updateDocument('gstCertificate', file);

      expect(component.activeStep()).toBe(2);
      expect(component.previewDocument()).toBeNull();
      expect(component.documentFileNameFor('gstCertificate')).toBe(file.name);
      expect(component.values()).toMatchObject({ gstCertificate: file.name });

      component.openPreview('gstCertificate');

      expect(component.activeStep()).toBe(2);
      expect(component.previewDocument()).toBe('gstCertificate');
      expect(component.previewedDocument()).toEqual(
        expect.objectContaining({ name: 'gstCertificate', label: 'GST Certificate' }),
      );
    });

    // CHANGED (new): S3 document uploads and saved-document previews.
    it('does not save documents when the storage rejects one, and names the document in the error', () => {
      component.activeStep.set(2);
      (component as unknown as { createdSeller: unknown }).createdSeller = { sellerId: 42, userId: 2 };
      const gst = new File(['gst'], 'gst.pdf', { type: 'application/pdf' });
      const pan = new File(['pan'], 'pan.png', { type: 'image/png' });
      component.updateDocument('gstCertificate', gst);
      component.updateDocument('panCard', pan);
      s3Images.uploadImage.mockImplementation((file: File, fileName: string, folderName: string) =>
        file === gst
          ? throwError(() => new Error('Only JPG, PNG and WEBP images are allowed'))
          : of(`${folderName}/${fileName}`));

      (component as unknown as { submitDocuments(): void }).submitDocuments();

      expect(component.activeStep()).toBe(2);
      expect(documentUploadCalls).toHaveLength(0);
      expect(toastMessages.at(-1)).toEqual({
        type: 'error',
        message: 'The GST Certificate could not be uploaded. Only JPG, PNG and WEBP images are allowed',
      });

      // Replacing the rejected file with an image: only that file is uploaded again.
      const gstImage = new File(['gst'], 'gst.jpg', { type: 'image/jpeg' });
      component.updateDocument('gstCertificate', gstImage);
      s3Images.uploadImage.mockClear();
      (component as unknown as { submitDocuments(): void }).submitDocuments();

      expect(s3Images.uploadImage).toHaveBeenCalledTimes(1);
      expect(s3Images.uploadImage).toHaveBeenCalledWith(gstImage, expect.stringMatching(/^[0-9a-f]{32}\.jpg$/), 'documents');
      expect(documentUploadCalls).toEqual([
        { files: { gstCertificate: DOCUMENT_KEY('jpg'), panCard: DOCUMENT_KEY('png') }, sellerId: 42 },
      ]);
      expect(component.activeStep()).toBe(3);
    });

    it('previews a saved S3 document from its signed URL', () => {
      component.activeStep.set(2);
      const page = component as unknown as {
        existingDocuments: WritableSignal<Record<string, string | null>>;
        canPreview(name: string): boolean;
      };
      page.existingDocuments.set({ gstCertificate: 'documents/0a1b.png', panCard: 'pan.pdf' });

      expect(page.canPreview('gstCertificate')).toBe(true);
      expect(page.canPreview('panCard')).toBe(false); // a legacy name: the file was never uploaded
      component.openPreview('gstCertificate');

      expect(s3Images.imageUrl).toHaveBeenCalledWith('documents/0a1b.png');
      expect(component.previewDocument()).toBe('gstCertificate');
      expect(component.previewedDocument()).toEqual({
        name: 'gstCertificate',
        label: 'GST Certificate',
        file: null,
        src: 'https://bucket.s3.ap-south-1.amazonaws.com/documents/0a1b.png?X-Amz-Signature=abc',
      });
    });

    it('only previews documents that have been uploaded', () => {
      component.openPreview('panCard');
      expect(component.previewDocument()).toBeNull();

      component.updateDocument('panCard', pdf());
      expect(component.previewDocument()).toBeNull();
      component.openPreview('panCard');
      expect(component.previewDocument()).toBe('panCard');
    });

    it('removes the file, closes the preview and requires the document again', () => {
      component.activeStep.set(2);
      component.updateDocument('gstCertificate', pdf());
      component.removeDocument('gstCertificate');

      expect(component.previewDocument()).toBeNull();
      expect(component.documentFileNameFor('gstCertificate')).toBe('');
      expect(component.documentStatusFor('gstCertificate')).toBeNull();
      expect(component.errorFor('gstCertificate')).toBe('This field is required.');
    });

    it('returns from the preview to the document list before leaving the step', () => {
      component.activeStep.set(2);
      component.updateDocument('gstCertificate', pdf());
      component.openPreview('gstCertificate');

      component.goBack();
      expect(component.previewDocument()).toBeNull();
      expect(component.activeStep()).toBe(2);

      component.goBack();
      expect(component.activeStep()).toBe(1);
    });

    it('closes the preview when navigating to another step', () => {
      component.activeStep.set(2);
      component.updateDocument('gstCertificate', pdf());
      component.openPreview('gstCertificate');
      component.goToStep(1);

      expect(component.previewDocument()).toBeNull();
      expect(component.activeStep()).toBe(1);
    });
  });
});

// CHANGED (new): the reported issue. A guest on /sell edits Account Type from Review and submits updates.
describe('SellerOnboarding Account Type for a guest applicant (real service, no session)', () => {
  let http: HttpTestingController;
  let page: ValidationHarness;
  let toasts: { type: 'success' | 'error'; message: string }[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).clearSession();
    toasts = [];
    const toast = {
      showSuccess: (message: string) => toasts.push({ type: 'success', message }),
      showError: (message: string) => toasts.push({ type: 'error', message }),
    } as unknown as ToastService;
    page = new SellerOnboarding(
      { navigateByUrl: vi.fn() } as unknown as Router,
      TestBed.inject(SellerOnboardingService),
      toast,
    ) as unknown as ValidationHarness;

    http.expectOne((req) => req.url.endsWith('/business_type/get')).flush({
      STATUS: 'SUCCESS', DATA: [{ BUSINESS_TYPE_ID: 1, BUSINESS_TYPE_NAME: 'Individual Business' }],
    });
    http.expectOne((req) => req.url.endsWith('/country/get')).flush({
      STATUS: 'SUCCESS', DATA: [{ COUNTRY_ID: 1, COUNTRY_NAME: 'India' }],
    });
    http.expectOne('/api/bank_account_type/get/-1?limit=3&offset=0').flush({
      STATUS: 'SUCCESS',
      MESSAGE: 'Bank account types retrieved successfully',
      DATA: [
        { ACCOUNT_TYPE_ID: 1, ACCOUNT_TYPE: 'Savings Account' },
        { ACCOUNT_TYPE_ID: 2, ACCOUNT_TYPE: 'Current Account' },
      ],
    });
  });

  afterEach(() => http.verify());

  function select(value: string): Event {
    const element = document.createElement('select');
    const option = document.createElement('option');
    option.value = value;
    element.append(option);
    element.value = value;
    return { target: element } as unknown as Event;
  }

  it('inserts the selected ID, then sends the type changed from Review in the bank update', () => {
    page.updateValue('country', select('1'));
    http.expectOne((req) => req.url.endsWith('/state/get')).flush({
      STATUS: 'SUCCESS', DATA: [{ STATE_ID: 23, STATE_NAME: 'Tamil Nadu' }],
    });
    page.values.update((current) => ({
      ...current,
      businessName: 'Crestline Industrial Tools', businessType: '1', mobileNumber: '9876543211',
      city: 'Chennai', gstNumber: '33AAHFG9837H2Z4', registrationNumber: 'REG1001',
      contactEmail: 'naveen.contact@example.com', sellerName: 'Naveen Prakash', email: 'naveen@example.com',
      businessAddress: 'Ambattur Industrial Estate', state: '23', pincode: '600058', panNumber: 'AAHFG9837H',
      contactPersonName: 'Naveen Prakash', contactPersonMobile: '9876543211', userName: 'naveen_seller',
      userPassword: 'Seller@123', gstCertificate: 'gst.png', panCard: 'pan.png',
      registrationCertificate: 'registration.png', addressProof: 'address.png', ownerIdProof: 'id.png',
      bankProof: 'bank.png', accountHolder: 'Naveen Prakash', bankName: 'Bank of Baroda',
      branchName: 'Ambattur Industrial Estate Branch', ifscCode: 'BARB0AMBATT',
      accountNumber: '123456787023', confirmAccountNumber: '123456787023',
    }));
    page.updateValue('accountType', select('2'));

    // Steps 1-3: the three INSERT APIs (no session needed).
    page.continue();
    http.expectOne('/api/seller_onboarding/insert').flush({ STATUS: 'SUCCESS', SELLER_ID: 42, USER_ID: 2 });
    page.continue();
    http.expectOne('/api/seller_docs/insert').flush({ STATUS: 'SUCCESS', DOCUMENT_ID: 17 });
    page.continue();
    const bankInsert = http.expectOne('/api/seller_bank_details/insert');
    expect(bankInsert.request.body).toMatchObject({ ACCOUNT_TYPE: 2, SELLER_ID: 42 });
    bankInsert.flush({ STATUS: 'SUCCESS', BANK_DETAIL_ID: 24 });
    expect(page.activeStep()).toBe(4);

    // Review → Edit Bank Details → Savings Account → Continue: no second insert.
    page.goToStep(3);
    page.updateValue('accountType', select('1'));
    page.continue();
    expect(page.activeStep()).toBe(4);
    expect(page.displayValueFor('accountType', page.accountTypes())).toBe('Savings Account');
    http.expectNone((req) => req.url.endsWith('/insert'));

    // Submit Updates: previously rejected with "A valid authenticated user ID is required to update seller details."
    page.continue();
    const sellerUpdate = http.expectOne('/api/seller_onboarding/update');
    expect(sellerUpdate.request.body).toMatchObject({ SELLER_ID: 42, USER_ID: 2, UPDATED_BY: 2 });
    sellerUpdate.flush({ STATUS: 'SUCCESS' });
    const documentsUpdate = http.expectOne('/api/seller_docs/update');
    expect(documentsUpdate.request.body).toMatchObject({ DOCUMENT_ID: 17, SELLER_ID: 42, UPDATED_BY: 2 });
    documentsUpdate.flush({ STATUS: 'SUCCESS' });
    const bankUpdate = http.expectOne('/api/seller_bank_details/update');
    expect(bankUpdate.request.body).toMatchObject({
      BANK_DETAIL_ID: 24, SELLER_ID: 42, ACCOUNT_TYPE: 1, UPDATED_BY: 2,
    });
    bankUpdate.flush({ STATUS: 'SUCCESS' });

    expect(page.submitted()).toBe(true);
    expect(toasts.filter(({ type }) => type === 'error')).toEqual([]);
    expect(toasts.at(-1)).toEqual({
      type: 'success',
      message: 'Seller, documents, and bank details were updated successfully.',
    });
  });
});

// CHANGED (new): the rendered dropdown: options, preselection, change event and keeping the value between steps.
describe('SellerOnboarding Account Type dropdown (rendered)', () => {
  it('shows the selected type, stores the chosen ACCOUNT_TYPE_ID and keeps it between steps', () => {
    TestBed.configureTestingModule({
      imports: [SellerOnboarding],
      providers: [
        provideRouter([]),
        {
          provide: SellerOnboardingService,
          useValue: {
            getBusinessTypes: () => of([]),
            getCountries: () => of([]),
            getBankAccountTypes: () => of(ACCOUNT_TYPES),
            getErrorMessage: () => 'Request failed',
          },
        },
        { provide: ToastService, useValue: { showSuccess: vi.fn(), showError: vi.fn() } },
      ],
    });
    // The storefront background is irrelevant here.
    TestBed.overrideComponent(SellerOnboarding, {
      remove: { imports: [Home] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(SellerOnboarding);
    const view = fixture.componentInstance as unknown as ValidationHarness;
    const accountTypeSelect = () =>
      fixture.nativeElement.querySelector('#seller-accountType') as HTMLSelectElement;

    view.values.set({ accountType: '2' });
    view.activeStep.set(3);
    fixture.detectChanges();
    expect(Array.from(accountTypeSelect().options, (option) => [option.value, option.textContent?.trim()])).toEqual([
      ['', 'Select account type'],
      ['1', 'Savings Account'],
      ['2', 'Current Account'],
    ]);
    expect(accountTypeSelect().disabled).toBe(false);
    expect(accountTypeSelect().value).toBe('2');

    accountTypeSelect().value = '1';
    accountTypeSelect().dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(view.values()['accountType']).toBe('1');

    view.activeStep.set(4);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-labelledby="seller-bank-review-title"]').textContent)
      .toContain('Savings Account');

    view.activeStep.set(3);
    fixture.detectChanges();
    expect(accountTypeSelect().value).toBe('1');
  });
});