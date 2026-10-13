import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { Button } from '@shared/components/button/button';
import { Card } from '@shared/components/card/card';
import { Input } from '@shared/components/input/input';
import { Select } from '@shared/components/select/select';
import { Textarea } from '@shared/components/textarea/textarea';
import { Home } from '@features/home/pages/home/home';

interface SellerFieldOption {
  label: string;
  value: string;
}

interface SellerFieldDefinition {
  name: string;
  label: string;
  placeholder: string;
  icon: 'business' | 'user' | 'type' | 'email' | 'phone' | 'location' | 'globe' | 'document' | 'card' | 'map';
  type?: 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'file';
  options?: readonly SellerFieldOption[];
}

@Component({
  selector: 'app-seller-onboarding',
  imports: [Button, Card, Home, Input, NgTemplateOutlet, Select, Textarea],
  templateUrl: './seller-onboarding.html',
  styleUrl: './seller-onboarding.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerOnboarding {
  protected readonly activeStep = signal(1);
  protected readonly submitted = signal(false);
  protected readonly values = signal<Record<string, string>>({});
  protected readonly attemptedNext = signal(false);
  private readonly router: Router;

  protected readonly businessTypes: SellerFieldOption[] = [
    { label: 'Private Limited Company', value: 'private-limited' },
    { label: 'Partnership', value: 'partnership' },
    { label: 'Sole Proprietorship', value: 'sole-proprietorship' },
    { label: 'Other', value: 'other' },
  ];

  protected readonly countries: SellerFieldOption[] = [
    { label: 'India', value: 'india' },
  ];

  protected readonly states: SellerFieldOption[] = [
    { label: 'Andhra Pradesh', value: 'andhra-pradesh' },
    { label: 'Delhi', value: 'delhi' },
    { label: 'Karnataka', value: 'karnataka' },
    { label: 'Maharashtra', value: 'maharashtra' },
    { label: 'Tamil Nadu', value: 'tamil-nadu' },
  ];

  protected readonly steps = [
    'Seller Onboarding',
    'Seller Documents',
    'Seller Bank Details',
    'Review & Submit',
  ];

  protected readonly leftFields: SellerFieldDefinition[] = [
    { name: 'businessName', label: 'Business Name', placeholder: 'Enter business name', icon: 'business' },
    { name: 'businessType', label: 'Business Type', placeholder: 'Select business type', icon: 'type', type: 'select', options: this.businessTypes },
    { name: 'mobileNumber', label: 'Mobile Number', placeholder: 'Enter mobile number', icon: 'phone', type: 'tel' },
    { name: 'city', label: 'City', placeholder: 'Enter city', icon: 'location' },
    { name: 'country', label: 'Country', placeholder: 'Select country', icon: 'globe', type: 'select', options: this.countries },
    { name: 'gstNumber', label: 'GST Number', placeholder: 'Enter GST number', icon: 'document' },
    { name: 'registrationNumber', label: 'Business Registration Number', placeholder: 'Enter business registration number', icon: 'document' },
    { name: 'contactEmail', label: 'Contact Person Email', placeholder: 'Enter contact person email', icon: 'email', type: 'email' },
  ];

  protected readonly rightTopFields: SellerFieldDefinition[] = [
    { name: 'sellerName', label: 'Seller Name', placeholder: 'Enter seller name', icon: 'user' },
    { name: 'email', label: 'Email', placeholder: 'Enter email address', icon: 'email', type: 'email' },
    { name: 'businessAddress', label: 'Business Address', placeholder: 'Enter business address', icon: 'location', type: 'textarea' },
  ];

  protected readonly rightBottomFields: SellerFieldDefinition[] = [
    { name: 'panNumber', label: 'PAN Number', placeholder: 'Enter PAN number', icon: 'card' },
    { name: 'contactPersonName', label: 'Contact Person Name', placeholder: 'Enter contact person name', icon: 'user' },
    { name: 'contactPersonMobile', label: 'Contact Person Mobile', placeholder: 'Enter mobile number', icon: 'phone', type: 'tel' },
  ];

  protected readonly documentFields: SellerFieldDefinition[] = [
    { name: 'gstCertificate', label: 'GST Certificate', placeholder: 'Choose a file', icon: 'document', type: 'file' },
    { name: 'panCard', label: 'PAN Card', placeholder: 'Choose a file', icon: 'card', type: 'file' },
    { name: 'registrationCertificate', label: 'Business Registration Certificate', placeholder: 'Choose a file', icon: 'business', type: 'file' },
  ];

  protected readonly bankFields: SellerFieldDefinition[] = [
    { name: 'accountHolder', label: 'Account Holder Name', placeholder: 'Enter account holder name', icon: 'user' },
    { name: 'accountNumber', label: 'Account Number', placeholder: 'Enter account number', icon: 'card' },
    { name: 'bankName', label: 'Bank Name', placeholder: 'Enter bank name', icon: 'business' },
    { name: 'ifscCode', label: 'IFSC Code', placeholder: 'Enter IFSC code', icon: 'type' },
  ];

  protected readonly requiredFieldsByStep: Record<number, string[]> = {
    1: [
      'businessName', 'businessType', 'mobileNumber', 'city', 'country', 'gstNumber',
      'registrationNumber', 'contactEmail', 'sellerName', 'email', 'businessAddress',
      'state', 'pincode', 'panNumber', 'contactPersonName', 'contactPersonMobile',
    ],
    2: ['gstCertificate', 'panCard', 'registrationCertificate'],
    3: ['accountHolder', 'accountNumber', 'bankName', 'ifscCode'],
  };

  constructor(router: Router) {
    this.router = router;
  }

  protected valueFor(name: string): string {
    return this.values()[name] ?? '';
  }

  protected fieldId(name: string): string {
    return `seller-${name}`;
  }

  protected errorFor(name: string): string | null {
    if (!this.attemptedNext()) return null;
    const value = this.valueFor(name).trim();
    if (!value) return 'This field is required.';
    if ((name === 'email' || name === 'contactEmail') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Enter a valid email address.';
    }
    if (name === 'pincode' && !/^\d{6}$/.test(value)) {
      return 'Enter a valid 6-digit pincode.';
    }
    return null;
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
    }
  }

  protected continue(): void {
    this.attemptedNext.set(true);
    if ((this.requiredFieldsByStep[this.activeStep()] ?? []).some((name) => this.errorFor(name) !== null)) return;
    if (this.activeStep() < this.steps.length) {
      this.activeStep.update((step) => step + 1);
      this.attemptedNext.set(false);
      return;
    }
    this.submitted.set(true);
  }

  protected goBack(): void {
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
