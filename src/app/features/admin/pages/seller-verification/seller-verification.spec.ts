import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SellerVerification } from './seller-verification';

describe('SellerVerification', () => {
  let fixture: ComponentFixture<SellerVerification>;
  let root: HTMLElement;

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
    await TestBed.configureTestingModule({ imports: [SellerVerification] }).compileComponents();
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
});
