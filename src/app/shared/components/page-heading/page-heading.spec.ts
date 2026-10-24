import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageHeading } from './page-heading';

describe('PageHeading', () => {
  let component: PageHeading;
  let fixture: ComponentFixture<PageHeading>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PageHeading],
    }).compileComponents();

    fixture = TestBed.createComponent(PageHeading);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('heading', 'Order Management');
    fixture.componentRef.setInput('subtitle', 'View and manage all customer orders in one place.');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the heading and subtitle', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Order Management');
    expect(text).toContain('View and manage all customer orders');
  });
});
