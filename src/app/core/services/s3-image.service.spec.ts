// CHANGED (new): S3 image upload and signed-URL lookup. Response shapes are the ones the backend returns.
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, S3_API_BASE_URL } from '../config/api.config';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { of, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import {
  PRODUCT_IMAGE_FOLDER, S3FileUpload, S3ImageService, isS3ImageKey, s3ImageKey, uniqueImageFileName,
} from './s3-image.service';

// CHANGED: S3 requests go to their own base (S3_API_BASE_URL); the main API base stays '/api'.
const UPLOAD_URL = 'http://s3.test/api/s3/upload';
const SIGNED_URL = 'https://bucket.s3.ap-south-1.amazonaws.com/images/a1.png?X-Amz-Signature=abc';

// CHANGED: the upload response as the API returns it now (folderName and fileName).
function uploadResponse(imageKey: string) {
  const [folderName, fileName] = imageKey.split('/');
  return {
    success: true,
    message: 'Image uploaded successfully',
    bucket: 'test-bucket',
    folderName,
    originalFileName: 'a1.png',
    fileName,
    imageKey,
  };
}

function imageResponse(imageKey: string, imageUrl = SIGNED_URL, expiresIn = 3600) {
  const [folderName, fileName] = imageKey.split('/');
  return { success: true, folderName, fileName, imageKey, imageUrl, expiresIn };
}

describe('S3ImageService', () => {
  let service: S3ImageService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // CHANGED: with the auth interceptor, to check that S3 requests carry no access token.
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: S3_API_BASE_URL, useValue: 'http://s3.test/api' },
        { provide: AuthService, useValue: { token: () => 'access-token' } },
      ],
    });
    service = TestBed.inject(S3ImageService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  // CHANGED (new): only S3 requests use S3_API_BASE_URL; normal APIs keep API_BASE_URL and the access token.
  it('sends S3 requests to the S3 API base without the access token, and normal APIs to the main base with it', () => {
    service.imageUrl('products/a1.png').subscribe();
    service.uploadImage(new File(['a'], 'a.png', { type: 'image/png' }), 'a1.png', 'products').subscribe();
    TestBed.inject(ApiService).get('products/get', { PRODUCT_ID: -1 }).subscribe();

    const image = http.expectOne('http://s3.test/api/s3/images/products/a1.png');
    const upload = http.expectOne(UPLOAD_URL);
    const products = http.expectOne((request) => request.url === '/api/products/get');
    expect(image.request.headers.has('Authorization')).toBe(false);
    expect(upload.request.headers.has('Authorization')).toBe(false);
    expect(products.request.headers.get('Authorization')).toBe('Bearer access-token');
    image.flush(imageResponse('products/a1.png'));
    upload.flush(uploadResponse('products/a1.png'));
    products.flush({ status: true, data: [] });
  });

  // CHANGED: keys in any folder (the API stores one folder level, e.g. "products/electronics.jpg").
  it('recognises S3 image keys only', () => {
    expect(isS3ImageKey('images/a1.png')).toBe(true);
    expect(isS3ImageKey(' images/a1.png ')).toBe(true);
    expect(isS3ImageKey('products/electronics.jpg')).toBe(true);
    expect(isS3ImageKey('uploads/products/a1.png')).toBe(false);
    expect(isS3ImageKey('images/')).toBe(false);
    expect(isS3ImageKey('a1.png')).toBe(false);
    expect(isS3ImageKey('/images/a1.png')).toBe(false);
    expect(isS3ImageKey('images/nested/a1.png')).toBe(false);
    expect(isS3ImageKey('https://example.test/a1.png')).toBe(false);
    expect(isS3ImageKey(null)).toBe(false);
  });

  it('loads the URL of a key in another folder by its folder and file name', () => {
    let url: string | undefined;
    service.imageUrl('products/electronics.jpg').subscribe((value) => (url = value));
    http.expectOne('http://s3.test/api/s3/images/products/electronics.jpg').flush(imageResponse('products/electronics.jpg'));

    expect(url).toBe(SIGNED_URL);
  });

  // CHANGED: the file name and folder are chosen by the caller and sent as `fileName` / `folderName`.
  it('uploads the file with its fileName and folderName and returns the image key from the response', () => {
    let imageKey: string | undefined;
    const file = new File(['png-bytes'], 'My Photo.PNG', { type: 'image/png' });
    const fileName = '3f9c0a1b2c3d4e5f60718293a4b5c6d7.png';

    service.uploadImage(file, fileName, PRODUCT_IMAGE_FOLDER).subscribe((key) => (imageKey = key));

    const request = http.expectOne(UPLOAD_URL);
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const sent = body.get('image') as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.name).toBe(fileName);
    expect(sent.size).toBe(file.size);
    expect(body.get('fileName')).toBe(fileName);
    expect(body.get('folderName')).toBe('products');
    request.flush(uploadResponse(`products/${fileName}`), { status: 201, statusText: 'Created' });

    expect(imageKey).toBe(`products/${fileName}`);
  });

  // CHANGED: the saved key must name the uploaded file exactly (it used to accept whatever key the API reported).
  it('builds the image key once from the folder and file name', () => {
    expect(s3ImageKey('products', '9210035e12d5f8ee185b4b73febb919f.png'))
      .toBe('products/9210035e12d5f8ee185b4b73febb919f.png');
  });

  it('fails the upload when the API reports the file under a different key', () => {
    let imageKey: string | undefined;
    let error: unknown;
    service.uploadImage(new File(['a'], 'a.png', { type: 'image/png' }), 'a1.png', 'products')
      .subscribe({ next: (key) => (imageKey = key), error: (e) => (error = e) });
    http.expectOne(UPLOAD_URL).flush(uploadResponse('products/a1-renamed.png'));

    expect(imageKey).toBeUndefined();
    expect((error as Error).message).toBe('The image was stored as "products/a1-renamed.png" instead of "products/a1.png".');
  });

  it('generates a different file name for every image, with the image type\'s extension', () => {
    const jpeg = new File(['a'], 'photo.JPEG', { type: 'image/jpeg' });
    const names = Array.from({ length: 50 }, () => uniqueImageFileName(jpeg));

    expect(new Set(names).size).toBe(50);
    expect(names[0]).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(uniqueImageFileName(new File(['a'], 'products.png', { type: 'image/png' }))).not.toBe('products.png');
    expect(uniqueImageFileName(new File(['a'], 'x', { type: 'image/webp' }))).toMatch(/\.webp$/);
  });

  it('rejects an empty file, or an invalid file name or folder, without calling the API', () => {
    const errors: string[] = [];
    const file = new File(['a'], 'a.png', { type: 'image/png' });
    service.uploadImage(new File([], 'empty.png', { type: 'image/png' }), 'a.png', 'products')
      .subscribe({ error: (e: Error) => errors.push(e.message) });
    service.uploadImage(file, '', 'products').subscribe({ error: (e: Error) => errors.push(e.message) });
    service.uploadImage(file, 'a/b.png', 'products').subscribe({ error: (e: Error) => errors.push(e.message) });
    service.uploadImage(file, 'a.png', 'uploads/products').subscribe({ error: (e: Error) => errors.push(e.message) });

    http.expectNone(UPLOAD_URL);
    expect(errors).toEqual([
      'Please select an image.',
      'The image file name or folder is not valid.',
      'The image file name or folder is not valid.',
      'The image file name or folder is not valid.',
    ]);
  });

  it('rejects an unsuccessful or key-less upload response', () => {
    const file = new File(['a'], 'a.png', { type: 'image/png' });
    const errors: string[] = [];
    service.uploadImage(file, 'a.png', 'products').subscribe({ error: (e: Error) => errors.push(e.message) });
    http.expectOne(UPLOAD_URL).flush({ success: false, message: 'Bucket unavailable' });
    service.uploadImage(file, 'a.png', 'products').subscribe({ error: (e: Error) => errors.push(e.message) });
    http.expectOne(UPLOAD_URL).flush({ success: true, message: 'Image uploaded successfully' });
    service.uploadImage(file, 'a.png', 'products').subscribe({ error: (e: Error) => errors.push(e.message) });
    // CHANGED: a nested path (the API allows one folder level), since any single folder is now valid.
    http.expectOne(UPLOAD_URL).flush({ success: true, imageKey: 'uploads/products/a.png' });
    // CHANGED (new): the folder path given twice.
    service.uploadImage(file, 'a.png', 'products').subscribe({ error: (e: Error) => errors.push(e.message) });
    http.expectOne(UPLOAD_URL).flush({ success: true, imageKey: 'products/products/a.png' });

    expect(errors).toEqual([
      'Bucket unavailable',
      'The image upload API did not return a valid image key.',
      'The image upload API did not return a valid image key.',
      'The image upload API did not return a valid image key.',
    ]);
  });

  it('explains upload failures, including the API message', () => {
    const file = new File(['a'], 'a.png', { type: 'image/png' });
    let failure: unknown;
    service.uploadImage(file, 'a.png', 'products').subscribe({ error: (e) => (failure = e) });
    http.expectOne(UPLOAD_URL).flush(
      { success: false, message: 'Please select an image' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(failure).toBeInstanceOf(HttpErrorResponse);
    expect(service.uploadErrorMessage(failure)).toBe('The product image could not be uploaded. Please select an image.');
    expect(service.uploadErrorMessage(new HttpErrorResponse({ status: 413 })))
      .toBe('The product image could not be uploaded. The file is larger than the server accepts.');
    expect(service.uploadErrorMessage(new HttpErrorResponse({ status: 0 })))
      .toBe('The product image could not be uploaded. Check your connection and try again.');
  });

  it('loads a signed URL by image key (folder and file name) and reuses it until shortly before it expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    const urls: string[] = [];

    service.imageUrl('images/a1.png').subscribe((url) => urls.push(url));
    service.imageUrl('images/a1.png').subscribe((url) => urls.push(url));
    http.expectOne('http://s3.test/api/s3/images/images/a1.png').flush(imageResponse('images/a1.png'));
    service.imageUrl('images/a1.png').subscribe((url) => urls.push(url));
    http.expectNone('http://s3.test/api/s3/images/images/a1.png');
    expect(urls).toEqual([SIGNED_URL, SIGNED_URL, SIGNED_URL]);

    // 3600 s lifetime, renewed 5 minutes early.
    vi.setSystemTime(new Date('2026-11-21T10:56:00Z'));
    service.imageUrl('images/a1.png').subscribe((url) => urls.push(url));
    http.expectOne('http://s3.test/api/s3/images/images/a1.png').flush(imageResponse('images/a1.png', `${SIGNED_URL}2`));
    expect(urls.at(-1)).toBe(`${SIGNED_URL}2`);
  });

  // CHANGED (new)
  it('reports whether a key has a URL that needs no new request, and fetches a new one on refresh', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    const urls: string[] = [];
    expect(service.hasFreshUrl('products/a1.png')).toBe(false);

    service.imageUrl('products/a1.png').subscribe((url) => urls.push(url));
    expect(service.hasFreshUrl('products/a1.png')).toBe(true); // in flight
    http.expectOne('http://s3.test/api/s3/images/products/a1.png').flush(imageResponse('products/a1.png'));
    expect(service.hasFreshUrl('products/a1.png')).toBe(true);

    service.imageUrl('products/a1.png', { refresh: true }).subscribe((url) => urls.push(url));
    http.expectOne('http://s3.test/api/s3/images/products/a1.png').flush(imageResponse('products/a1.png', `${SIGNED_URL}2`));
    expect(urls).toEqual([SIGNED_URL, `${SIGNED_URL}2`]);

    vi.setSystemTime(new Date('2026-11-21T10:56:00Z'));
    expect(service.hasFreshUrl('products/a1.png')).toBe(false);
  });

  it('encodes the file name in the URL path', () => {
    service.imageUrl('images/summer sale#1.png').subscribe();
    http.expectOne('http://s3.test/api/s3/images/images/summer%20sale%231.png')
      .flush(imageResponse('images/summer sale#1.png'));
  });

  it('rejects a URL response for a different image', () => {
    let error: unknown;
    service.imageUrl('images/a1.png').subscribe({ error: (e) => (error = e) });
    http.expectOne('http://s3.test/api/s3/images/images/a1.png').flush(imageResponse('images/other.png'));

    expect((error as Error).message).toBe('The image API returned an invalid image URL.');
  });

  it('forgets a failed URL request, so the next call tries again', () => {
    const errors: unknown[] = [];
    service.imageUrl('images/a1.png').subscribe({ error: (e) => errors.push(e) });
    http.expectOne('http://s3.test/api/s3/images/images/a1.png').flush('Server error', { status: 500, statusText: 'Server Error' });
    service.imageUrl('images/a1.png').subscribe({ error: (e) => errors.push(e) });
    http.expectOne('http://s3.test/api/s3/images/images/a1.png').flush({ success: true, imageKey: 'images/a1.png', imageUrl: 'not-a-url' });

    expect(errors).toHaveLength(2);
    expect((errors[1] as Error).message).toBe('The image API returned an invalid image URL.');
  });

  // CHANGED (new): the shared per-form uploader (products, variants, seller documents).
  describe('S3FileUpload', () => {
    const uploader = () => {
      const uploadImage = vi.fn((_file: File, fileName: string, folderName: string) => of(`${folderName}/${fileName}`));
      return { uploadImage, upload: new S3FileUpload({ uploadImage }, 'documents') };
    };

    it('gives each selected file one unique name, used for its upload and key', () => {
      const { uploadImage, upload } = uploader();
      const pdf = new File(['a'], 'GST Certificate.PDF', { type: 'application/pdf' });
      const png = new File(['b'], 'GST Certificate.PDF', { type: 'image/png' });

      const name = upload.fileName(pdf);
      expect(upload.fileName(pdf)).toBe(name);
      expect(name).toMatch(/^[0-9a-f]{32}\.pdf$/);
      expect(upload.fileName(png)).not.toBe(name);

      let key: string | undefined;
      upload.upload(pdf).subscribe((value) => (key = value));
      expect(uploadImage).toHaveBeenCalledWith(pdf, name, 'documents');
      expect(key).toBe(`documents/${name}`);
    });

    it('does not upload the same file twice, but retries a failed upload', () => {
      const { uploadImage, upload } = uploader();
      const file = new File(['a'], 'a.png', { type: 'image/png' });
      uploadImage.mockReturnValueOnce(throwError(() => new Error('Bucket unavailable')));

      upload.upload(file).subscribe({ error: () => undefined });
      expect(upload.uploadedKey(file)).toBeUndefined();
      upload.upload(file).subscribe();
      upload.upload(file).subscribe();

      expect(uploadImage).toHaveBeenCalledTimes(2);
      expect(upload.uploadedKey(file)).toBe(`documents/${upload.fileName(file)}`);
    });
  });

  // CHANGED (new): an unreachable S3 API is explained once in the console; ordinary failures are not.
  it('explains once when the S3 API is not proxied or not reachable, and stays quiet for other failures', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      service.imageUrl('products/a1.png').subscribe({ error: () => undefined });
      http.expectOne('http://s3.test/api/s3/images/products/a1.png').flush('Server error', { status: 500, statusText: 'Error' });
      expect(consoleError).not.toHaveBeenCalled();

      service.imageUrl('products/a1.png').subscribe({ error: () => undefined });
      http.expectOne('http://s3.test/api/s3/images/products/a1.png').flush(
        '<!DOCTYPE html><pre>Cannot GET /s3-api/s3/images/products/a1.png</pre>', { status: 404, statusText: 'Not Found' },
      );
      service.imageUrl('products/b2.png').subscribe({ error: () => undefined });
      http.expectOne('http://s3.test/api/s3/images/products/b2.png').error(new ProgressEvent('error'), { status: 0 });

      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(String(consoleError.mock.calls[0]?.[0])).toContain('Restart "ng serve"');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('names the failed upload in the error message', () => {
    expect(service.uploadErrorMessage(new Error('Only JPG, PNG and WEBP images are allowed.'), 'The GST Certificate'))
      .toBe('The GST Certificate could not be uploaded. Only JPG, PNG and WEBP images are allowed.');
  });

  it('does not call the API for a value that is not an S3 key', () => {
    let error: unknown;
    service.imageUrl('uploads/products/a1.png').subscribe({ error: (e) => (error = e) });

    http.expectNone(() => true);
    expect((error as Error).message).toBe('The product image is not stored in S3.');
  });
});
