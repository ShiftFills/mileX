import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap, throwError } from 'rxjs';
import { S3_API_BASE_URL } from '../config/api.config';
import { API_ENDPOINTS } from '../constants/api-endpoints';
import { ApiService } from './api.service';

/**
 * An S3 image key is "<folder>/<file name>" (e.g. "products/3f9c.png", "images/3f9c.png"): the API
 * accepts one folder level only ("uploads/products" is rejected as an invalid folder name).
 */
// CHANGED: any folder (was "images/" only); uploads can now choose their folder with `folderName`.
const S3_IMAGE_KEY = /^[A-Za-z0-9_-]+\/[^/]+$/;
/** Multipart fields of `s3/upload`: the file, the name to store it under, and the folder. */
// CHANGED: fileName and folderName are sent as their own fields (the API stores the file as <folderName>/<fileName>).
const UPLOAD_FIELD = 'image';
const FILE_NAME_FIELD = 'fileName';
const FOLDER_NAME_FIELD = 'folderName';
/** S3 folder for product images: their keys are "products/<file name>". */
// CHANGED (new)
export const PRODUCT_IMAGE_FOLDER = 'products';
/** S3 folder for product variant images ("variants/<file name>"). */
// CHANGED (new)
export const VARIANT_IMAGE_FOLDER = 'variants';
/** S3 folder for seller documents ("documents/<file name>"). */
// CHANGED (new)
export const SELLER_DOCUMENT_FOLDER = 'documents';
/** S3 folder for category images ("categories/<file name>"), saved as CATEGORY_IMAGE. */
// CHANGED (new)
export const CATEGORY_IMAGE_FOLDER = 'categories';
/** S3 folder for brand logos ("brands/<file name>"), saved as BRAND_LOGO. */
// CHANGED (new)
export const BRAND_LOGO_FOLDER = 'brands';
/** A signed URL is fetched again this long before it expires. */
const URL_RENEW_MARGIN_MS = 5 * 60 * 1000;
const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  // CHANGED (new): seller documents may be PDFs.
  'application/pdf': 'pdf',
};

interface CachedImageUrl {
  readonly request: Observable<string>;
  /** Epoch ms after which the signed URL must be fetched again. */
  renewAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isSuccess(value: unknown): boolean {
  return value === true || value === 1 || (typeof value === 'string' && value.trim().toUpperCase() === 'TRUE');
}

/**
 * True for an image key returned by `s3/upload` ("<folder>/<file name>"); false for an empty value, a full URL
 * or a legacy "uploads/products/<file name>" path (those files were never uploaded anywhere).
 */
export function isS3ImageKey(value: string | null | undefined): boolean {
  return S3_IMAGE_KEY.test(value?.trim() ?? '');
}

/**
 * The S3 key of a file uploaded with `fileName` and `folderName`: "<folderName>/<fileName>" (e.g.
 * "products/9210…919f.png"). It is the value saved as PRODUCT_IMAGE and read back with `s3/images/<key>`.
 */
// CHANGED (new): built once from the same file name and folder the upload sends.
export function s3ImageKey(folderName: string, fileName: string): string {
  return `${folderName}/${fileName}`;
}

/**
 * A new unique file name for an image: 32 random hex characters plus the image's own extension
 * (e.g. "3f9c…e1.png"). The upload API stores a file under the name it is given, so every product image needs
 * its own name, or two products uploading "photo.jpg" would overwrite each other's image.
 */
// CHANGED: exported, so the product screens generate the name when the image is selected.
export function uniqueImageFileName(file: File): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const nameExtension = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toLowerCase();
  return `${id}.${IMAGE_EXTENSIONS[file.type] ?? nameExtension ?? 'img'}`;
}

/**
 * `{ success, message, bucket, folderName, originalFileName, fileName, imageKey }` -> the expected key, once the
 * response confirms the file was stored under exactly that key.
 */
// CHANGED: the key is the one built from the sent fileName and folderName; a response reporting any other key
// fails the upload (it used to return whatever key the response reported).
function mapUploadResponse(response: unknown, expectedKey: string): string {
  if (!isRecord(response)) throw new Error('The image upload API returned an invalid response.');
  if (!isSuccess(response['success'])) {
    throw new Error(text(response['message']) || 'The image could not be uploaded.');
  }
  const imageKey = text(response['imageKey']);
  if (!isS3ImageKey(imageKey)) throw new Error('The image upload API did not return a valid image key.');
  if (imageKey !== expectedKey) {
    throw new Error(`The image was stored as "${imageKey}" instead of "${expectedKey}".`);
  }
  return expectedKey;
}

