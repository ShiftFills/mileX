export const environment = {
  production: false,
  apiUrl: '/api',
  // CHANGED (new): AWS S3 file API (upload, image URL, list, delete) on http://43.204.96.192:81/api, reached through
  // the dev-server proxy (proxy.conf.json "/s3-api"). That server sends no CORS headers, so the browser cannot
  // call it directly from the app's origin.
  s3ApiUrl: '/s3-api',
};
