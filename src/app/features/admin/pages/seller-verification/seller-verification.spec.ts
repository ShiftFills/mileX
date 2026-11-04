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
    const button = Array.from(root.querySelectorAll<HTMLButtonElement>('.seller-dialog__actions button'))
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

  it('requires remarks to reject and keeps the dialog open until provided', async () => {
    await openFirstSeller();
    await clickDialogButton('Reject');
    expect(root.querySelector('.seller-dialog__error')).not.toBeNull();
    expect(root.querySelector('.seller-dialog')).not.toBeNull();

    const remarks = root.querySelector('#seller-remarks') as HTMLTextAreaElement;
    remarks.value = 'GST certificate is unreadable.';
    remarks.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    await clickDialogButton('Reject');
    expect(root.querySelector('.seller-dialog')).toBeNull();
  });

  it('approves a seller and closes the dialog', async () => {
    await openFirstSeller();
    await clickDialogButton('Approve');
    expect(root.querySelector('.seller-dialog')).toBeNull();
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
