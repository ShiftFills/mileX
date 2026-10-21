import type { WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { SellerOnboarding } from './seller-onboarding';

type ValidationHarness = {
  activeStep: WritableSignal<number>;
  attemptedNext: WritableSignal<boolean>;
  touchedFields: WritableSignal<Record<string, boolean>>;
  uploadedDocuments: WritableSignal<Record<string, File>>;
  values: WritableSignal<Record<string, string>>;
  submitted: WritableSignal<boolean>;
  bankFields: { name: string }[];
  errorFor: (name: string) => string | null;
  markTouched: (name: string) => void;
  documentFileNameFor: (name: string) => string;
  documentStatusFor: (name: string) => 'uploaded' | null;
  updateValue: (name: string, event: Event) => void;
  updateDocument: (name: string, file: File) => void;
  continue: () => void;
};

describe('SellerOnboarding validation', () => {
  let component: ValidationHarness;

  beforeEach(() => {
    const router = { navigateByUrl: vi.fn() } as unknown as Router;
    component = new SellerOnboarding(router) as unknown as ValidationHarness;
    component.attemptedNext.set(true);
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
    expect(component.errorFor('panNumber')).toBe('Please enter a valid PAN number (e.g., ABCDE1234F).');

    component.values.set({ panNumber: 'ABCDE1234F' });
    expect(component.errorFor('panNumber')).toBeNull();
  });

  it('clears the GSTIN format error as a valid GSTIN is typed, including lowercase input', () => {
    component.values.set({ gstNumber: '27AAACR5055K1Z' });
    expect(component.errorFor('gstNumber')).toBe('Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).');

    const input = document.createElement('input');
    input.value = '27aaacr5055k1z7';
    component.updateValue('gstNumber', { target: input } as unknown as Event);

    expect(component.errorFor('gstNumber')).toBeNull();
    expect(component.values()['gstNumber']).toBe('27aaacr5055k1z7');
  });

  it('keeps the reported GSTIN invalid and clears the message for a corrected structure and checksum', () => {
    component.values.set({ gstNumber: '33AAHDG9837H2VG' });
    expect(component.errorFor('gstNumber')).toBe('Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).');

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
    expect(component.errorFor('gstNumber')).toBe('Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).');

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

  it('accepts dropdown values from the configured options', () => {
    component.values.set({ businessType: 'partnership', country: 'india', state: 'karnataka' });
    expect(component.errorFor('businessType')).toBeNull();
    expect(component.errorFor('country')).toBeNull();
    expect(component.errorFor('state')).toBeNull();

    component.activeStep.set(3);
    component.values.set({ accountType: 'current' });
    expect(component.errorFor('accountType')).toBeNull();
  });

  it('requires a non-whitespace registration number for every supported business type', () => {
    for (const businessType of ['private-limited', 'partnership', 'sole-proprietorship', 'other']) {
      component.values.set({ businessType, registrationNumber: '   ' });
      expect(component.errorFor('registrationNumber')).toBe('Business registration number is required.');
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

    const replacement = new File(['replacement'], 'updated-supporting-document.png', { type: 'image/png' });
    component.updateDocument('supportingDocument', replacement);
    expect(component.documentFileNameFor('supportingDocument')).toBe('updated-supporting-document.png');
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
    expect(component.bankFields.filter(({ name }) => name === 'confirmAccountNumber')).toHaveLength(1);
    expect(component.bankFields.some(({ name }) => name === 'confirmAccountNumberAgain')).toBe(false);

    component.values.set({ accountNumber: '123456789', confirmAccountNumber: '123456780' });
    expect(component.errorFor('confirmAccountNumber')).toBe('Account numbers do not match.');

    component.values.set({ accountNumber: '123456789', confirmAccountNumber: '123456789' });
    expect(component.errorFor('confirmAccountNumber')).toBeNull();
  });

  it('blocks Step 3 progression when account numbers do not match', () => {
    component.activeStep.set(3);
    component.values.set({
      businessName: 'Example Business',
      businessType: 'partnership',
      mobileNumber: '9876543210',
      city: 'Bengaluru',
      country: 'india',
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
});
