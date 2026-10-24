import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReturnRequest } from './return-request';

describe('ReturnRequest', () => {
  let fixture: ComponentFixture<ReturnRequest>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ReturnRequest] }).compileComponents();
    fixture = TestBed.createComponent(ReturnRequest);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('renders the heading, five summary cards and six rows', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Return Request');
    expect(root.querySelectorAll('app-stat-card').length).toBe(5);
    expect(root.querySelectorAll('tbody tr').length).toBe(6);
  });

  it('uses the supplied icons for Total Requests and Pending cards', () => {
    const icons = Array.from(root.querySelectorAll('.stat-card__icon img')).map((image) => image.getAttribute('src'));

    expect(icons).toEqual(['/images/totalRequest.svg', '/images/returnRequest-Pending.svg']);
  });

  it('shows two thumbnails plus a "+2" counter per row', () => {
    const firstRow = root.querySelector('tbody tr') as HTMLElement;
    expect(firstRow.querySelectorAll('.return-images__item').length).toBe(2);
    expect(firstRow.querySelector('.return-images__more')?.textContent).toContain('+2');
  });

  it('gives Pickup Address the space taken from Return Status', () => {
    const headers = Array.from(root.querySelectorAll<HTMLTableCellElement>('thead th'));
    const pickupAddress = headers.find((header) => header.textContent?.trim() === 'Pickup Address');
    const returnStatus = headers.find((header) => header.textContent?.trim() === 'Return Status');

    expect(pickupAddress?.style.getPropertyValue('--column-width')).toBe('19%');
    expect(returnStatus?.style.getPropertyValue('--column-width')).toBe('9%');
    expect(root.querySelector('.table-scroll')).toBeTruthy();
  });

  it('centers the Return Status header and badge values in the same column', () => {
    const headers = Array.from(root.querySelectorAll<HTMLTableCellElement>('thead th'));
    const statusHeader = headers.find((header) => header.textContent?.trim() === 'Return Status');
    const statusIndex = headers.indexOf(statusHeader!);
    const statusCell = root.querySelector<HTMLTableCellElement>(`tbody tr td:nth-child(${statusIndex + 1})`);

    expect(statusHeader?.style.textAlign).toBe('center');
    expect(statusCell?.style.textAlign).toBe('center');
  });

  it('centers the Quantity header and values in the same column', () => {
    const headers = Array.from(root.querySelectorAll<HTMLTableCellElement>('thead th'));
    const quantityHeader = headers.find((header) => header.textContent?.trim() === 'Quantity');
    const quantityIndex = headers.indexOf(quantityHeader!);
    const quantityCell = root.querySelector<HTMLTableCellElement>(`tbody tr td:nth-child(${quantityIndex + 1})`);

    expect(quantityHeader?.style.textAlign).toBe('center');
    expect(quantityCell?.style.textAlign).toBe('center');
  });

  it('approving a pending request moves it to In Transit', async () => {
    const firstRow = root.querySelector('tbody tr') as HTMLElement;
    expect(firstRow.textContent).toContain('Pending');
    (firstRow.querySelector('.more-actions') as HTMLButtonElement).click();
    await fixture.whenStable();
    const approve = root.querySelector('.return-action-menu button') as HTMLButtonElement;
    approve.click();
    await fixture.whenStable();
    expect((root.querySelector('tbody tr') as HTMLElement).textContent).toContain('In Transit');
    expect(root.querySelector('.return-action-menu')).toBeNull();
  });

  it('closes the action menu when clicking outside it', async () => {
    const trigger = root.querySelector('.more-actions') as HTMLButtonElement;
    trigger.click();
    await fixture.whenStable();
    expect(root.querySelector('.return-action-menu')).not.toBeNull();

    root.querySelector('h1')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelector('.return-action-menu')).toBeNull();
  });

  it('rejecting a pending request updates its status and closes the action menu', async () => {
    const firstRow = root.querySelector('tbody tr') as HTMLElement;
    (firstRow.querySelector('.more-actions') as HTMLButtonElement).click();
    await fixture.whenStable();
    (root.querySelectorAll('.return-action-menu button')[1] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect((root.querySelector('tbody tr') as HTMLElement).textContent).toContain('Rejected');
    expect(root.querySelector('.return-action-menu')).toBeNull();
  });
});
