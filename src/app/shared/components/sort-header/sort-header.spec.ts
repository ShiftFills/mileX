import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SortHeader } from './sort-header';

describe('SortHeader', () => {
  let component: SortHeader;
  let fixture: ComponentFixture<SortHeader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SortHeader],
    }).compileComponents();

    fixture = TestBed.createComponent(SortHeader);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
