import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SellerVerification } from './seller-verification';
import { SellerVerificationService } from '../../services/seller-verification.service';

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
    remarks: '',
    documents:
      index === 0
        ? [
            { name: 'GST Certificate', fileName: 'GST_Certificate.pdf', url: '' },
            { name: 'PAN Card', fileName: 'PAN_Card.pdf', url: '' },
            { name: 'Address Proof', fileName: 'Address_Proof.pdf', url: '' },
            { name: 'Bank Proof', fileName: 'Bank_Proof.pdf', url: '' },
          ]
        : [],
  }));

  const openFirstSeller = async () => {
    const viewDetails = root.querySelector('tbody app-button button') as HTMLButtonElement;
    viewDetails.click();
    await fixture.whenStable();
  };

  const clickDialogButton = async (label: string) => {
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.seller-dialog app-button button'))
      .find((candidate) => candidate.textContent?.trim() === label);
    button?.click();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SellerVerification],
      providers: [
        provideRouter([]),
        {
          provide: SellerVerificationService,
          useValue: {
            getSellers: () => of({ items: sellers, total: sellers.length, hasNext: false }),
            getSellerDetails: (sellerId: number) => of(sellers.find((seller) => seller.sellerId === sellerId) ?? null),
            getErrorMessage: () => 'Seller details could not be loaded.',
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

  it('uses the Return Request Pending icon for Pending Verification only', () => {
    const cards = Array.from(root.querySelectorAll('.stat-card'));

    expect(cards[1].querySelector('.stat-card__icon img')?.getAttribute('src')).toBe('/images/returnRequest-Pending.svg');
    expect(cards[0].querySelector('.stat-card__icon img')).toBeNull();
    expect(cards[2].querySelector('.stat-card__icon img')).toBeNull();
    expect(cards[3].querySelector('.stat-card__icon img')).toBeNull();
  });

  it('opens the seller details dialog with the submitted documents', async () => {
    await openFirstSeller();
    const dialog = root.querySelector('.seller-dialog') as HTMLElement;
    expect(dialog.textContent).toContain('GreenMart Supplies');
    expect(dialog.textContent).toContain('GST_Certificate.pdf');
    const documentsHeading = dialog.querySelector('.seller-dialog__documents-heading') as HTMLElement;
    expect(documentsHeading.querySelector('img')?.getAttribute('src')).toBe('/images/myOrders.svg');
    expect(documentsHeading.querySelector('img')?.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.querySelectorAll('.seller-documents tbody tr').length).toBe(4);
  });

  it('shows all seven API document fields and opens available filenames', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(of({
      ...sellers[0],
      documents: [
        { name: 'GST Certificate', fileName: 'gst.pdf', url: '/uploads/gst.pdf' },
        { name: 'PAN Card', fileName: 'pan.pdf', url: '/uploads/pan.pdf' },
        { name: 'Business Registration Certificate', fileName: 'registration.pdf', url: '/uploads/registration.pdf' },
        { name: 'Address Proof', fileName: 'Not Available', url: '' },
        { name: 'Owner / Director ID Proof', fileName: 'owner.pdf', url: '/uploads/owner.pdf' },
        { name: 'Bank Proof', fileName: 'bank.pdf', url: '/uploads/bank.pdf' },
        { name: 'Other Supporting Document', fileName: 'other.pdf', url: '/uploads/other.pdf' },
      ],
    }));
    await openFirstSeller();

    const rows = root.querySelectorAll('.seller-documents tbody tr');
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('GST Certificate');
    expect(rows[0].textContent).toContain('gst.pdf');
    expect(rows[3].textContent).toContain('Not Available');
    const unavailableView = rows[3].querySelector('app-button button') as HTMLButtonElement;
    expect(unavailableView.disabled).toBe(true);

    (rows[0].querySelector('app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview h2')?.textContent).toContain('GST Certificate');
  });

  it('opens an in-page image preview and closes it from the preview control', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(of({
      ...sellers[0],
      documents: [{ name: 'GST Certificate', fileName: 'gst.png', url: '/uploads/gst.png' }],
    }));
    await openFirstSeller();

    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview h2')?.textContent).toContain('GST Certificate');
    expect(root.querySelector('.seller-document-preview img')?.getAttribute('src')).toBe('/uploads/gst.png');

    (root.querySelector('.seller-document-preview__heading app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview')).toBeNull();
  });

  it('renders preview decision buttons and reuses the existing confirmation flow', async () => {
    const service = TestBed.inject(SellerVerificationService);
    vi.spyOn(service, 'getSellerDetails').mockReturnValue(of({
      ...sellers[0],
      documents: [{ name: 'GST Certificate', fileName: 'gst.png', url: '/uploads/gst.png' }],
    }));
    await openFirstSeller();
    (root.querySelector('.seller-documents tbody app-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    const approve = root.querySelector('.seller-document-preview__decision-actions .btn--success');
    const deny = root.querySelector('.seller-document-preview__decision-actions .btn--danger');
    expect(approve?.querySelector('svg circle')).not.toBeNull();
    expect(deny?.querySelector('svg circle')).not.toBeNull();

    (approve as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview__confirmation')).not.toBeNull();
    (root.querySelector('.seller-document-preview__confirmation app-button:last-child button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(root.querySelector('.seller-document-preview__notice')?.textContent).toContain('Approval API is not available');
  });

  it('requests details using each selected seller ID and status', async () => {
    const service = TestBed.inject(SellerVerificationService);
    const getDetails = vi.spyOn(service, 'getSellerDetails');

    await openFirstSeller();
    expect(getDetails).toHaveBeenNthCalledWith(1, 101, 'Pending');
    (root.querySelector('.seller-dialog__close') as HTMLButtonElement).click();
    await fixture.whenStable();

    const secondSellerDetails = root.querySelector('tbody tr:nth-child(2) app-button button') as HTMLButtonElement;
    secondSellerDetails.click();
    await fixture.whenStable();

    expect(getDetails).toHaveBeenNthCalledWith(2, 102, 'Pending');
    expect(root.querySelector('.seller-dialog')?.textContent).toContain('Business 2');
  });

  it('requires remarks before denial and confirms without faking an API status change', async () => {
    await openFirstSeller();
    await clickDialogButton('Reject');
    expect(root.querySelector('.seller-dialog__error')).not.toBeNull();
    expect(root.querySelector('.seller-dialog')).not.toBeNull();

    const remarks = root.querySelector('#seller-remarks') as HTMLTextAreaElement;
    remarks.value = 'GST certificate is unreadable.';
    remarks.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await clickDialogButton('Reject');
    expect(root.querySelector('.seller-decision-confirm')).not.toBeNull();
    await clickDialogButton('Confirm Deny');
    expect(root.querySelector('.seller-dialog')).not.toBeNull();
    expect(root.querySelector('.seller-dialog__notice')?.textContent).toContain('Denial API is not available');
    expect(root.querySelector('.seller-dialog app-badge')?.textContent).toContain('Pending');
  });

  it('confirms approval and reports that status remains unchanged without an API', async () => {
    await openFirstSeller();
    await clickDialogButton('Approve');
    expect(root.querySelector('.seller-decision-confirm')).not.toBeNull();
    await clickDialogButton('Confirm Approve');
    expect(root.querySelector('.seller-dialog')).not.toBeNull();
    expect(root.querySelector('.seller-dialog__notice')?.textContent).toContain('Approval API is not available');
    expect(root.querySelector('.seller-dialog app-badge')?.textContent).toContain('Pending');
  });

  it('opens the seller onboarding form in edit mode for the selected seller', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await openFirstSeller();
    await clickDialogButton('Edit Seller');

    expect(navigate).toHaveBeenCalledWith(['/sell'], {
      queryParams: { sellerId: 101, documentId: 201, bankDetailId: 301 },
    });
    expect(root.querySelector('.seller-dialog')).toBeNull();
  });
});
