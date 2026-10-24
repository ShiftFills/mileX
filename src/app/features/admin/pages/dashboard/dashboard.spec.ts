import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Dashboard } from './dashboard';

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('greets the admin and shows the four summary cards', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Welcome Back, Sujan');
    const labels = Array.from(root.querySelectorAll('app-stat-card .stat-card__label')).map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Total Revenue', 'Total Orders', 'Active Sellers', 'Total Customers']);
  });

  it('renders the three charts', () => {
    expect(root.querySelector('app-sales-chart svg')).toBeTruthy();
    expect(root.querySelectorAll('app-radar-chart svg text').length).toBe(7);
    expect(root.querySelectorAll('app-donut-chart circle').length).toBe(3);
    expect(root.querySelector('.donut__value')?.textContent).toContain('9,550');
  });

  it('lists recent orders and top sellers', () => {
    const tables = root.querySelectorAll('app-table');
    expect(tables[0].querySelectorAll('tbody tr').length).toBe(4);
    expect(tables[0].textContent).toContain('#ORD-2401');
    expect(tables[0].textContent).toContain('Delivered');
    expect(tables[1].querySelectorAll('tbody tr').length).toBe(4);
    expect(tables[1].textContent).toContain('Sunrise Traders');
  });

  it('links "View all" to order management', () => {
    const link = root.querySelector('.dashboard-card__link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/orders');
  });
});
