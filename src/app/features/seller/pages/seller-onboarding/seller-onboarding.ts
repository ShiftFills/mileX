import { ChangeDetectionStrategy, Component, computed, OnDestroy, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { EMPTY, Observable, Subscription, catchError, concatMap, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
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
  SellerBankDetails,
  SellerBankDetailsUpdatePayload,
  SellerDocumentsUpdatePayload,
  SellerLookupOption,
  SellerOnboardingPayload,
  SellerOnboardingUpdatePayload,
  SellerOnboardingService,
  SELLER_CREATED_BY,
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

const DOCUMENT_FIELD_MAP = {
  gstCertificate: 'GST_CERTIFICATE',
  panCard: 'PAN_CARD',
  registrationCertificate: 'BUSINESS_REGISTRATION_CERTIFICATE',
  addressProof: 'ADDRESS_PROOF',
  ownerIdProof: 'OWNER_DIRECTOR_ID_PROOF',
  bankProof: 'BANK_PROOF',
  supportingDocument: 'OTHER_SUPPORTING_DOCUMENT',
} as const;

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
  protected readonly submissionSuccess = signal('');
  protected readonly values = signal<Record<string, string>>({});
  protected readonly uploadedDocuments = signal<Record<string, File>>({});
  protected readonly existingDocuments = signal<Record<string, string | null>>({});
  protected readonly isEditing = signal(false);
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
  private createdSeller: {
    sellerId: number;
    userId: number;
    documentId?: number;
    bankDetailId?: number;
  } | null = null;
  private editIdentity: { sellerId: number; userId: number; documentId: number; bankDetailId: number } | null = null;
  private reviewEditRequested = false;
  private requestedDocumentId: number | undefined;
  private requestedBankDetailId: number | undefined;
  private existingSellerPassword = '';
  private documentsUploaded = false;
  private bankDetailsSaved = false;
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
      name: 'ifscCode',
      label: 'IFSC Code',
      placeholder: 'Enter IFSC code',
      icon: 'card',
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
      'ifscCode',
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
    ifscCode: 'IFSC code is required.',
    accountNumber: 'Account number is required.',
    confirmAccountNumber: 'Please confirm your account number.',
    accountType: 'Please select an account type.',
  };

  constructor(
    router: Router,
    private readonly sellerOnboarding: SellerOnboardingService,
    private readonly toast: ToastService,
    route?: ActivatedRoute,
  ) {
    this.router = router;
    const sellerIdValue = route?.snapshot.queryParamMap.get('sellerId');
    const sellerId = sellerIdValue === null || sellerIdValue === undefined ? NaN : Number(sellerIdValue);
    if (sellerIdValue !== null && sellerIdValue !== undefined) {
      this.isEditing.set(true);
    }
    try {
      const documentId = route?.snapshot.queryParamMap.get('documentId');
      const bankDetailId = route?.snapshot.queryParamMap.get('bankDetailId');
      if (documentId !== null && documentId !== undefined) {
        this.requestedDocumentId = this.toPositiveId(documentId, 'DOCUMENT_ID');
      }
      if (bankDetailId !== null && bankDetailId !== undefined) {
        this.requestedBankDetailId = this.toPositiveId(bankDetailId, 'BANK_DETAIL_ID');
      }
    } catch (error: unknown) {
      this.toast.showError(this.sellerOnboarding.getErrorMessage(error));
      return;
    }
    if (Number.isSafeInteger(sellerId) && sellerId > 0) {
      this.loadExistingSeller(sellerId);
    } else if (sellerIdValue !== null && sellerIdValue !== undefined) {
      this.toast.showError('The seller edit link contains an invalid SELLER_ID.');
    } else {
      this.loadLookup('businessType');
      this.loadLookup('country');
    }
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
    return this.uploadedDocuments()[name]?.name ?? this.existingDocuments()[name] ?? '';
  }

  protected documentStatusFor(name: string): 'uploaded' | null {
    return this.documentFileNameFor(name) ? 'uploaded' : null;
  }

  protected fieldId(name: string): string {
    return `seller-${name}`;
  }

  protected errorFor(name: string): string | null {
    if (this.isEditing() && name === 'userPassword') return null;
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
      case 'panNumber':
        return this.isValidPan(value)
          ? null
          : 'Please enter a valid PAN number (e.g., ABCDE1234F).';
      case 'businessType': {
        const id = Number(value);
        return this.isValidOption(name, value) && Number.isSafeInteger(id) && id > 0
          ? null
          : 'Please select a valid option.';
      }
      case 'country':
      case 'accountType':
        return this.isValidOption(name, value) ? null : 'Please select a valid option.';
      case 'state': {
        const id = Number(value);
        return this.isValidOption(name, value) && Number.isSafeInteger(id) && id > 0
          ? null
          : 'Please select a valid option.';
      }
      case 'accountNumber':
        return /^\d+$/.test(value) ? null : 'Account number must contain digits only.';
      case 'confirmAccountNumber':
        return this.valueFor('accountNumber').trim() === value
          ? null
          : 'Account numbers do not match.';
      case 'ifscCode':
        return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.toUpperCase())
          ? null
          : 'Please enter a valid 11-character IFSC code.';
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
        const mapped = this.toFieldOptions(
          options,
          name === 'businessType' || name === 'country' || name === 'state',
        );
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

  private loadExistingSeller(sellerId: number): void {
    this.editIdentity = null;
    this.createdSeller = null;
    this.reviewEditRequested = false;
    this.values.set({});
    this.existingDocuments.set({});
    this.isSubmitting.set(true);
    this.submissionSubscription?.unsubscribe();
    this.submissionSubscription = this.sellerOnboarding
      .getSeller(sellerId)
      .pipe(
        switchMap((seller) =>
          forkJoin({
            seller: of(seller),
            documents: this.sellerOnboarding.getSellerDocumentsForSeller(
              sellerId,
              this.requestedDocumentId ?? this.optionalRecordId(seller, 'DOCUMENT_ID'),
            ),
            bank: this.sellerOnboarding.getSellerBankDetailsForSeller(
              sellerId,
              this.requestedBankDetailId ?? this.optionalRecordId(seller, 'BANK_DETAIL_ID'),
            ),
            businessTypes: this.sellerOnboarding.getBusinessTypes(),
            countries: this.sellerOnboarding.getCountries(),
          }),
        ),
        switchMap((records) => {
          const businessTypes = this.toFieldOptions(records.businessTypes, true);
          const countries = this.toFieldOptions(records.countries, true);
          const countryId = this.matchOptionValue(records.seller['COUNTRY'], countries, 'country');
          return this.sellerOnboarding.getStates(countryId).pipe(
            map((states) => ({
              ...records,
              businessTypes,
              countries,
              states: this.toFieldOptions(states, true),
            })),
          );
        }),
        tap(({ seller, documents, bank, businessTypes, countries, states }) => {
          const sellerIdFromRecord = this.toPositiveId(seller['SELLER_ID'], 'SELLER_ID');
          const userId = this.toPositiveId(seller['USER_ID'], 'USER_ID');
          const documentId = this.toPositiveId(documents['DOCUMENT_ID'], 'DOCUMENT_ID');
          const bankDetailId = this.toPositiveId(bank['BANK_DETAIL_ID'], 'BANK_DETAIL_ID');
          this.businessTypes.set(businessTypes);
          this.countries.set(countries);
          this.states.set(states);
          this.lookupStatus.set({ businessType: 'success', country: 'success', state: 'success' });

          const values: Record<string, string> = {
            businessName: this.recordText(seller, 'BUSINESS_NAME'),
            sellerName: this.recordText(seller, 'SELLER_NAME'),
            businessType: this.matchOptionValue(seller['BUSINESS_TYPE'], businessTypes, 'business type'),
            email: this.recordText(seller, 'EMAIL'),
            mobileNumber: this.recordText(seller, 'MOBILE_NUMBER'),
            businessAddress: this.recordText(seller, 'BUSINESS_ADDRESS'),
            city: this.recordText(seller, 'CITY'),
            state: this.matchOptionValue(seller['STATE'], states, 'state'),
            country: this.matchOptionValue(seller['COUNTRY'], countries, 'country'),
            pincode: this.recordText(seller, 'PINCODE'),
            gstNumber: this.recordText(seller, 'GST_NUMBER'),
            panNumber: this.recordText(seller, 'PAN_NUMBER'),
            registrationNumber: this.recordText(seller, 'BUSINESS_REGISTRATION_NUMBER'),
            contactPersonName: this.recordText(seller, 'CONTACT_PERSON_NAME'),
            contactPersonMobile: this.recordText(seller, 'CONTACT_PERSON_MOBILE'),
            contactEmail: this.recordText(seller, 'CONTACT_PERSON_EMAIL'),
            userName: this.recordText(seller, 'USER_NAME'),
            userPassword: '',
            accountHolder: this.recordText(bank, 'ACCOUNT_HOLDER_NAME'),
            bankName: this.recordText(bank, 'BANK_NAME'),
            branchName: this.recordText(bank, 'BRANCH_NAME'),
            accountNumber: this.recordText(bank, 'ACCOUNT_NUMBER'),
            confirmAccountNumber: this.recordText(bank, 'ACCOUNT_NUMBER'),
            ifscCode: this.recordText(bank, 'IFSC_CODE'),
            accountType: this.mapAccountType(bank['ACCOUNT_TYPE']),
          };
          const existingDocuments = Object.fromEntries(
            Object.entries(DOCUMENT_FIELD_MAP).map(([field, key]) => {
              const filename = this.recordText(documents, key);
              return [field, filename || null];
            }),
          );
          for (const [field, filename] of Object.entries(existingDocuments)) {
            if (filename) values[field] = filename;
          }
          this.values.set(values);
          this.existingDocuments.set(existingDocuments);
          this.lookupErrors.set({});
          this.editIdentity = { sellerId: sellerIdFromRecord, userId, documentId, bankDetailId };
          this.existingSellerPassword = this.recordText(seller, 'USER_PASSWORD');
          this.createdSeller = { sellerId: sellerIdFromRecord, userId, documentId, bankDetailId };
          this.documentsUploaded = true;
          this.bankDetailsSaved = true;
          this.isEditing.set(true);
        }        ),
        catchError((error: unknown) => {
          this.toast.showError(this.sellerOnboarding.getErrorMessage(error));
          return EMPTY;
        }),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe();
  }

  private recordText(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }

  private toPositiveId(value: unknown, key: string): number {
    const id = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`The seller edit response is missing a valid ${key}.`);
    }
    return id;
  }

  private optionalRecordId(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key];
    if (value === undefined || value === null || value === '') return undefined;
    return this.toPositiveId(value, key);
  }

  private matchOptionValue(value: unknown, options: readonly SellerFieldOption[], label: string): string {
    const candidate = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const match = options.find(
      (option) => option.value === candidate || option.label.toLowerCase() === candidate.toLowerCase(),
    );
    if (!match) throw new Error(`The seller edit response contains an unknown ${label}.`);
    return match.value;
  }

  private mapAccountType(value: unknown): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === '2' || normalized === 'current') return 'current';
    if (normalized === '1' || normalized === 'savings') return 'savings';
    throw new Error('The seller edit response contains an unknown account type.');
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
    if (this.isSubmitting()) return;
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
      const previousValue = this.valueFor(name);
      this.values.update((current) => ({ ...current, [name]: value }));
      if (previousValue !== value) {
        if (this.hasPersistedField(name)) this.reviewEditRequested = true;
        if (this.bankFields.some((field) => field.name === name)) this.bankDetailsSaved = false;
      }
      if (name === 'country') {
        this.values.update((current) => ({ ...current, state: '' }));
        this.states.set([]);
        this.loadLookup('state');
      }
    }
  }

  protected updateSearchableValue(name: string, value: string): void {
    if (this.isSubmitting()) return;
    if (this.valueFor(name) !== value && this.hasPersistedField(name)) this.reviewEditRequested = true;
    this.values.update((current) => ({ ...current, [name]: value }));
    this.markTouched(name);
  }

  protected updateDocument(name: string, file: File): void {
    if (this.isSubmitting()) return;
    this.uploadedDocuments.update((current) => ({ ...current, [name]: file }));
    this.values.update((current) => ({ ...current, [name]: file.name }));
    this.documentsUploaded = false;
    if (this.createdSeller?.documentId) this.reviewEditRequested = true;
  }

  protected openPreview(name: string): void {
    if (this.uploadedDocuments()[name]) this.previewDocument.set(name);
  }

  protected removeDocument(name: string): void {
    if (this.isSubmitting()) return;
    this.uploadedDocuments.update(({ [name]: _removed, ...rest }) => rest);
    this.existingDocuments.update((current) => ({ ...current, [name]: null }));
    this.values.update(({ [name]: _removed, ...rest }) => rest);
    this.documentsUploaded = false;
    if (this.createdSeller?.documentId) this.reviewEditRequested = true;
    this.markTouched(name);
    this.previewDocument.set(null);
  }

  protected continue(): void {
    if (this.isSubmitting()) return;
    if (this.isEditing() && !this.createdSeller) {
      this.toast.showError('Existing seller details could not be loaded. Check the seller record IDs and try again.');
      return;
    }
    this.attemptedNext.set(true);
    this.previewDocument.set(null);
    for (let step = 1; step <= this.activeStep(); step += 1) {
      const requiredFields = (this.requiredFieldsByStep[step] ?? []).filter(
        (name) =>
          !(this.isEditing() && step === 1 && name === 'userPassword') &&
          !(this.isEditing() && step === 2 && name in DOCUMENT_FIELD_MAP),
      );
      const hasErrors = requiredFields.some(
        (name) => this.errorForStep(name, step) !== null,
      );
      if (hasErrors) {
        this.activeStep.set(step);
        return;
      }
    }
    if (this.activeStep() === 4 && !this.accuracyConfirmed()) return;
    if (this.activeStep() === 1) {
      this.submitOnboarding();
      return;
    }
    if (this.activeStep() === 2) {
      this.submitDocuments();
      return;
    }
    if (this.activeStep() === 3) {
      this.saveBankDetails();
      return;
    }
    this.submitApplication();
  }

  private submitOnboarding(): void {
    if (this.isEditing()) {
      this.advanceStep();
      return;
    }
    if (this.createdSeller) {
      this.advanceStep();
      return;
    }
    this.runStepRequest(
      this.sellerOnboarding.submitWithResult(this.createOnboardingPayload()),
      (result) => {
        this.createdSeller = result;
        this.syncEditIdentity();
        this.advanceStep();
      },
      () => 'Seller onboarding details saved successfully.',
    );
  }

  private submitDocuments(): void {
    if (!this.createdSeller) {
      this.toast.showError('Complete seller onboarding before submitting documents.');
      return;
    }
    if (this.isEditing()) {
      this.advanceStep();
      return;
    }
    if (this.createdSeller.documentId !== undefined) {
      this.documentsUploaded = true;
      this.advanceStep();
      return;
    }
    if (this.documentsUploaded) {
      this.advanceStep();
      return;
    }
    const { sellerId } = this.createdSeller;
    this.runStepRequest(
      this.sellerOnboarding.uploadDocuments(this.uploadedDocuments(), sellerId),
      (result) => {
        this.createdSeller = { ...this.createdSeller!, documentId: result.documentId };
        this.documentsUploaded = true;
        this.syncEditIdentity();
        this.advanceStep();
      },
      (result) => result.message,
    );
  }

  private saveBankDetails(): void {
    if (!this.createdSeller || (!this.isEditing() && !this.documentsUploaded)) {
      this.toast.showError('Complete seller onboarding and document submission first.');
      return;
    }
    if (this.isEditing()) {
      this.advanceStep();
      return;
    }
    if (this.createdSeller.bankDetailId !== undefined) {
      this.bankDetailsSaved = true;
      this.advanceStep();
      return;
    }
    if (this.bankDetailsSaved) {
      this.advanceStep();
      return;
    }
    const { sellerId } = this.createdSeller;
    this.runStepRequest(
      this.sellerOnboarding.saveBankDetails(this.createBankDetails(), sellerId),
      (result) => {
        this.createdSeller = { ...this.createdSeller!, bankDetailId: result.bankDetailId };
        this.bankDetailsSaved = true;
        this.syncEditIdentity();
        this.advanceStep();
      },
      (result) => result.message,
    );
  }

  private submitApplication(): void {
    const updating = this.shouldSubmitUpdates();
    if (
      !this.createdSeller ||
      (!updating && (!this.documentsUploaded || !this.bankDetailsSaved))
    ) {
      if (this.isEditing()) {
        this.toast.showError('Existing seller details could not be loaded. Check the seller record IDs and try again.');
      }
      return;
    }
    if (updating) {
      this.submitEditUpdates();
      return;
    }
    this.values.update(({ userPassword: _password, ...remaining }) => remaining);
    this.existingSellerPassword = '';
    this.submissionSuccess.set('Your seller application was submitted successfully.');
    this.submitted.set(true);
  }

  private submitEditUpdates(): void {
    if (!this.editIdentity) {
      this.toast.showError(
        'The seller USER_ID or seller, document, or bank record IDs are missing; updates cannot be submitted.',
      );
      return;
    }

    const updates = this.sellerOnboarding.updateSeller(this.createSellerUpdatePayload()).pipe(
      concatMap(() => this.sellerOnboarding.updateDocuments(this.createDocumentsUpdatePayload())),
      concatMap(() => this.sellerOnboarding.updateBankDetails(this.createBankUpdatePayload())),
      map(() => 'Seller, documents, and bank details were updated successfully.'),
    );

    this.runStepRequest(
      updates,
      () => {
        this.values.update(({ userPassword: _password, ...remaining }) => remaining);
        this.existingSellerPassword = '';
        this.submissionSuccess.set('Seller, documents, and bank details were updated successfully.');
        this.submitted.set(true);
      },
      (message) => message,
    );
  }

  private runStepRequest<T>(
    request: Observable<T>,
    onSuccess: (result: T) => void,
    successMessage: (result: T) => string,
  ): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.submissionSubscription?.unsubscribe();
    this.submissionSubscription = request
      .pipe(
        tap((result) => this.toast.showSuccess(successMessage(result))),
        catchError((error: unknown) => {
          this.toast.showError(this.sellerOnboarding.getErrorMessage(error));
          return EMPTY;
        }),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe(onSuccess);
  }

  private advanceStep(): void {
    this.attemptedNext.set(false);
    this.activeStep.update((step) => Math.min(step + 1, this.steps.length));
  }

  private syncEditIdentity(): void {
    const seller = this.createdSeller;
    if (
      seller &&
      Number.isSafeInteger(seller.userId) &&
      seller.userId > 0 &&
      typeof seller.documentId === 'number' &&
      Number.isSafeInteger(seller.documentId) &&
      seller.documentId > 0 &&
      typeof seller.bankDetailId === 'number' &&
      Number.isSafeInteger(seller.bankDetailId) &&
      seller.bankDetailId > 0
    ) {
      this.editIdentity = {
        sellerId: seller.sellerId,
        userId: seller.userId,
        documentId: seller.documentId,
        bankDetailId: seller.bankDetailId,
      };
    }
  }

  private hasPersistedField(name: string): boolean {
    if (!this.createdSeller) return false;
    if (this.bankFields.some((field) => field.name === name)) {
      return this.createdSeller.bankDetailId !== undefined;
    }
    if (name in DOCUMENT_FIELD_MAP) return this.createdSeller.documentId !== undefined;
    return true;
  }

  protected shouldSubmitUpdates(): boolean {
    return this.isEditing() || this.reviewEditRequested;
  }

  private createOnboardingPayload(): SellerOnboardingPayload {
    const value = (name: string) => this.valueFor(name).trim();
    return {
      BUSINESS_NAME: value('businessName'),
      SELLER_NAME: value('sellerName'),
      BUSINESS_TYPE: Number(value('businessType')),
      EMAIL: value('email'),
      MOBILE_NUMBER: Number(value('mobileNumber')),
      BUSINESS_ADDRESS: value('businessAddress'),
      CITY: value('city'),
      STATE: Number(value('state')),
      COUNTRY: Number(value('country')),
      PINCODE: value('pincode'),
      GST_NUMBER: value('gstNumber').toUpperCase(),
      PAN_NUMBER: value('panNumber').toUpperCase(),
      BUSINESS_REGISTRATION_NUMBER: value('registrationNumber'),
      CONTACT_PERSON_NAME: value('contactPersonName'),
      CONTACT_PERSON_MOBILE: Number(value('contactPersonMobile')),
      CONTACT_PERSON_EMAIL: value('contactEmail'),
      USER_NAME: value('userName'),
      USER_PASSWORD: value('userPassword'),
      CREATED_BY: SELLER_CREATED_BY,
    };
  }

  private createSellerUpdatePayload(): SellerOnboardingUpdatePayload {
    const identity = this.editIdentity;
    if (!identity) throw new Error('Seller edit identifiers are unavailable.');
    const value = (name: string) => this.valueFor(name).trim();
    const businessTypeId = Number(value('businessType'));
    if (!Number.isSafeInteger(businessTypeId) || businessTypeId <= 0) {
      throw new Error('Select a valid business type before submitting seller details.');
    }
    const stateId = Number(value('state'));
    if (!this.isValidOption('state', value('state')) || !Number.isSafeInteger(stateId) || stateId <= 0) {
      throw new Error('Select a valid state before submitting seller details.');
    }
    const countryId = Number(value('country'));
    if (
      !this.isValidOption('country', value('country')) ||
      !Number.isSafeInteger(countryId) ||
      countryId <= 0
    ) {
      throw new Error('Select a valid country before submitting seller details.');
    }
    return {
      SELLER_ID: identity.sellerId,
      BUSINESS_NAME: value('businessName'),
      SELLER_NAME: value('sellerName'),
      BUSINESS_TYPE: businessTypeId,
      EMAIL: value('email'),
      MOBILE_NUMBER: Number(value('mobileNumber')),
      BUSINESS_ADDRESS: value('businessAddress'),
      CITY: value('city'),
      STATE: stateId,
      COUNTRY: countryId,
      PINCODE: value('pincode'),
      GST_NUMBER: value('gstNumber').toUpperCase(),
      PAN_NUMBER: value('panNumber').toUpperCase(),
      BUSINESS_REGISTRATION_NUMBER: value('registrationNumber'),
      CONTACT_PERSON_NAME: value('contactPersonName'),
      CONTACT_PERSON_MOBILE: Number(value('contactPersonMobile')),
      CONTACT_PERSON_EMAIL: value('contactEmail'),
      USER_ID: identity.userId,
      USER_NAME: value('userName'),
      USER_PASSWORD: value('userPassword') || this.existingSellerPassword,
      UPDATED_BY: SELLER_CREATED_BY,
    };
  }

  private createDocumentsUpdatePayload(): SellerDocumentsUpdatePayload {
    const identity = this.editIdentity;
    if (!identity) throw new Error('Document edit identifiers are unavailable.');
    const valueForDocument = (field: keyof typeof DOCUMENT_FIELD_MAP) =>
      this.uploadedDocuments()[field]?.name ?? this.existingDocuments()[field] ?? null;
    return {
      DOCUMENT_ID: identity.documentId,
      GST_CERTIFICATE: valueForDocument('gstCertificate'),
      PAN_CARD: valueForDocument('panCard'),
      BUSINESS_REGISTRATION_CERTIFICATE: valueForDocument('registrationCertificate'),
      ADDRESS_PROOF: valueForDocument('addressProof'),
      OWNER_DIRECTOR_ID_PROOF: valueForDocument('ownerIdProof'),
      BANK_PROOF: valueForDocument('bankProof'),
      OTHER_SUPPORTING_DOCUMENT: valueForDocument('supportingDocument'),
      SELLER_ID: identity.sellerId,
      UPDATED_BY: SELLER_CREATED_BY,
    };
  }

  private createBankDetails(): SellerBankDetails {
    const value = (name: string) => this.valueFor(name).trim();
    return {
      ACCOUNT_HOLDER_NAME: value('accountHolder'),
      BANK_NAME: value('bankName'),
      BRANCH_NAME: value('branchName'),
      ACCOUNT_NUMBER: value('accountNumber'),
      CONFIRM_ACCOUNT_NUMBER: value('confirmAccountNumber'),
      IFSC_CODE: value('ifscCode').toUpperCase(),
      ACCOUNT_TYPE: value('accountType') === 'current' ? 2 : 1,
    };
  }

  private createBankUpdatePayload(): SellerBankDetailsUpdatePayload {
    const identity = this.editIdentity;
    if (!identity) throw new Error('Bank detail edit identifiers are unavailable.');
    return {
      ...this.createBankDetails(),
      BANK_DETAIL_ID: identity.bankDetailId,
      SELLER_ID: identity.sellerId,
      UPDATED_BY: SELLER_CREATED_BY,
    };
  }

  protected goToStep(step: number): void {
    if (this.submitted() || this.isSubmitting() || step < 1 || step >= this.activeStep())
      return;
    if (this.activeStep() === 4 && this.createdSeller) this.reviewEditRequested = true;
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
      if (this.activeStep() === 4 && this.createdSeller) this.reviewEditRequested = true;
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
