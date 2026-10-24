import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Offers } from './offers';

describe('Offers', () => {
  let fixture: ComponentFixture<Offers>;
  let root: HTMLElement;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await TestBed.configureTestingModule({
      imports: [Offers],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Offers);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('renders the banner and an offer card for each offer', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Offers & Discounts');
    const cards = root.querySelectorAll('.offer');
    expect(cards.length).toBe(5);
    const first = cards[0] as HTMLElement;
    expect(first.textContent).toContain('Save Up To ₹1,000');
    expect(first.textContent).toContain('Festive Bonanza 2026');
    expect(first.textContent).toContain('₹1,499');
    expect(first.textContent).toContain('18 Oct 2026');
    expect(first.textContent).toContain('31 Oct 2026');
    expect(first.textContent).toContain('Active');
  });

  it('gives each card its own colour theme', () => {
    const themes = Array.from(root.querySelectorAll('.offer')).map((card) => card.getAttribute('data-theme'));
    expect(new Set(themes).size).toBe(5);
  });

  it('copies the coupon code and confirms it', async () => {
    const button = root.querySelector('.offer__copy') as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(writeText).toHaveBeenCalledWith('FESTIVE20');
    expect(root.querySelector('.offer [role="status"]')?.textContent).toContain('Code copied');
  });

  it('links each offer to its product category', () => {
    const link = root.querySelector('.offer__go') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/products?category=electronics');
  });
});
