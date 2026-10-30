import type { WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { SellerOnboarding } from './seller-onboarding';
import {
  SellerOnboardingPayload,
  SellerOnboardingService,
} from '../../services/seller-onboarding.service';

type ValidationHarness = {
  activeStep: WritableSignal<number>;
  attemptedNext: WritableSignal<boolean>;
  touchedFields: WritableSignal<Record<string, boolean>>;
  uploadedDocuments: WritableSignal<Record<string, File>>;
  values: WritableSignal<Record<string, string>>;
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
  submissionError(): string | null;
  isLookupDisabled(fieldName: string): boolean;
  lookupErrorFor(fieldName: string): string | null;
};

describe('SellerOnboarding validation', () => {
  let component: ValidationHarness;
  let submittedPayloads: SellerOnboardingPayload[];
  let submissionResult: Observable<void>;
  let stateCountryIds: string[];
  let deferStateLookup: boolean;
  let stateLookupUnsubscribed: boolean;

  beforeEach(() => {
    submittedPayloads = [];
    submissionResult = of(undefined);
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
      submit: (payload: SellerOnboardingPayload) => {
        submittedPayloads.push(payload);
        return submissionResult;
      },
    } as unknown as SellerOnboardingService;
    component = new SellerOnboarding(router, sellerOnboarding) as unknown as ValidationHarness;
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
    ['gstNumber', '29ABCDE1234F1Z8', 'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).'],
    ['gstNumber', '29ABCDE1234F0Z7', 'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).'],
    ['gstNumber', '27AAACR5055K1Z', 'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).'],
    ['gstNumber', '27AAACR5055K1@7', 'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).'],
    ['gstNumber', '56AAHFG9837H2ZW', 'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).'],
    ['gstNumber', '33AAHDG9837H2VG', 'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).'],
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

  it('clears the GSTIN format error as a valid GSTIN is typed, including lowercase input', () => {
    component.values.set({ gstNumber: '27AAACR5055K1Z' });
    expect(component.errorFor('gstNumber')).toBe(
      'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).',
    );

    const input = document.createElement('input');
    input.value = '27aaacr5055k1z7';
    component.updateValue('gstNumber', { target: input } as unknown as Event);

    expect(component.errorFor('gstNumber')).toBeNull();
    expect(component.values()['gstNumber']).toBe('27aaacr5055k1z7');
  });

  it('keeps the reported GSTIN invalid and clears the message for a corrected structure and checksum', () => {
    component.values.set({ gstNumber: '33AAHDG9837H2VG' });
    expect(component.errorFor('gstNumber')).toBe(
      'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).',
    );

    const input = document.createElement('input');
    input.value = '33AAHFG9837H2Z4';
    component.updateValue('gstNumber', { target: input } as unknown as Event);

    expect(component.errorFor('gstNumber')).toBeNull();
  });

  it('shows only the required GST message for an empty value after validation is attempted', () => {
    component.values.set({ gstNumber: '' });
    expect(component.errorFor('gstNumber')).toBe('GST number is required.');

    component.attemptedNext.set(false);
    expect(component.errorFor('gstNumber')).toBeNull();
  });

  it('shows format errors as the user types and required errors after a field is blurred', () => {
    component.attemptedNext.set(false);
    component.values.set({ gstNumber: 'not-a-gstin' });
    expect(component.errorFor('gstNumber')).toBe(
      'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).',
    );

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
    component.values.set({ businessType: 'partnership' });
    chooseCountry();
    component.values.update((values) => ({ ...values, state: 'karnataka' }));
    expect(component.errorFor('businessType')).toBeNull();
    expect(component.errorFor('country')).toBeNull();
    expect(component.errorFor('state')).toBeNull();

    component.activeStep.set(3);
    component.values.set({ accountType: 'current' });
    expect(component.errorFor('accountType')).toBeNull();
  });

  it('loads states using the selected country ID and clears state on country changes', () => {
    chooseCountry('1');
    component.values.update((values) => ({ ...values, state: 'karnataka' }));
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
    component.values.set({ gstNumber: '29ABCDE1234F1Z8' });
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
      businessType: 'partnership',
      mobileNumber: '9876543210',
      city: 'Bengaluru',
      country: '1',
      gstNumber: '27AAPFU0939F1ZV',
      registrationNumber: 'REG-123',
      contactEmail: 'contact@example.com',
      sellerName: 'Seller',
      email: 'seller@example.com',
      businessAddress: '1 Market Road',
      state: 'karnataka',
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

  it('submits the mapped seller details and waits for API success before completing', () => {
    component.activeStep.set(4);
    chooseCountry();
    component.values.set({
      businessName: 'ABC Electronics',
      sellerName: 'Arun Kumar',
      businessType: 'Retail Business',
      email: 'arun@example.com',
      mobileNumber: '9675433210',
      businessAddress: 'Anna Salai',
      city: 'Chennai',
      state: 'Tamil Nadu',
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
      accountNumber: '123456789',
      confirmAccountNumber: '123456789',
      accountType: 'current',
    });

    component.continue();

    expect(component.submitted()).toBe(true);
    expect(component.isSubmitting()).toBe(false);
    expect(component.submissionError()).toBeNull();
    expect(submittedPayloads).toEqual([
      {
        BUSINESS_NAME: 'ABC Electronics',
        SELLER_NAME: 'Arun Kumar',
        BUSINESS_TYPE: 'Retail Business',
        EMAIL: 'arun@example.com',
        MOBILE_NUMBER: 9675433210,
        BUSINESS_ADDRESS: 'Anna Salai',
        CITY: 'Chennai',
        STATE: 'Tamil Nadu',
        COUNTRY: 'India',
        PINCODE: '600002',
        GST_NUMBER: '33AAHFG9837H2Z4',
        PAN_NUMBER: 'AAHFG9837H',
        BUSINESS_REGISTRATION_NUMBER: 'REG1001',
        CONTACT_PERSON_NAME: 'Arun Kumar',
        CONTACT_PERSON_MOBILE: 9876543210,
        CONTACT_PERSON_EMAIL: 'arun@example.com',
        USER_NAME: 'arun_seller',
        USER_PASSWORD: 'Seller@123',
        CREATED_BY: 1,
      },
    ]);
  });

  it('keeps the review step open and reports a submission error', () => {
    component.activeStep.set(4);
    chooseCountry();
    component.values.set({
      businessName: 'ABC Electronics',
      sellerName: 'Arun Kumar',
      businessType: 'Retail Business',
      email: 'arun@example.com',
      mobileNumber: '9675433210',
      businessAddress: 'Anna Salai',
      city: 'Chennai',
      state: 'Tamil Nadu',
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
      accountNumber: '123456789',
      confirmAccountNumber: '123456789',
      accountType: 'current',
    });
    submissionResult = throwError(() => new Error('Seller service unavailable'));

    component.continue();

    expect(component.submitted()).toBe(false);
    expect(component.isSubmitting()).toBe(false);
    expect(component.submissionError()).toBe('Seller service unavailable');
  });

  describe('document preview', () => {
    const pdf = () => new File(['gst'], 'gst.pdf', { type: 'application/pdf' });

    it('opens the preview for a document right after it is uploaded', () => {
      component.activeStep.set(2);
      component.updateDocument('gstCertificate', pdf());

      expect(component.previewDocument()).toBe('gstCertificate');
      expect(component.previewedDocument()).toEqual(
        expect.objectContaining({ name: 'gstCertificate', label: 'GST Certificate' }),
      );
    });

    it('only previews documents that have been uploaded', () => {
      component.openPreview('panCard');
      expect(component.previewDocument()).toBeNull();

      component.updateDocument('panCard', pdf());
      component.previewDocument.set(null);
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

      component.goBack();
      expect(component.previewDocument()).toBeNull();
      expect(component.activeStep()).toBe(2);

      component.goBack();
      expect(component.activeStep()).toBe(1);
    });

    it('closes the preview when navigating to another step', () => {
      component.activeStep.set(2);
      component.updateDocument('gstCertificate', pdf());
      component.goToStep(3);

      expect(component.previewDocument()).toBeNull();
    });
  });
});
