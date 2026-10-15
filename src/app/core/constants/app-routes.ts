/** Single source of truth for URLs, so links and redirects never drift. */
export const APP_ROUTES = {
  home: '/',
  products: '/products',
  cart: '/cart',
  checkout: '/checkout',
  orders: '/orders',
  account: '/account',
  login: '/auth/login',
  register: '/register',
  wishlist: '/wishlist',
  support: '/help',
  sell: '/sell',
} as const;
