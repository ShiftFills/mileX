import { ChangeDetectionStrategy, Component, computed, OnDestroy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { Subscription } from 'rxjs';
import { Button } from '@shared/components/button/button';
import { Badge } from '@shared/components/badge/badge';
import { Card } from '@shared/components/card/card';
import { Checkbox } from '@shared/components/checkbox/checkbox';
import { FileUpload } from '@shared/components/file-upload/file-upload';
import { Input } from '@shared/components/input/input';
import { SearchableSelect } from '@shared/components/searchable-select/searchable-select';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';
import { Home } from '@features/home/pages/home/home';
import { DocumentPreview } from '../../components/document-preview/document-preview';
import {
  SellerLookupOption,
  SellerOnboardingPayload,
  SellerOnboardingService,
} from '../../services/seller-onboarding.service';

interface SellerFieldOption {
  label: string;
  value: string;
}

interface SellerFieldDefinition {
  name: string;
  label: string;
  placeholder: string;
  icon:
    | 'business'
    | 'user'
    | 'type'
    | 'email'
    | 'phone'
    | 'location'
    | 'globe'
    | 'document'
    | 'card'
    | 'map';
  type?:
    'text' | 'email' | 'tel' | 'password' | 'select' | 'searchable-select' | 'textarea' | 'file';
  required?: boolean;
  options?: readonly SellerFieldOption[];
}

type LookupName = 'businessType' | 'country' | 'state';
type LookupStatus = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-seller-onboarding',
  imports: [
    Badge,
    Button,
    Card,
    Checkbox,
    DocumentPreview,
    FileUpload,
    Home,
    Input,
    NgTemplateOutlet,
    SearchableSelect,
    Select,
    Textarea,
  ],
  templateUrl: './seller-onboarding.html',
  styleUrl: './seller-onboarding.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerOnboarding implements OnDestroy {
  protected readonly activeStep = signal(1);
  protected readonly submitted = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly submissionError = signal<string | null>(null);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly uploadedDocuments = signal<Record<string, File>>({});
  protected readonly attemptedNext = signal(false);
  /** Name of the document currently shown in the Step 2 preview panel (null = document list). */
  protected readonly previewDocument = signal<string | null>(null);
  protected readonly touchedFields = signal<Record<string, boolean>>({});
  protected readonly accuracyConfirmed = signal(true);
  protected readonly businessTypes = signal<SellerFieldOption[]>([]);
  protected readonly countries = signal<SellerFieldOption[]>([]);
  protected readonly states = signal<SellerFieldOption[]>([]);
  protected readonly lookupStatus = signal<Record<LookupName, LookupStatus>>({
    businessType: 'loading',
    country: 'loading',
    state: 'success',
  });
  protected readonly lookupErrors = signal<Partial<Record<LookupName, string>>>({});
  private readonly lookupSubscriptions = new Map<LookupName, Subscription>();
  private submissionSubscription: Subscription | null = null;
  private readonly router: Router;

  protected readonly previewedDocument = computed(() => {
    const name = this.previewDocument();
    const file = name ? this.uploadedDocuments()[name] : undefined;
    const field = this.documentFields.find((item) => item.name === name);
    return name && file && field ? { name, label: field.label, file } : null;
  });

  protected readonly steps = [
    'Seller Onboarding',
    'Seller Documents',
    'Seller Bank Details',
    'Review & Submit',
  ];

  protected readonly leftFields = computed<SellerFieldDefinition[]>(() => [
    {
      name: 'businessName',
      label: 'Business Name',
      placeholder: 'Enter business name',
      icon: 'business',
    },
    {
      name: 'businessType',
      label: 'Business Type',
      placeholder: 'Select business type',
      icon: 'type',
      type: 'searchable-select',
      options: this.businessTypes(),
    },
    {
      name: 'mobileNumber',
      label: 'Mobile Number',
      placeholder: 'Enter mobile number',
      icon: 'phone',
      type: 'tel',
    },
    { name: 'city', label: 'City', placeholder: 'Enter city', icon: 'location' },
    {
      name: 'country',
      label: 'Country',
      placeholder: 'Select country',
      icon: 'globe',
      type: 'select',
      options: this.countries(),
    },
    { name: 'gstNumber', label: 'GST Number', placeholder: 'Enter GST number', icon: 'document' },
    {
      name: 'registrationNumber',
      label: 'Business Registration Number',
      placeholder: 'Enter business registration number',
      icon: 'document',
    },
    {
      name: 'contactEmail',
      label: 'Contact Person Email',
      placeholder: 'Enter contact person email',
      icon: 'email',
      type: 'email',
    },
  ]);

  protected readonly rightTopFields: SellerFieldDefinition[] = [
    { name: 'sellerName', label: 'Seller Name', placeholder: 'Enter seller name', icon: 'user' },
    {
      name: 'email',
      label: 'Email',
      placeholder: 'Enter email address',
      icon: 'email',
      type: 'email',
    },
    {
      name: 'businessAddress',
      label: 'Business Address',
      placeholder: 'Enter business address',
      icon: 'location',
      type: 'textarea',
    },
  ];

  protected readonly rightBottomFields: SellerFieldDefinition[] = [
    { name: 'panNumber', label: 'PAN Number', placeholder: 'Enter PAN number', icon: 'card' },
    {
      name: 'contactPersonName',
      label: 'Contact Person Name',
      placeholder: 'Enter contact person name',
      icon: 'user',
    },
    {
      name: 'contactPersonMobile',
      label: 'Contact Person Mobile',
      placeholder: 'Enter mobile number',
      icon: 'phone',
      type: 'tel',
    },
    { name: 'userName', label: 'Account Username', placeholder: 'Choose a username', icon: 'user' },
    {
      name: 'userPassword',
      label: 'Account Password',
      placeholder: 'Choose a password',
      icon: 'card',
      type: 'password',
    },
  ];

  protected readonly documentFields: SellerFieldDefinition[] = [
    {
      name: 'gstCertificate',
      label: 'GST Certificate',
      placeholder: 'Choose Files',
      icon: 'document',
      type: 'file',
    },
    { name: 'panCard', label: 'PAN Card', placeholder: 'Choose Files', icon: 'card', type: 'file' },
    {
      name: 'registrationCertificate',
      label: 'Business Registration Certificate',
      placeholder: 'Choose Files',
      icon: 'business',
      type: 'file',
    },
    {
      name: 'addressProof',
      label: 'Address Proof',
      placeholder: 'Choose Files',
      icon: 'document',
      type: 'file',
    },
    {
      name: 'ownerIdProof',
      label: 'Owner/Director ID Proof',
      placeholder: 'Choose Files',
      icon: 'user',
      type: 'file',
    },
    {
      name: 'bankProof',
      label: 'Bank Proof / Cancelled Cheque',
      placeholder: 'Choose Files',
      icon: 'card',
      type: 'file',
    },
    {
      name: 'supportingDocument',
      label: 'Other Supporting Document',
      placeholder: 'Choose Files',
      icon: 'document',
      type: 'file',
      required: false,
    },
  ];

  protected readonly accountTypes: SellerFieldOption[] = [
    { label: 'Savings Account', value: 'savings' },
    { label: 'Current Account', value: 'current' },
  ];

  protected readonly bankFields: SellerFieldDefinition[] = [
    {
      name: 'accountHolder',
      label: 'Account Holder Name',
      placeholder: 'Enter account holder name',
      icon: 'user',
    },
    { name: 'bankName', label: 'Bank Name', placeholder: 'Enter bank name', icon: 'business' },
    {
      name: 'branchName',
      label: 'Branch Name',
      placeholder: 'Enter branch name',
      icon: 'business',
    },
    {
      name: 'accountNumber',
      label: 'Account Number',
      placeholder: 'Enter bank account number',
      icon: 'card',
    },
    {
      name: 'confirmAccountNumber',
      label: 'Confirm Account Number',
      placeholder: 'Enter account number',
      icon: 'card',
    },
    {
      name: 'accountType',
      label: 'Account Type',
      placeholder: 'Select account type',
      icon: 'card',
      type: 'select',
      options: this.accountTypes,
    },
  ];

  protected readonly requiredFieldsByStep: Record<number, string[]> = {
    1: [
      'businessName',
      'businessType',
      'mobileNumber',
      'city',
      'country',
      'gstNumber',
      'registrationNumber',
      'contactEmail',
      'sellerName',
      'email',
      'businessAddress',
      'state',
      'pincode',
      'panNumber',
      'contactPersonName',
      'contactPersonMobile',
      'userName',
      'userPassword',
    ],
    2: [
      'gstCertificate',
      'panCard',
      'registrationCertificate',
      'addressProof',
      'ownerIdProof',
      'bankProof',
    ],
    3: [
      'accountHolder',
      'bankName',
      'branchName',
      'accountNumber',
      'confirmAccountNumber',
      'accountType',
    ],
  };

  private readonly requiredMessagesByField: Record<string, string> = {
    businessName: 'Business name is required.',
    businessType: 'Please select a business type.',
    mobileNumber: 'Mobile number is required.',
    city: 'City is required.',
    country: 'Please select a country.',
    gstNumber: 'GST number is required.',
    registrationNumber: 'Business registration number is required.',
    contactEmail: 'Contact person email is required.',
    sellerName: 'Seller name is required.',
    email: 'Email is required.',
    businessAddress: 'Business address is required.',
    state: 'Please select a state.',
    pincode: 'Pincode is required.',
    panNumber: 'PAN number is required.',
    contactPersonName: 'Contact person name is required.',
    contactPersonMobile: 'Contact person mobile is required.',
    userName: 'Account username is required.',
    userPassword: 'Account password is required.',
    accountHolder: 'Account holder name is required.',
    bankName: 'Bank name is required.',
    branchName: 'Branch name is required.',
    accountNumber: 'Account number is required.',
    confirmAccountNumber: 'Please confirm your account number.',
    accountType: 'Please select an account type.',
  };

  private readonly gstinStateCodes = new Set([
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
    '18',
    '19',
    '20',
    '21',
    '22',
    '23',
    '24',
    '26',
    '27',
    '29',
    '30',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
    '97',
    '99',
  ]);

  constructor(
    router: Router,
    private readonly sellerOnboarding: SellerOnboardingService,
  ) {
    this.router = router;
    this.loadLookup('businessType');
    this.loadLookup('country');
  }

  ngOnDestroy(): void {
    for (const subscription of this.lookupSubscriptions.values()) subscription.unsubscribe();
    this.submissionSubscription?.unsubscribe();
  }

  protected valueFor(name: string): string {
    return this.values()[name] ?? '';
  }

  protected displayValueFor(name: string, options: readonly SellerFieldOption[] = []): string {
    const value = this.valueFor(name);
    return options.find((option) => option.value === value)?.label ?? value;
  }

  protected maskedAccountNumber(): string {
    const accountNumber = this.valueFor('accountNumber');
    return accountNumber ? `•••• •••• ${accountNumber.slice(-4)}` : '';
  }

  protected documentFileNameFor(name: string): string {
    return this.uploadedDocuments()[name]?.name ?? '';
  }

  protected documentStatusFor(name: string): 'uploaded' | null {
    return this.uploadedDocuments()[name] ? 'uploaded' : null;
  }

  protected fieldId(name: string): string {
    return `seller-${name}`;
  }

  protected errorFor(name: string): string | null {
    if (!this.attemptedNext() && !this.touchedFields()[name] && !this.valueFor(name).trim())
      return null;
    return this.errorForStep(name, this.activeStep());
  }

  protected markTouched(name: string): void {
    this.touchedFields.update((current) => ({ ...current, [name]: true }));
  }

  private errorForStep(name: string, step: number): string | null {
    const value = this.valueFor(name).trim();
    if (!value) {
      return this.requiredFieldsByStep[step]?.includes(name)
        ? (this.requiredMessagesByField[name] ?? 'This field is required.')
        : null;
    }

    switch (name) {
      case 'email':
      case 'contactEmail':
        return this.isValidEmail(value) ? null : 'Please enter a valid email address.';
      case 'mobileNumber':
      case 'contactPersonMobile':
        return this.isValidMobileNumber(value)
          ? null
          : 'Please enter a valid 10-digit mobile number.';
      case 'pincode':
        return /^[1-9]\d{5}$/.test(value) ? null : 'Please enter a valid 6-digit PIN code.';
      case 'gstNumber':
        return this.isValidGstin(value)
          ? null
          : 'Please enter a valid GST number (e.g., 27AAPFU0939F1ZV).';
      case 'panNumber':
        return this.isValidPan(value)
          ? null
          : 'Please enter a valid PAN number (e.g., ABCDE1234F).';
      case 'businessType':
      case 'country':
      case 'state':
      case 'accountType':
        return this.isValidOption(name, value) ? null : 'Please select a valid option.';
      case 'accountNumber':
        return /^\d+$/.test(value) ? null : 'Account number must contain digits only.';
      case 'confirmAccountNumber':
        return this.valueFor('accountNumber').trim() === value
          ? null
          : 'Account numbers do not match.';
      case 'registrationNumber':
        return null;
      default:
        return null;
    }
  }

  private isValidEmail(value: string): boolean {
    return /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
      value,
    );
  }

  private isValidMobileNumber(value: string): boolean {
    return /^[6-9]\d{9}$/.test(value);
  }

  private isValidPan(value: string): boolean {
    const normalized = value.toUpperCase();
    return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized);
  }

  private isValidGstin(value: string): boolean {
    const normalized = value.toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalized)) return false;
    if (!this.gstinStateCodes.has(normalized.slice(0, 2))) return false;

    const embeddedPan = normalized.slice(2, 12);
    if (!this.isValidPan(embeddedPan)) return false;

    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let sum = 0;
    for (let index = 0; index < 14; index += 1) {
      const product = alphabet.indexOf(normalized[index]) * (index % 2 === 0 ? 1 : 2);
      sum += Math.floor(product / 36) + (product % 36);
    }
    const checkCharacter = alphabet[(36 - (sum % 36)) % 36];
    return normalized[14] === checkCharacter;
  }

  private isValidOption(name: string, value: string): boolean {
    const options =
      name === 'businessType'
        ? this.businessTypes()
        : name === 'country'
          ? this.countries()
          : name === 'state'
            ? this.states()
            : name === 'accountType'
              ? this.accountTypes
              : [];
    return options.some((option) => option.value === value);
  }

  protected loadLookup(name: LookupName): void {
    this.lookupSubscriptions.get(name)?.unsubscribe();
    this.lookupSubscriptions.delete(name);
    this.lookupErrors.update((errors) => {
      const { [name]: _removed, ...remaining } = errors;
      return remaining;
    });

    const countryId = this.valueFor('country');
    if (name === 'state' && !countryId) {
      this.states.set([]);
      this.lookupStatus.update((status) => ({ ...status, state: 'success' }));
      return;
    }

    this.lookupStatus.update((status) => ({ ...status, [name]: 'loading' }));

    const request =
      name === 'businessType'
        ? this.sellerOnboarding.getBusinessTypes()
        : name === 'country'
          ? this.sellerOnboarding.getCountries()
          : this.sellerOnboarding.getStates(countryId);
    const subscription = request.subscribe({
      next: (options) => {
        const mapped = this.toFieldOptions(options, name === 'country');
        if (name === 'businessType') this.businessTypes.set(mapped);
        else if (name === 'country') this.countries.set(mapped);
        else this.states.set(mapped);
        this.lookupStatus.update((status) => ({ ...status, [name]: 'success' }));
      },
      error: (error: unknown) => {
        this.lookupErrors.update((errors) => ({
          ...errors,
          [name]: this.sellerOnboarding.getErrorMessage(error),
        }));
        this.lookupStatus.update((status) => ({ ...status, [name]: 'error' }));
      },
    });
    this.lookupSubscriptions.set(name, subscription);
  }

  protected isLookupDisabled(fieldName: string): boolean {
    return (
      this.isLookupName(fieldName) &&
      (this.lookupStatus()[fieldName] !== 'success' ||
        this.lookupOptions(fieldName).length === 0 ||
        (fieldName === 'state' && !this.valueFor('country')))
    );
  }

  protected lookupPlaceholder(fieldName: string, fallback: string): string {
    if (!this.isLookupName(fieldName)) return fallback;
    const status = this.lookupStatus()[fieldName];
    if (status === 'loading') return 'Loading options…';
    if (status === 'error') return 'Options unavailable';
    if (fieldName === 'state' && !this.valueFor('country')) return 'Select country first';
    if (this.lookupOptions(fieldName).length === 0) return 'No options available';
    return fallback;
  }

  protected lookupErrorFor(fieldName: string): string | null {
    if (!this.isLookupName(fieldName)) return null;
    return (
      this.lookupErrors()[fieldName] ??
      (this.lookupStatus()[fieldName] === 'success' && this.lookupOptions(fieldName).length === 0
        ? 'No options are currently available.'
        : null)
    );
  }

  private isLookupName(name: string): name is LookupName {
    return name === 'businessType' || name === 'country' || name === 'state';
  }

  private lookupOptions(name: LookupName): readonly SellerFieldOption[] {
    return name === 'businessType'
      ? this.businessTypes()
      : name === 'country'
        ? this.countries()
        : this.states();
  }

  private toFieldOptions(
    options: readonly SellerLookupOption[],
    useIdsAsValues: boolean,
  ): SellerFieldOption[] {
    return options.map(({ id, name }) => ({ label: name, value: useIdsAsValues ? id : name }));
  }

  protected updateValue(name: string, event: Event): void {
    const element = event.target;
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      const value =
        element instanceof HTMLInputElement && element.type === 'file'
          ? (element.files?.[0]?.name ?? '')
          : element.value;
      this.values.update((current) => ({ ...current, [name]: value }));
      if (name === 'country') {
        this.values.update((current) => ({ ...current, state: '' }));
        this.states.set([]);
        this.loadLookup('state');
      }
    }
  }

  protected updateSearchableValue(name: string, value: string): void {
    this.values.update((current) => ({ ...current, [name]: value }));
    this.markTouched(name);
    this.submissionError.set(null);
  }

  private lookupName(name: LookupName, id: string): string {
    return this.lookupOptions(name).find((option) => option.value === id)?.label ?? '';
  }

  protected updateDocument(name: string, file: File): void {
    this.uploadedDocuments.update((current) => ({ ...current, [name]: file }));
    this.values.update((current) => ({ ...current, [name]: file.name }));
    this.previewDocument.set(name);
  }

  protected openPreview(name: string): void {
    if (this.uploadedDocuments()[name]) this.previewDocument.set(name);
  }

  protected removeDocument(name: string): void {
    this.uploadedDocuments.update(({ [name]: _removed, ...rest }) => rest);
    this.values.update(({ [name]: _removed, ...rest }) => rest);
    this.markTouched(name);
    this.previewDocument.set(null);
  }

  protected continue(): void {
    if (this.isSubmitting()) return;
    this.attemptedNext.set(true);
    this.previewDocument.set(null);
    for (let step = 1; step <= this.activeStep(); step += 1) {
      const hasErrors = (this.requiredFieldsByStep[step] ?? []).some(
        (name) => this.errorForStep(name, step) !== null,
      );
      if (hasErrors) {
        this.activeStep.set(step);
        return;
      }
    }
    if (this.activeStep() === 4 && !this.accuracyConfirmed()) return;
    if (this.activeStep() < this.steps.length) {
      this.activeStep.update((step) => step + 1);
      this.attemptedNext.set(false);
      return;
    }
    this.submitApplication();
  }

  private submitApplication(): void {
    const value = (name: string) => this.valueFor(name).trim();
    const payload: SellerOnboardingPayload = {
      BUSINESS_NAME: value('businessName'),
      SELLER_NAME: value('sellerName'),
      BUSINESS_TYPE: this.lookupName('businessType', value('businessType')),
      EMAIL: value('email'),
      MOBILE_NUMBER: Number(value('mobileNumber')),
      BUSINESS_ADDRESS: value('businessAddress'),
      CITY: value('city'),
      STATE: this.lookupName('state', value('state')),
      COUNTRY: this.lookupName('country', value('country')),
      PINCODE: value('pincode'),
      GST_NUMBER: value('gstNumber').toUpperCase(),
      PAN_NUMBER: value('panNumber').toUpperCase(),
      BUSINESS_REGISTRATION_NUMBER: value('registrationNumber'),
      CONTACT_PERSON_NAME: value('contactPersonName'),
      CONTACT_PERSON_MOBILE: Number(value('contactPersonMobile')),
      CONTACT_PERSON_EMAIL: value('contactEmail'),
      USER_NAME: value('userName'),
      USER_PASSWORD: value('userPassword'),
      CREATED_BY: 1,
    };

    this.isSubmitting.set(true);
    this.submissionError.set(null);
    this.submissionSubscription?.unsubscribe();
    this.submissionSubscription = this.sellerOnboarding.submit(payload).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.values.update(({ userPassword: _password, ...remaining }) => remaining);
        this.submitted.set(true);
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.submissionError.set(this.sellerOnboarding.getErrorMessage(error));
      },
    });
  }

  protected goToStep(step: number): void {
    if (this.submitted() || step < 1 || step > this.steps.length || step === this.activeStep())
      return;
    this.activeStep.set(step);
    this.attemptedNext.set(false);
    this.previewDocument.set(null);
  }

  protected goBack(): void {
    if (this.previewDocument()) {
      this.previewDocument.set(null);
      return;
    }
    if (this.activeStep() > 1) {
      this.activeStep.update((step) => step - 1);
      this.attemptedNext.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/');
  }

  protected close(): void {
    this.cancel();
  }
}
