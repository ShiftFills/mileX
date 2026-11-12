import type { WritableSignal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { SellerOnboarding } from './seller-onboarding';
import {
  SellerOnboardingPayload,
  SellerOnboardingResult,
  SellerDocumentsResult,
  SellerBankDetailsResult,
  SellerOnboardingService,
} from '../../services/seller-onboarding.service';

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
  lookupStatus: WritableSignal<
    Record<'businessType' | 'country' | 'state', 'loading' | 'success' | 'error'>
  >;
  bankFields: { name: string }[];
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
  let documentUploadCalls: { files: Readonly<Record<string, File>>; sellerId: number }[];
  let apiCallOrder: string[];
  let updatePayloads: { seller?: unknown; documents?: unknown; bank?: unknown };
  let toastMessages: { type: 'success' | 'error'; message: string }[];
  let stateCountryIds: string[];
  let deferStateLookup: boolean;
  let stateLookupUnsubscribed: boolean;

  beforeEach(() => {
    submittedPayloads = [];
    submissionResult = of({ sellerId: 42, userId: 2 });
    documentResult = of({ documentId: 17, message: 'Seller documents uploaded successfully.' });
    bankResult = of({ bankDetailId: 24, message: 'Bank details saved successfully.' });
    documentUploadCalls = [];
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
      getErrorMessage: (error: unknown) =>
        error instanceof Error ? error.message : 'Request failed',
      submitWithResult: (payload: SellerOnboardingPayload) => {
        submittedPayloads.push(payload);
        apiCallOrder.push('onboarding');
        return submissionResult;
      },
      uploadDocuments: (files: Readonly<Record<string, File>>, sellerId: number) => {
        documentUploadCalls.push({ files, sellerId });
        apiCallOrder.push('documents');
        return documentResult;
      },
      saveBankDetails: (_details: unknown, _sellerId: number) => {
        apiCallOrder.push('bank');
        return bankResult;
      },
      updateSeller: (payload: unknown) => {
        updatePayloads.seller = payload;
        apiCallOrder.push('update-seller');
        return of('Seller updated');
      },
      updateDocuments: (payload: unknown) => {
        updatePayloads.documents = payload;
        apiCallOrder.push('update-documents');
        return of('Documents updated');
      },
      updateBankDetails: (payload: unknown) => {
        updatePayloads.bank = payload;
        apiCallOrder.push('update-bank');
        return of('Bank details updated');
      },
    } as unknown as SellerOnboardingService;
    const toast = {
      showSuccess: (message: string) => toastMessages.push({ type: 'success', message }),
      showError: (message: string) => toastMessages.push({ type: 'error', message }),
    } as unknown as ToastService;
    component = new SellerOnboarding(router, sellerOnboarding, toast) as unknown as ValidationHarness;
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
          ACCOUNT_TYPE: 1,
        });
      },
      getBusinessTypes: () => of([{ id: '5', name: 'Retail Business' }]),
      getCountries: () => of([{ id: '1', name: 'India' }]),
      getStates: () => of([{ id: '33', name: 'Tamil Nadu' }]),
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
    const edit = new SellerOnboarding(router, existingSellerService, toast, route) as unknown as ValidationHarness;
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
    });
    expect(edit.displayValueFor('businessType', edit.businessTypes())).toBe('Retail Business');
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
    expect(edit.bankFields.map((field) => [field.name, edit.errorFor(field.name)])).toEqual(
      edit.bankFields.map((field) => [field.name, null]),
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
      UPDATED_BY: 1,
    });
    expect(updatedDocuments).toHaveLength(1);
    expect(updatedDocuments[0]).toMatchObject({
      DOCUMENT_ID: 7,
      SELLER_ID: 42,
      GST_CERTIFICATE: 'gst-updated.pdf',
      PAN_CARD: 'pan.pdf',
      UPDATED_BY: 1,
    });
    expect(updatedBankDetails[0]).toMatchObject({
      BANK_DETAIL_ID: 9,
      SELLER_ID: 42,
      BANK_NAME: 'Updated Bank',
      UPDATED_BY: 1,
    });
    expect(apiOrder).toEqual(['seller', 'documents', 'bank']);
    expect(toast.showSuccess).toHaveBeenCalledTimes(1);
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it('updates all existing records even when their details are unchanged', () => {
    const apiOrder: string[] = [];
    let updatePayload: unknown;
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
      updateSeller: (payload: unknown) => {
        apiOrder.push('seller');
        updatePayload = payload;
        return of('Seller updated');
      },
      updateDocuments: () => {
        apiOrder.push('documents');
        return of('Documents updated');
      },
      updateBankDetails: () => {
        apiOrder.push('bank');
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

    component.activeStep.set(3);
    component.values.set({ accountType: 'current' });
    expect(component.errorFor('accountType')).toBeNull();
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
    expect(component.bankFields.filter(({ name }) => name === 'confirmAccountNumber')).toHaveLength(
      1,
    );
    expect(component.bankFields.some(({ name }) => name === 'confirmAccountNumberAgain')).toBe(
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
      accountType: 'current',
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
      accountType: 'current',
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
    expect(documentUploadCalls).toEqual([
      { files: { gstCertificate }, sellerId: 42 },
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
      accountType: 'current',
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
    expect(apiCallOrder).toEqual(['onboarding', 'documents', 'bank']);
    expect(documentUploadCalls).toEqual([
      { files: { gstCertificate }, sellerId: 42 },
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
      accountType: 'current',
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
    expect(updatePayloads.bank).toMatchObject({ BANK_DETAIL_ID: 24, SELLER_ID: 42 });
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
      accountType: 'current',
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