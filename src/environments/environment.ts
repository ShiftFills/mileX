export const environment = {
  production: true,
  apiUrl: 'https://api.milex.example.com',
  // CHANGED (new): AWS S3 file API (upload, image URL, list, delete). Called directly from the browser, so this
  // server must allow the site's origin (CORS) and, for an HTTPS site, be served over HTTPS.
  s3ApiUrl: 'http://43.204.96.192:81/api',
};
