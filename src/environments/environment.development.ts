export const environment = {
  production: false,
  apiUrl: '/api',
  // CHANGED (new): AWS S3 file API (upload, image URL, list, delete), reached through the dev-server proxy. That
  // server sends no CORS headers, so the browser cannot call it directly from the app's origin.
  // CHANGED: "/api" (was "/s3-api"), so the upload is "/api/s3/upload". proxy.conf.json sends "/api/s3/**" to the
  // S3 server's own IP (that route is listed before "/api/**"); every other "/api" request still goes to the main backend.
  s3ApiUrl: '/api',
};
