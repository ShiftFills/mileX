import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { StatusOption } from '../../shared/models/api.model';
import { API_BASE_URL } from '../config/api.config';
import { ApiService } from './api.service';

describe('ApiService status lookup', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the configured endpoint and maps valid status records', () => {
    let options: StatusOption[] | undefined;
    api.getStatuses().subscribe((result) => (options = result));

    const request = http.expectOne('/api/status/get/-1');
    expect(request.request.method).toBe('GET');
    request.flush({
      status: 'SUCCESS',
      data: [
        { STATUS_ID: 1, STATUS_NAME: 'Pending' },
        { STATUS_ID: '2', STATUS_NAME: ' Approved ' },
        { STATUS_ID: 2, STATUS_NAME: 'Duplicate ID' },
        { STATUS_ID: 0, STATUS_NAME: 'Invalid ID' },
        { STATUS_ID: 3, STATUS_NAME: '   ' },
        null,
        'invalid record',
      ],
    });

    expect(options).toEqual([
      { id: 1, label: 'Pending' },
      { id: 2, label: 'Approved' },
    ]);
  });

  it('returns an empty list for null data and shares the successful lookup', () => {
    let first: StatusOption[] | undefined;
    let second: StatusOption[] | undefined;
    api.getStatuses().subscribe((options) => (first = options));
    api.getStatuses().subscribe((options) => (second = options));

    http.expectOne('/api/status/get/-1').flush({ status: 'SUCCESS', data: null });
    expect(first).toEqual([]);
    expect(second).toEqual([]);

    api.getStatuses().subscribe((options) => expect(options).toEqual([]));
    http.expectNone('/api/status/get/-1');
  });

  it('reports an invalid response and allows a later retry after failure', () => {
    let failure: unknown;
    api.getStatuses().subscribe({ error: (error: unknown) => (failure = error) });
    http
      .expectOne('/api/status/get/-1')
      .flush({ status: 'FAILED', message: 'Status lookup failed.' });

    expect(failure).toBeInstanceOf(Error);
    if (failure instanceof Error) {
      expect(failure.message).toBe('Status lookup failed.');
    }

    let options: StatusOption[] | undefined;
    api.getStatuses().subscribe((result) => (options = result));
    http.expectOne('/api/status/get/-1').flush({ status: 'SUCCESS', data: [] });
    expect(options).toEqual([]);
  });
});
