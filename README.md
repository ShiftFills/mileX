# MileX

E-commerce frontend built with Angular 22 (standalone components, signals, zoneless, SCSS).

## Getting started

```bash
npm install
npm start        # dev server on http://localhost:4200
npm run build    # production build
npm test         # unit tests
```

Angular 22 requires Node `^22.22.3`, `^24.15.0` or `>=26`.

## Architecture

```
src/
├── environments/          API URL per environment (file-replaced at build)
├── styles/                Global theme: tokens, reset, typography, buttons, utilities
└── app/
    ├── core/              App-wide singletons: services, guards, interceptors, config, constants
    ├── shared/            Reusable, feature-agnostic building blocks: components, directives, pipes, models, utils
    ├── layouts/           Page shells: main (header/footer), auth, account (sidebar)
    └── features/          One folder per business area, each lazy-loaded
        ├── home/  auth/  products/  cart/  checkout/  orders/  account/  not-found/
```

### Dependency rules
- `features` may import from `core` and `shared`, **never from each other**.
- `shared` imports from nothing else in the app.
- `core` may import from `shared` (models only).
- `layouts` may import from `core` and `shared`.

Path aliases: `@core/*`, `@shared`, `@shared/*`, `@features/*`, `@layouts/*`, `@env/*`.

### Product catalog API

The API base URL is provided by `src/environments/environment.ts` for production builds and
`src/environments/environment.development.ts` for development builds. Development uses `/api` and
the Angular dev-server proxy configured in `proxy.conf.json`; set the production environment's
`apiUrl` to the deployed API base URL before release.

The shared `ApiService` owns HTTP methods and base-URL joining. Endpoint paths are centralized in
`src/app/core/constants/api-endpoints.ts`; product response mapping and paged requests live in
`ProductCatalogService`. The storefront loads products from `GET {apiUrl}/products/get`. Product
listings request server-side pages with `LIMIT` and `OFFSET=(page - 1) * LIMIT`. The current API response contains
`status`, `message`, and a `data` array, but does not provide total-record or total-page metadata.
Pagination therefore enables sequential next/previous navigation from the returned page size and
infers the final total when a short or empty page is reached; exact totals are unavailable until
then. Search and category filters apply only to the loaded page because no API filter parameters
have been provided. Configure the deployed API or its reverse proxy to allow the storefront origin.

### Feature folder layout
```
features/<name>/
├── <name>.routes.ts       lazy route config
├── pages/<page>/          routed components
├── services/              feature state + API calls
├── components/            (add when needed) feature-only components
└── models/                (add when needed) feature-only types
```

### Styling
Edit design tokens in `src/styles/_tokens.scss`. Components use `var(--token)` and may
`@use 'mixins'` for breakpoints.

## Demo sign-in (development only)

There is no auth API yet. In development builds, open `http://localhost:4200/?demo=login` to sign in a demo
user (this shows the signed-in account menu) and `/?demo=logout` to sign out. It is disabled in production builds.
