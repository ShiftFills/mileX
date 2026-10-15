import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dialog } from './dialog';

describe('Dialog', () => {
  let component: Dialog;
  let fixture: ComponentFixture<Dialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dialog],
    }).compileComponents();

    fixture = TestBed.createComponent(Dialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits closed when the backdrop is clicked', () => {
    let wasClosed = false;
    component.closed.subscribe(() => (wasClosed = true));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.dialog-backdrop').click();

    expect(wasClosed).toBe(true);
  });
});
