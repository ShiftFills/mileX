import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { SellerVerification } from './seller-verification';
import { SellerOnboardingService } from '@features/seller/services/seller-onboarding.service';
import {
  REQUIRED_SELLER_DOCUMENT_TYPES,
  SellerVerificationRecord,
  SellerVerificationService,
} from '../../services/seller-verification.service';

const REQUIRED_DOCUMENT_NAMES: Record<string, string> = {
  GST_CERTIFICATE: 'GST Certificate',
  PAN_CARD: 'PAN Card',
  BUSINESS_REGISTRATION_CERTIFICATE: 'Business Registration Certificate',
  ADDRESS_PROOF: 'Address Proof',
  OWNER_DIRECTOR_ID_PROOF: 'Owner / Director ID Proof',
  BANK_PROOF: 'Bank Proof',
};

describe('SellerVerification', () => {
  let fixture: ComponentFixture<SellerVerification>;
  let root: HTMLElement;

  const sellers = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    sellerId: index + 101,
    documentId: index === 0 ? 201 : undefined,
    bankDetailId: index === 0 ? 301 : undefined,
    sellerName: `Seller ${index + 1}`,
    businessName: index === 0 ? 'GreenMart Supplies' : `Business ${index + 1}`,
    businessType: 'Partnership',
    sellerCode: `SELLER-${index + 1}`,
    email: `seller${index + 1}@example.com`,
    mobile: '9876543210',
    gstNumber: 'GST123',
    panNumber: 'ABCDE1234F',
    status: 'Pending' as const,
    documentVerificationStatus: 'Pending' as const,
    remarks: '',
    documents:
      index === 0
        ? [
            {
              name: 'GST Certificate',
              fileName: 'GST_Certificate.pdf',
              url: '',
              required: true,
              documentId: 201,
              proofType: 'GST_CERTIFICATE',
              status: 'Pending' as const,
            },
            {
              name: 'PAN Card',
              fileName: 'PAN_Card.pdf',
              url: '',
              required: true,
              documentId: 201,
              proofType: 'PAN_CARD',
              status: 'Pending' as const,
            },
            {
              name: 'Address Proof',
              fileName: 'Address_Proof.pdf',
              url: '',
              required: true,
              documentId: 201,
              proofType: 'ADDRESS_PROOF',
              status: 'Pending' as const,
            },
            {
              name: 'Bank Proof',
              fileName: 'Bank_Proof.pdf',
              url: '',
              required: true,
              documentId: 201,
              proofType: 'BANK_PROOF',
              status: 'Pending' as const,
            },
          ]
        : [],
  }));

  const sellerWithDocumentStatuses = (
    statuses: readonly ('Pending' | 'Approved' | 'Rejected')[],
    sellerStatus: 'Pending' | 'Approved' | 'Rejected' = 'Pending',
    documentStatus?: 'Pending' | 'Approved' | 'Rejected',
  ) => ({
    ...sellers[0],
    status: sellerStatus,
    documentVerificationStatus: documentStatus ?? (statuses.includes('Rejected')
      ? ('Rejected' as const)
      : statuses.every((status) => status === 'Approved')
        ? ('Approved' as const)
        : ('Pending' as const)),
    documents: REQUIRED_SELLER_DOCUMENT_TYPES.map((proofType, index) => ({
      name: REQUIRED_DOCUMENT_NAMES[proofType],
      fileName: `${proofType}.pdf`,
      url: `/uploads/${proofType}.pdf`,
      required: true,
      documentId: 201,
      proofType,
      status: statuses[index] ?? ('Pending' as const),
    })),
  });

  const openFirstSeller = async () => {
    const viewDetails = root.querySelector('tbody app-button button') as HTMLButtonElement;
    viewDetails.click();
    await fixture.whenStable();
  };

  const clickDialogButton = async (label: string) => {
    const button = Array.from(
      root.querySelectorAll<HTMLButtonElement>('.seller-dialog app-button button'),
    ).find((candidate) => candidate.textContent?.trim() === label);
    button?.click();
    await fixture.whenStable();
  };

  const hasSellerAction = (label: string) =>
    Array.from(
      root.querySelectorAll<HTMLButtonElement>('.seller-dialog__actions app-button button'),
    ).some((button) => button.textContent?.trim() === label);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SellerVerification],
      providers: [
        provideRouter([]),
        {
          provide: SellerVerificationService,
          useValue: {
            getSellers: vi.fn(() => of({ items: sellers, total: sellers.length, hasNext: false })),
            getSummary: () =>
              of({ total: sellers.length, pending: sellers.length, approved: 0, rejected: 0 }),
            getSummaryErrorMessage: () => 'Seller summary could not be loaded.',
            getDateFilters: () =>
              of([
                { id: 1, label: 'Last 30 days', days: 30 },
                { id: 2, label: 'Last 7 days', days: 7 },
              ]),
            getDateFilterErrorMessage: () => 'Date filters could not be loaded.',
            getStatuses: () =>
              of([
                { id: 11, label: 'Pending' },
                { id: 12, label: 'Approved' },
                { id: 13, label: 'Rejected' },
              ]),
            getStatusErrorMessage: () => 'Statuses could not be loaded.',
            getSellerDetails: (sellerId: number, requestedStatus = 'PENDING') => {
              const seller = sellers.find((row) => row.sellerId === sellerId);
              if (!seller) return of(null);
              const status =
                requestedStatus.toUpperCase() === 'APPROVED'
                  ? ('Approved' as const)
                  : requestedStatus.toUpperCase() === 'REJECTED'
                    ? ('Rejected' as const)
                    : seller.status;
              return of({ ...seller, status });
            },
            getErrorMessage: () => 'Seller details could not be loaded.',
            approveDocument: () => of('Document approved successfully.'),
            rejectDocument: () => of('Document rejected successfully.'),
            updateSellerDecision: () => of('Seller decision updated successfully.'),
            getActionErrorMessage: (error: unknown) =>
              error instanceof Error ? error.message : 'Document action failed.',
          },
        },
        {
          provide: SellerOnboardingService,
          useValue: {
            getBusinessTypes: vi.fn(() =>
              of([
                { id: '55', name: 'Retail Business' },
                { id: '22', name: 'Partnership' },
              ]),
            ),
            getErrorMessage: () => 'Business types could not be loaded.',
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SellerVerification);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders four summary cards and six sellers', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Seller Verification');
    expect(root.querySelectorAll('app-stat-card').length).toBe(4);
    expect(root.querySelectorAll('tbody tr').length).toBe(6);
  });

  it('loads status options dynamically and sends the selected status to the listing API', async () => {
    const statusSelect = root.querySelector('#admin-seller-status') as HTMLSelectElement;
    expect(
      Array.from(statusSelect.options).map((option) => [option.value, option.textContent?.trim()]),
    ).toContainEqual(['11', 'Pending']);
    expect(statusSelect.value).toBe('11');

    statusSelect.value = '12';
    statusSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelectorAll('tbody tr').length).toBe(6);

    const service = TestBed.inject(SellerVerificationService);
    expect(service.getSellers).toHaveBeenLastCalledWith(1, 6, 30, -1, 'APPROVED');

    statusSelect.value = '11';
    statusSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(service.getSellers).toHaveBeenLastCalledWith(1, 6, 30, -1, 'PENDING');
  });

  it('applies date and Business Type filters to API requests and resets pagination when filters change', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.mocked(service.getSellers).mockReturnValue(
      of({ items: sellers, total: 12, hasNext: true }),
    );

    const dateSelect = root.querySelector('#seller-date-range') as HTMLSelectElement;
    dateSelect.value = '2';
    dateSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(service.getSellers).toHaveBeenLastCalledWith(1, 6, 7, -1, 'PENDING');

    const businessTypeSelect = root.querySelector(
      '#admin-seller-business-type',
    ) as HTMLButtonElement;
    businessTypeSelect.click();
    fixture.detectChanges();
    expect(
      Array.from(root.querySelectorAll<HTMLButtonElement>('[role="option"]')).map((option) =>
        option.textContent?.trim(),
      ),
    ).toContain('Partnership');

    const retailOption = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((option) => option.textContent?.trim() === 'Retail Business');
    retailOption?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelectorAll('tbody tr').length).toBe(6);

    businessTypeSelect.click();
    fixture.detectChanges();
    const partnershipOption = Array.from(
      root.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((option) => option.textContent?.trim() === 'Partnership');
    partnershipOption?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelectorAll('tbody tr').length).toBe(6);

    const onboardingService = TestBed.inject(SellerOnboardingService);
    expect(onboardingService.getBusinessTypes).toHaveBeenCalledTimes(1);
    expect(service.getSellers).toHaveBeenLastCalledWith(1, 6, 7, 22, 'PENDING');

    (root.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(service.getSellers).toHaveBeenLastCalledWith(2, 6, 7, 22, 'PENDING');

    const statusSelect = root.querySelector('#admin-seller-status') as HTMLSelectElement;
    statusSelect.value = '12';
    statusSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(service.getSellers).toHaveBeenLastCalledWith(1, 6, 7, 22, 'APPROVED');
  });

  it('uses the Return Request Pending icon for Pending Verification only', () => {
    const cards = Array.from(root.querySelectorAll('.stat-card'));

    expect(cards[1].querySelector('.stat-card__icon img')?.getAttribute('src')).toBe(
      '/images/returnRequest-Pending.svg',
    );
    expect(cards[0].querySelector('.stat-card__icon img')).toBeNull();
    expect(cards[2].querySelector('.stat-card__icon img')).toBeNull();
    expect(cards[3].querySelector('.stat-card__icon img')).toBeNull();
  });

  it('opens the seller details dialog with the submitted documents', async () => {
    await openFirstSeller();
    const dialog = root.querySelector('.seller-dialog') as HTMLElement;
    expect(dialog.textContent).toContain('GreenMart Supplies');
    expect(dialog.textContent).toContain('GST_Certificate.pdf');
    const documentsHeading = dialog.querySelector(
      '.seller-dialog__documents-heading',
    ) as HTMLElement;
    expect(documentsHeading.querySelector('img')?.getAttribute('src')).toBe('/images/myOrders.svg');
    expect(documentsHeading.querySelector('img')?.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.querySelectorAll('.seller-documents tbody tr').length).toBe(4);
  });

  it('displays the document verification status returned for each selected seller', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockImplementation((sellerId) =>
      of({
        ...sellers.find((seller) => seller.sellerId === sellerId)!,
        documentVerificationStatus:
          sellerId === 101 ? ('Approved' as const) : ('Rejected' as const),
      }),
    );

    await openFirstSeller();
    expect(root.querySelector('.seller-document-status')?.textContent).toContain('Approved');
    (root.querySelector('.seller-dialog__close') as HTMLButtonElement).click();
    await fixture.whenStable();

    (root.querySelector('tbody tr:nth-child(2) app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-status')?.textContent).toContain('Rejected');
  });

  it('shows all seven API document fields and opens available filenames', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of({
        ...sellers[0],
        documents: [
          {
            name: 'GST Certificate',
            fileName: 'gst.pdf',
            url: '/uploads/gst.pdf',
            required: true,
            status: 'Approved' as const,
          },
          {
            name: 'PAN Card',
            fileName: 'pan.pdf',
            url: '/uploads/pan.pdf',
            required: true,
            status: 'Pending' as const,
          },
          {
            name: 'Business Registration Certificate',
            fileName: 'registration.pdf',
            url: '/uploads/registration.pdf',
            required: true,
            status: 'Rejected' as const,
          },
          {
            name: 'Address Proof',
            fileName: 'Not Available',
            url: '',
            required: true,
            status: 'Pending' as const,
          },
          {
            name: 'Owner / Director ID Proof',
            fileName: 'owner.pdf',
            url: '/uploads/owner.pdf',
            required: true,
            status: 'Approved' as const,
          },
          {
            name: 'Bank Proof',
            fileName: 'bank.pdf',
            url: '/uploads/bank.pdf',
            required: true,
            status: 'Approved' as const,
          },
          {
            name: 'Other Supporting Document',
            fileName: 'Not Available',
            url: '',
            required: false,
            status: 'Pending' as const,
          },
        ],
      }),
    );
    await openFirstSeller();

    const rows = root.querySelectorAll('.seller-documents tbody tr');
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('GST Certificate');
    expect(rows[0].textContent).toContain('gst.pdf');
    expect(rows[0].textContent).toContain('Approved');
    expect(rows[1].textContent).toContain('Pending');
    expect(rows[2].textContent).toContain('Rejected');
    expect(rows[3].textContent).toContain('Not Available');
    expect(rows[6].textContent).toContain('Not Available');
    const unavailableView = rows[3].querySelector('app-button button') as HTMLButtonElement;
    expect(unavailableView.disabled).toBe(true);

    (rows[0].querySelector('app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview h2')?.textContent).toContain(
      'GST Certificate',
    );
  });

  it('shows only the reverse decision action for already approved or rejected documents', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const approveDocument = vi.spyOn(service, 'approveDocument');
    const rejectDocument = vi.spyOn(service, 'rejectDocument');
    vi.spyOn(service, 'getSellerDetails').mockImplementation((sellerId) => {
      const status = sellerId === 101 ? ('Approved' as const) : ('Rejected' as const);
      return of({
        ...sellers[sellerId === 101 ? 0 : 1],
        documents: [
          {
            name: 'GST Certificate',
            fileName: 'gst.pdf',
            url: '/uploads/gst.pdf',
            documentId: 201,
            proofType: 'GST_CERTIFICATE',
            status,
            ...(status === 'Rejected' ? { rejectionReason: 'Document is unreadable.' } : {}),
          },
        ],
      });
    });

    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Approved',
    );
    expect(
      root.querySelector(
        '.seller-document-preview__decision-actions .seller-document-preview__decision:not(.seller-document-preview__deny)',
      ),
    ).toBeNull();
    expect(
      root.querySelector('.seller-document-preview__decision-actions .seller-document-preview__deny'),
    ).not.toBeNull();

    (
      root.querySelector('.seller-document-preview__heading app-button button') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    (root.querySelector('.seller-dialog__close') as HTMLButtonElement).click();
    await fixture.whenStable();

    (root.querySelector('tbody tr:nth-child(2) app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Rejected',
    );
    expect(root.querySelector('.seller-document-preview__rejection-reason')?.textContent).toContain(
      'Document is unreadable.',
    );
    expect(
      root.querySelector(
        '.seller-document-preview__decision-actions .seller-document-preview__decision:not(.seller-document-preview__deny)',
      ),
    ).not.toBeNull();
    expect(
      root.querySelector('.seller-document-preview__decision-actions .seller-document-preview__deny'),
    ).toBeNull();
    expect(approveDocument).not.toHaveBeenCalled();
    expect(rejectDocument).not.toHaveBeenCalled();
  });

  it('opens an in-page image preview and closes it from the preview control', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of({
        ...sellers[0],
        documents: [
          {
            name: 'GST Certificate',
            fileName: 'gst.png',
            url: '/uploads/gst.png',
            status: 'Pending' as const,
          },
        ],
      }),
    );
    await openFirstSeller();

    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview h2')?.textContent).toContain(
      'GST Certificate',
    );
    expect(root.querySelector('.seller-document-preview img')?.getAttribute('src')).toBe(
      '/uploads/gst.png',
    );

    (
      root.querySelector('.seller-document-preview__heading app-button button') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview')).toBeNull();
  });

  it('preserves seller remarks when opening and closing a document preview', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of(
        sellerWithDocumentStatuses(
          REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
          'Pending',
          'Pending',
        ),
      ),
    );
    await openFirstSeller();

    const sellerRemarks = root.querySelector('#seller-remarks') as HTMLTextAreaElement;
    sellerRemarks.value = 'Seller-level note';
    sellerRemarks.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    (
      root.querySelector('.seller-document-preview__heading app-button button') as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect((root.querySelector('#seller-remarks') as HTMLTextAreaElement).value).toBe(
      'Seller-level note',
    );
  });

  it('approves the selected document with its ID and proof type, then refreshes its status', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const pendingSeller = {
      ...sellers[0],
      documents: [
        {
          name: 'GST Certificate',
          fileName: 'gst.png',
          url: '/uploads/gst.png',
          documentId: 201,
          proofType: 'GST_CERTIFICATE',
          status: 'Pending' as const,
        },
      ],
    };
    const approvedSeller = {
      ...pendingSeller,
      documentVerificationStatus: 'Approved' as const,
      documents: pendingSeller.documents.map((document) => ({
        ...document,
        status: 'Approved' as const,
      })),
    };
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockReturnValueOnce(of(pendingSeller))
      .mockReturnValueOnce(of(approvedSeller));
    const approveDocument = vi.spyOn(service, 'approveDocument');
    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    const approve = root.querySelector('.seller-document-preview__decision-actions .btn--success');
    const deny = root.querySelector('.seller-document-preview__decision-actions .btn--danger');
    expect(approve?.querySelector('svg circle')).not.toBeNull();
    expect(deny?.querySelector('svg circle')).not.toBeNull();

    (approve as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('#seller-preview-remarks')).toBeNull();
    expect(root.querySelector('.seller-document-preview__confirmation')).not.toBeNull();
    (
      root.querySelector(
        '.seller-document-preview__confirmation app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(approveDocument).toHaveBeenCalledWith({
      DOCUMENT_ID: 201,
      PROOF_TYPE: 'GST_CERTIFICATE',
      UPDATED_BY: 1,
    });
    expect(getSellerDetails).toHaveBeenNthCalledWith(2, 101, 'Pending');
    expect(root.querySelector('.seller-document-preview__notice')?.textContent).toContain(
      'Document approved successfully.',
    );
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Approved',
    );
    expect(root.querySelector('#seller-preview-remarks')).toBeNull();
    expect(
      root.querySelector(
        '.seller-document-preview__decision-actions .seller-document-preview__decision:not(.seller-document-preview__deny)',
      ),
    ).toBeNull();
    expect(
      root.querySelector('.seller-document-preview__decision-actions .seller-document-preview__deny'),
    ).not.toBeNull();
  });

  it('shows Remarks only after Reject and requires a reason before submitting', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const pendingSeller = {
      ...sellers[0],
      documents: [
        {
          name: 'GST Certificate',
          fileName: 'gst.png',
          url: '/uploads/gst.png',
          documentId: 201,
          proofType: 'GST_CERTIFICATE',
          status: 'Pending' as const,
        },
      ],
    };
    const rejectedSeller = {
      ...pendingSeller,
      documentVerificationStatus: 'Rejected' as const,
      documents: pendingSeller.documents.map((document) => ({
        ...document,
        status: 'Rejected' as const,
        rejectionReason: 'Rejected by backend',
      })),
    };
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockReturnValueOnce(of(pendingSeller))
      .mockReturnValueOnce(of(rejectedSeller));
    const rejectDocument = vi.spyOn(service, 'rejectDocument');
    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(root.querySelector('#seller-preview-remarks')).toBeNull();

    (root.querySelector('.seller-document-preview__deny button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const remarks = root.querySelector('#seller-preview-remarks') as HTMLTextAreaElement;
    expect(remarks).not.toBeNull();
    expect(root.querySelector('label[for="seller-preview-remarks"]')?.textContent?.trim()).toBe(
      'Remarks',
    );
    expect(remarks.placeholder).toBe('Enter remarks');

    (
      root.querySelector(
        '.seller-document-preview__remarks app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(root.querySelector('#seller-preview-remarks-error')?.textContent).toContain(
      'Add remarks',
    );

    remarks.value = 'GST certificate is unreadable.';
    remarks.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(root.querySelector('#seller-preview-remarks-error')).toBeNull();

    (
      root.querySelector(
        '.seller-document-preview__remarks app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview__confirmation')).not.toBeNull();
    (
      root.querySelector(
        '.seller-document-preview__confirmation app-button:first-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(rejectDocument).not.toHaveBeenCalled();
    expect(root.querySelector('#seller-preview-remarks')).toBeNull();

    (root.querySelector('.seller-document-preview__deny button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const reopenedRemarks = root.querySelector('#seller-preview-remarks') as HTMLTextAreaElement;
    expect(reopenedRemarks).not.toBeNull();
    reopenedRemarks.value = 'GST certificate is unreadable.';
    reopenedRemarks.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    (
      root.querySelector(
        '.seller-document-preview__remarks app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    (
      root.querySelector(
        '.seller-document-preview__confirmation app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    expect(rejectDocument).toHaveBeenCalledWith({
      DOCUMENT_ID: 201,
      PROOF_TYPE: 'GST_CERTIFICATE',
      REJECTION_REASON: 'GST certificate is unreadable.',
      UPDATED_BY: 1,
    });
    expect(getSellerDetails).toHaveBeenNthCalledWith(2, 101, 'Pending');
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Rejected',
    );
    expect(root.querySelector('#seller-preview-remarks')).toBeNull();
    expect(
      root
        .querySelector('.seller-document-preview__decision-actions .seller-document-preview__decision')
        ?.hasAttribute('hidden'),
    ).toBe(false);
    expect(
      root
        .querySelector('.seller-document-preview__decision-actions .seller-document-preview__deny')
        ?.hasAttribute('hidden'),
    ).toBe(true);
    expect(root.querySelector('.seller-document-preview__rejection-reason')?.textContent).toContain(
      'Rejected by backend',
    );
  });

  it('closes the rejection remarks without retaining input when canceled', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of({
        ...sellers[0],
        documents: [
          {
            name: 'GST Certificate',
            fileName: 'gst.png',
            url: '/uploads/gst.png',
            documentId: 201,
            proofType: 'GST_CERTIFICATE',
            status: 'Pending' as const,
          },
        ],
      }),
    );
    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelector('.seller-document-preview__deny button') as HTMLButtonElement).click();
    await fixture.whenStable();

    const remarks = root.querySelector('#seller-preview-remarks') as HTMLTextAreaElement;
    remarks.value = 'Do not retain this reason';
    remarks.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    (
      root.querySelector(
        '.seller-document-preview__remarks app-button:first-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(root.querySelector('#seller-preview-remarks')).toBeNull();
    expect(root.querySelector('.seller-document-preview__confirmation')).toBeNull();
    (root.querySelector('.seller-document-preview__deny button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect((root.querySelector('#seller-preview-remarks') as HTMLTextAreaElement).value).toBe('');
  });

  it('prevents duplicate document submissions while the request is pending', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const pendingSeller = {
      ...sellers[0],
      documents: [
        {
          name: 'GST Certificate',
          fileName: 'gst.png',
          url: '/uploads/gst.png',
          documentId: 201,
          proofType: 'GST_CERTIFICATE',
          status: 'Pending' as const,
        },
      ],
    };
    const approvedSeller = {
      ...pendingSeller,
      documentVerificationStatus: 'Approved' as const,
      documents: pendingSeller.documents.map((document) => ({
        ...document,
        status: 'Approved' as const,
      })),
    };
    const refreshRequest = new Subject<SellerVerificationRecord | null>();
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockReturnValueOnce(of(pendingSeller))
      .mockReturnValueOnce(refreshRequest);
    const pendingApproval = new Subject<string>();
    const approveDocument = vi.spyOn(service, 'approveDocument').mockReturnValue(pendingApproval);
    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (
      root.querySelector('.seller-document-preview__footer .btn--success') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    (
      root.querySelector(
        '.seller-document-preview__confirmation app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    const confirmButton = root.querySelector(
      '.seller-document-preview__confirmation app-button:last-child button',
    ) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);
    confirmButton.click();
    expect(approveDocument).toHaveBeenCalledTimes(1);

    pendingApproval.next('Document approved successfully.');
    pendingApproval.complete();
    await fixture.whenStable();

    expect(getSellerDetails).toHaveBeenNthCalledWith(2, 101, 'Pending');
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Pending',
    );
    expect(
      (
        root.querySelector(
          '.seller-document-preview__confirmation app-button:last-child button',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    refreshRequest.next(approvedSeller);
    refreshRequest.complete();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Approved',
    );
  });

  it('retains the previous document state when refreshing Seller Details fails', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const pendingSeller = {
      ...sellers[0],
      documents: [
        {
          name: 'GST Certificate',
          fileName: 'gst.png',
          url: '/uploads/gst.png',
          documentId: 201,
          proofType: 'GST_CERTIFICATE',
          status: 'Pending' as const,
        },
      ],
    };
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockReturnValueOnce(of(pendingSeller))
      .mockReturnValueOnce(throwError(() => new Error('Refresh failed.')));
    vi.spyOn(service, 'approveDocument').mockReturnValue(of('Document approved successfully.'));

    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (
      root.querySelector('.seller-document-preview__footer .btn--success') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    (
      root.querySelector(
        '.seller-document-preview__confirmation app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(getSellerDetails).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Pending',
    );
    expect(root.querySelector('.seller-document-preview__notice')?.textContent).toContain(
      'Previous details were retained',
    );
  });

  it('shows API errors and keeps the selected decision available for retry', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of({
        ...sellers[0],
        documents: [
          {
            name: 'GST Certificate',
            fileName: 'gst.png',
            url: '/uploads/gst.png',
            documentId: 201,
            proofType: 'GST_CERTIFICATE',
            status: 'Pending' as const,
          },
        ],
      }),
    );
    vi.spyOn(service, 'approveDocument').mockReturnValue(
      throwError(() => new Error('Already reviewed.')),
    );
    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (
      root.querySelector('.seller-document-preview__footer .btn--success') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    (
      root.querySelector(
        '.seller-document-preview__confirmation app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(root.querySelector('.seller-document-preview__notice')?.textContent).toContain(
      'Already reviewed.',
    );
    expect(root.querySelector('.seller-document-preview__confirmation')).not.toBeNull();
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Pending',
    );
  });

  it('requests details using each selected seller ID and status', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const getDetails = vi.spyOn(service, 'getSellerDetails');

    await openFirstSeller();
    expect(getDetails).toHaveBeenNthCalledWith(1, 101, 'Pending');
    (root.querySelector('.seller-dialog__close') as HTMLButtonElement).click();
    await fixture.whenStable();

    const secondSellerDetails = root.querySelector(
      'tbody tr:nth-child(2) app-button button',
    ) as HTMLButtonElement;
    secondSellerDetails.click();
    await fixture.whenStable();

    expect(getDetails).toHaveBeenNthCalledWith(2, 102, 'Pending');
    expect(root.querySelector('.seller-dialog')?.textContent).toContain('Business 2');
  });

  it('shows seller remarks and both actions only when every required document is approved', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const refreshListing = vi
      .spyOn(service, 'getSellers')
      .mockReturnValueOnce(
        of({ items: sellers.slice(1), total: sellers.length - 1, hasNext: false }),
      );
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockImplementation((_sellerId, requestedStatus = 'Pending') =>
        of({
          ...sellerWithDocumentStatuses(
            REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
            requestedStatus.toUpperCase() === 'APPROVED' ? 'Approved' : 'Pending',
          ),
          documentVerificationStatus:
            requestedStatus.toUpperCase() === 'APPROVED' ? ('Approved' as const) : ('Pending' as const),
        }),
      );
    const updateDecision = vi.spyOn(service, 'updateSellerDecision');
    await openFirstSeller();

    expect(root.querySelector('#seller-remarks')).not.toBeNull();
    expect(hasSellerAction('Approve')).toBe(true);
    expect(hasSellerAction('Reject')).toBe(true);
    expect(root.querySelector('.seller-dialog__actions')?.textContent).not.toContain('Edit Seller');

    await clickDialogButton('Approve');
    await clickDialogButton('Confirm Approve');
    await fixture.whenStable();

    expect(updateDecision).toHaveBeenCalledWith({
      SELLER_ID: 101,
      DECISION: 'APPROVED',
      UPDATED_BY: 1,
    });
    expect(root.querySelector('.seller-status')?.textContent).toContain('Approved');
    expect(hasSellerAction('Approve')).toBe(false);
    expect(hasSellerAction('Reject')).toBe(false);
    expect(root.querySelector('.seller-dialog__actions')?.textContent).not.toContain('Edit Seller');
    expect(getSellerDetails).toHaveBeenLastCalledWith(101, 'Approved');
    expect(refreshListing).toHaveBeenCalledWith(1, 6, 'PENDING');
    expect(root.querySelectorAll('.sellers-table tbody tr')).toHaveLength(5);
  });

  it('hides seller actions and remarks after approval using the refreshed seller status', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const getSellerDetails = vi.spyOn(service, 'getSellerDetails')
      .mockReturnValueOnce(of(
        sellerWithDocumentStatuses(
          REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
          'Pending',
          'Approved',
        ),
      ))
      .mockReturnValueOnce(of(
        sellerWithDocumentStatuses(
          REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
          'Approved',
          'Approved',
        ),
      ));
    const updateDecision = vi.spyOn(service, 'updateSellerDecision');
    await openFirstSeller();

    expect(root.querySelector('.seller-document-status')?.textContent).toContain('Approved');
    expect(root.querySelector('#seller-remarks')).not.toBeNull();
    expect(hasSellerAction('Approve')).toBe(true);

    await clickDialogButton('Approve');
    await clickDialogButton('Confirm Approve');

    expect(updateDecision).toHaveBeenCalledWith({
      SELLER_ID: 101,
      DECISION: 'APPROVED',
      UPDATED_BY: 1,
    });
    expect(getSellerDetails).toHaveBeenCalledTimes(2);
    expect(hasSellerAction('Approve')).toBe(false);
    expect(hasSellerAction('Reject')).toBe(false);
    expect(root.querySelector('#seller-remarks')).toBeNull();
  });

  it('shows Reject but not Approve when any required document is pending', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of(
        sellerWithDocumentStatuses([
          'Approved',
          'Pending',
          'Approved',
          'Approved',
          'Approved',
          'Approved',
        ]),
      ),
    );
    await openFirstSeller();

    expect(root.querySelector('#seller-remarks')).toBeNull();
    expect(hasSellerAction('Approve')).toBe(false);
    expect(root.querySelector('.seller-dialog__notice')?.textContent).toContain(
      'until every mandatory document has been reviewed and approved',
    );
    expect(hasSellerAction('Reject')).toBe(true);
  });

  it('warns when an approved seller has a rejected mandatory document without changing seller status', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const updateDecision = vi.spyOn(service, 'updateSellerDecision');
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of(
        sellerWithDocumentStatuses(
          ['Rejected', 'Approved', 'Approved', 'Approved', 'Approved', 'Approved'],
          'Approved',
        ),
      ),
    );
    await openFirstSeller();

    expect(root.querySelector('.seller-status')?.textContent).toContain('Approved');
    expect(root.querySelector('.seller-document-status')?.textContent).toContain('Rejected');
    expect(root.querySelector('.seller-decision-confirm[role="alert"]')?.textContent).toContain(
      'GST Certificate',
    );
    expect(root.querySelector('.seller-decision-confirm[role="alert"]')?.textContent).toContain(
      'backend seller status has not changed',
    );
    expect(hasSellerAction('Approve')).toBe(false);
    expect(hasSellerAction('Reject')).toBe(false);
    expect(updateDecision).not.toHaveBeenCalled();
  });

  it('shows only seller Reject when a required document is rejected and submits the rejection', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockImplementation((_sellerId, requestedStatus = 'Pending') =>
        of(
          sellerWithDocumentStatuses(
            ['Rejected', 'Approved', 'Approved', 'Approved', 'Approved', 'Approved'],
            requestedStatus.toUpperCase() === 'REJECTED' ? 'Rejected' : 'Pending',
          ),
        ),
      );
    const updateDecision = vi.spyOn(service, 'updateSellerDecision');
    await openFirstSeller();

    expect(root.querySelector('#seller-remarks')).toBeNull();
    expect(hasSellerAction('Approve')).toBe(false);
    expect(root.querySelector('.seller-dialog__notice')?.textContent).toContain(
      'while any mandatory document is rejected',
    );
    expect(hasSellerAction('Reject')).toBe(true);
    await clickDialogButton('Reject');
    expect(root.querySelector('.seller-decision-confirm')).not.toBeNull();
    await clickDialogButton('Confirm Reject');
    await fixture.whenStable();

    expect(updateDecision).toHaveBeenCalledWith({
      SELLER_ID: 101,
      DECISION: 'REJECTED',
      UPDATED_BY: 1,
    });

    expect(root.querySelector('.seller-status')?.textContent).toContain('Rejected');
    expect(hasSellerAction('Reject')).toBe(false);
    expect(getSellerDetails).toHaveBeenLastCalledWith(101, 'Rejected');
  });

  it('hides seller approval actions and remarks when the seller is already Approved', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(
      of({
        ...sellerWithDocumentStatuses(
          REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
          'Approved',
          'Approved',
        ),
        documentVerificationStatus: 'Approved',
      }),
    );
    await openFirstSeller();

    expect(root.querySelector('.seller-document-status')?.textContent).toContain('Approved');
    expect(root.querySelector('#seller-remarks')).toBeNull();
    expect(hasSellerAction('Approve')).toBe(false);
    expect(hasSellerAction('Reject')).toBe(false);
  });

  it('allows a rejected document to be approved again and refreshes the preview status', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const rejectedDocumentSeller = sellerWithDocumentStatuses(
      ['Rejected', 'Approved', 'Approved', 'Approved', 'Approved', 'Approved'],
      'Pending',
      'Rejected',
    );
    const approvedDocumentSeller = sellerWithDocumentStatuses(
      REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
      'Pending',
      'Approved',
    );
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockReturnValueOnce(of(rejectedDocumentSeller))
      .mockReturnValueOnce(of(approvedDocumentSeller));
    const approveDocument = vi
      .spyOn(service, 'approveDocument')
      .mockReturnValue(of('Document approved successfully.'));

    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    const approveButton = root.querySelector(
      '.seller-document-preview__decision-actions .seller-document-preview__decision:not(.seller-document-preview__deny) button',
    ) as HTMLButtonElement | null;
    const rejectButton = root.querySelector(
      '.seller-document-preview__decision-actions .seller-document-preview__deny button',
    ) as HTMLButtonElement | null;
    expect(approveButton).not.toBeNull();
    expect(rejectButton).toBeNull();

    approveButton?.click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview__confirmation')).not.toBeNull();
    (
      root.querySelector(
        '.seller-document-preview__confirmation app-button:last-child button',
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(approveDocument).toHaveBeenCalledWith({
      DOCUMENT_ID: 201,
      PROOF_TYPE: 'GST_CERTIFICATE',
      UPDATED_BY: 1,
    });
    expect(getSellerDetails).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Approved',
    );
    expect(
      root.querySelector(
        '.seller-document-preview__decision-actions .seller-document-preview__decision:not(.seller-document-preview__deny)',
      ),
    ).toBeNull();
    expect(
      root.querySelector('.seller-document-preview__decision-actions .seller-document-preview__deny'),
    ).not.toBeNull();
  });

  it('allows an approved document to be rejected only with remarks and refreshes its status', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const approvedDocumentSeller = sellerWithDocumentStatuses(
      REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
      'Pending',
      'Approved',
    );
    const rejectedDocumentSeller = sellerWithDocumentStatuses(
      ['Rejected', 'Approved', 'Approved', 'Approved', 'Approved', 'Approved'],
      'Pending',
      'Rejected',
    );
    const getSellerDetails = vi
      .spyOn(service, 'getSellerDetails')
      .mockReturnValueOnce(of(approvedDocumentSeller))
      .mockReturnValueOnce(of(rejectedDocumentSeller));
    const rejectDocument = vi
      .spyOn(service, 'rejectDocument')
      .mockReturnValue(of('Document rejected successfully.'));

    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    const approveButton = root.querySelector(
      '.seller-document-preview__decision-actions .seller-document-preview__decision:not(.seller-document-preview__deny) button',
    ) as HTMLButtonElement | null;
    const rejectButton = root.querySelector(
      '.seller-document-preview__decision-actions .seller-document-preview__deny button',
    ) as HTMLButtonElement | null;
    expect(approveButton).toBeNull();
    expect(rejectButton).not.toBeNull();

    rejectButton?.click();
    await fixture.whenStable();
    expect(root.querySelector('#seller-preview-remarks')).not.toBeNull();
    const remarks = root.querySelector('#seller-preview-remarks') as HTMLTextAreaElement;
    remarks.value = 'Document information is outdated.';
    remarks.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    (root.querySelector('.seller-document-preview__remarks app-button:last-child button') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelector('.seller-document-preview__confirmation app-button:last-child button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(rejectDocument).toHaveBeenCalledWith({
      DOCUMENT_ID: 201,
      PROOF_TYPE: 'GST_CERTIFICATE',
      UPDATED_BY: 1,
      REJECTION_REASON: 'Document information is outdated.',
    });
    expect(getSellerDetails).toHaveBeenCalledTimes(2);
    expect(root.querySelector('.seller-document-preview app-badge')?.textContent).toContain(
      'Rejected',
    );
    expect(
      root
        .querySelector('.seller-document-preview__decision-actions .seller-document-preview__deny'),
    ).toBeNull();
    expect(root.querySelector(
      '.seller-document-preview__decision-actions .seller-document-preview__decision:not(.seller-document-preview__deny)',
    )).not.toBeNull();
  });

  it('prevents further decisions when the seller status is already Approved or Rejected', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockImplementation((sellerId) =>
      of({
        ...sellerWithDocumentStatuses(
          REQUIRED_SELLER_DOCUMENT_TYPES.map(() => 'Approved' as const),
          sellerId === 101 ? 'Approved' : 'Rejected',
        ),
        id: sellerId - 100,
        sellerId,
      }),
    );

    await openFirstSeller();
    expect(root.querySelector('.seller-status')?.textContent).toContain('Approved');
    expect(root.querySelector('#seller-remarks')).toBeNull();
    expect(root.querySelector('.seller-dialog__actions')?.textContent).not.toContain('Edit Seller');
    expect(hasSellerAction('Approve')).toBe(false);
    expect(hasSellerAction('Reject')).toBe(false);

    (root.querySelector('.seller-dialog__close') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelector('tbody tr:nth-child(2) app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-status')?.textContent).toContain('Rejected');
    expect(root.querySelector('#seller-remarks')).toBeNull();
    expect(root.querySelector('.seller-dialog__actions')?.textContent).not.toContain('Edit Seller');
    expect(hasSellerAction('Approve')).toBe(false);
    expect(hasSellerAction('Reject')).toBe(false);
  });

  it('does not expose the Edit Seller action in Seller Details', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await openFirstSeller();
    await clickDialogButton('Edit Seller');

    expect(navigate).not.toHaveBeenCalled();
    expect(root.querySelector('.seller-dialog')?.textContent).not.toContain('Edit Seller');
  });
});