/** `{ success, folderName, fileName, imageKey, imageUrl, expiresIn }` -> signed URL and its lifetime in seconds. */
function mapImageUrlResponse(response: unknown, imageKey: string): { url: string; expiresIn: number | null } {
  if (!isRecord(response) || !isSuccess(response['success'])) {
    const message = isRecord(response) ? text(response['message']) : '';
    throw new Error(message || 'The product image could not be loaded.');
  }
  const url = text(response['imageUrl']);
  const returnedKey = text(response['imageKey']);
  if (!/^https?:\/\//i.test(url) || (returnedKey && returnedKey !== imageKey)) {
    throw new Error('The image API returned an invalid image URL.');
  }
  const expiresIn = Number(response['expiresIn']);
  return { url, expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null };
}

/**
 * Product images on AWS S3: uploads a file (`s3/upload`) and turns a stored image key into a displayable URL
 * (`s3/images/<folder>/<file name>`, i.e. the key itself). URLs are cached per key until shortly before they
 * expire, so a listing page, a re-render or another product with the same image never requests the same URL twice.
 */
// CHANGED (new)
@Injectable({ providedIn: 'root' })
export class S3ImageService {
  private readonly api = inject(ApiService);
  // CHANGED (new): every S3 request goes to the S3 API base (S3_API_BASE_URL), not the main API base.
  private readonly s3Api = { baseUrl: inject(S3_API_BASE_URL) };
  private readonly imageUrls = new Map<string, CachedImageUrl>();
  private unreachableReported = false;

  /**
   * Uploads one image with `fileName` (the bare file name) and `folderName`, and returns its key
   * `s3ImageKey(folderName, fileName)` (e.g. "products/9210…919f.png"), the value saved as PRODUCT_IMAGE.
   * Fails if the API reports the file under any other key, so the saved key always names the uploaded file.
   */
  // CHANGED: takes the file name (generated when the image was selected) and the folder, and sends both as
  // `fileName` / `folderName` (it used to send only the file, which the API stored in its default folder).
  uploadImage(file: File, fileName: string, folderName: string): Observable<string> {
    if (!(file instanceof File) || file.size === 0) {
      return throwError(() => new Error('Please select an image.'));
    }
    const imageKey = s3ImageKey(folderName, fileName);
    if (!isS3ImageKey(imageKey) || fileName !== fileName.trim()) {
      return throwError(() => new Error('The image file name or folder is not valid.'));
    }
    const body = new FormData();
    body.append(UPLOAD_FIELD, file, fileName);
    body.append(FILE_NAME_FIELD, fileName);
    body.append(FOLDER_NAME_FIELD, folderName);
    return this.api.post<unknown>(API_ENDPOINTS.s3Images.upload, body, this.s3Api).pipe(
      map((response) => mapUploadResponse(response, imageKey)),
    );
  }

