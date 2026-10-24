import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Radio } from './radio';

describe('Radio', () => {
  let component: Radio;
  let fixture: ComponentFixture<Radio>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Radio],
    }).compileComponents();

    fixture = TestBed.createComponent(Radio);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('name', 'payment');
    fixture.componentRef.setInput('value', 'cash');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
