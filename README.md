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