  /**
   * Signed URL of a stored image key (`imageUrl` from `s3/images/<key>`). A cached URL is reused until shortly
   * before it expires; `refresh: true` fetches a new one regardless (e.g. after the browser failed to load it).
   * Errors when the value is not an S3 image key.
   */
  // CHANGED: `refresh` option.
  imageUrl(imageKey: string, options: { refresh?: boolean } = {}): Observable<string> {
    const key = imageKey.trim();
    if (!isS3ImageKey(key)) return throwError(() => new Error('The product image is not stored in S3.'));

    const cached = this.imageUrls.get(key);
    if (cached && !options.refresh && Date.now() < cached.renewAt) return cached.request;

    const path = key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    let request: Observable<string>;
    request = this.api.get<unknown>(`${API_ENDPOINTS.s3Images.image}/${path}`, undefined, this.s3Api).pipe(
      map((response) => {
        const { url, expiresIn } = mapImageUrlResponse(response, key);
        const entry = this.imageUrls.get(key);
        // Without a known lifetime the URL is not reused by later requests.
        if (entry?.request === request) {
          entry.renewAt = expiresIn === null ? 0 : Date.now() + expiresIn * 1000 - URL_RENEW_MARGIN_MS;
        }
        return url;
      }),
      catchError((error: unknown) => {
        // A failed request is forgotten, so the next request tries again.
        if (this.imageUrls.get(key)?.request === request) this.imageUrls.delete(key);
        this.reportUnreachable(error);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    // Until the response arrives, callers share the request in flight.
    this.imageUrls.set(key, { request, renewAt: Infinity });
    return request;
  }

  /**
   * Explains once, in the console, an image URL request that never reached the S3 API, since the screens then
   * only show their "no image" placeholder: a dev server without the S3 proxy route (it answers "Cannot GET
   * /api/s3/..."; `ng serve` reads proxy.conf.json only when it starts), or a blocked request (status 0: network
   * error, or CORS when the S3 API is called directly and does not allow this origin). A missing image or any
   * other API answer is not reported.
   */
  // CHANGED (new): these failures used to be silent.
  private reportUnreachable(error: unknown): void {
    if (this.unreachableReported || !(error instanceof HttpErrorResponse)) return;
    const notProxied = error.status === 404 && typeof error.error === 'string' && /Cannot (GET|POST|DELETE) \//.test(error.error);
    if (error.status !== 0 && !notProxied) return;
    this.unreachableReported = true;
    console.error(
      notProxied
        ? `Product images: the S3 API base "${this.s3Api.baseUrl}" is not proxied by this dev server (${error.url ?? ''} → 404). ` +
          'Restart "ng serve" so it loads the S3 route in proxy.conf.json.'
        : `Product images: the S3 API at "${this.s3Api.baseUrl}" could not be reached (${error.url ?? ''}). ` +
          'The request failed or was blocked (CORS: the S3 server must allow this origin when it is called directly).',
    );
  }

  /** True while a URL for this key is loading or still valid, so `imageUrl(key)` needs no new request. */
  // CHANGED (new)
  hasFreshUrl(imageKey: string): boolean {
    const cached = this.imageUrls.get(imageKey.trim());
    return !!cached && Date.now() < cached.renewAt;
  }

  // CHANGED: `subject` names what failed (product image by default; e.g. "The GST Certificate").
  uploadErrorMessage(error: unknown, subject = 'The product image'): string {
    const reason = this.reason(error);
    return reason
      ? `${subject} could not be uploaded. ${reason}`
      : `${subject} could not be uploaded. Please try again.`;
  }

  private reason(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;
      const message = isRecord(body) ? text(body['message'] ?? body['MESSAGE']) : '';
      if (message) return /[.!?]$/.test(message) ? message : `${message}.`;
      if (error.status === 413) return 'The file is larger than the server accepts.';
      return error.status
        ? `The server responded with HTTP ${error.status}.`
        : 'Check your connection and try again.';
    }
    return error instanceof Error ? error.message : '';
  }
}

/**
 * The uploads of one form to one S3 folder. Each selected file gets its unique S3 file name the first time it is
 * asked for (call `fileName(file)` when the file is selected), and that same name is used for its upload and its
 * key ("<folder>/<file name>"), so the upload and the saved key always name the same file. A file that was
 * uploaded is not uploaded again: a retry (e.g. after the record failed to save) reuses its key.
 */
// CHANGED (new): shared by the product, variant and seller document forms.
export class S3FileUpload {
  private readonly fileNames = new WeakMap<File, string>();
  private readonly uploadedKeys = new WeakMap<File, string>();

  constructor(
    private readonly s3Images: Pick<S3ImageService, 'uploadImage'>,
    readonly folderName: string,
  ) {}

  /** The file's unique S3 file name (generated once per selected file). */
  fileName(file: File): string {
    let fileName = this.fileNames.get(file);
    if (!fileName) {
      fileName = uniqueImageFileName(file);
      this.fileNames.set(file, fileName);
    }
    return fileName;
  }

  /** The key of a file this form already uploaded, if any. */
  uploadedKey(file: File): string | undefined {
    return this.uploadedKeys.get(file);
  }

  /** The file's S3 key: uploads it under its file name, or reuses the key of an earlier upload. */
  upload(file: File): Observable<string> {
    const uploaded = this.uploadedKeys.get(file);
    if (uploaded) return of(uploaded);
    return this.s3Images.uploadImage(file, this.fileName(file), this.folderName).pipe(
      tap((key) => this.uploadedKeys.set(file, key)),
    );
  }
}
