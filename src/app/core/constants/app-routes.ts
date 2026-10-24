/** Single source of truth for URLs, so links and redirects never drift. */
export const APP_ROUTES = {
  home: '/',
  products: '/products',
  cart: '/cart',
  deliveryAddress: '/checkout/address',
  payment: '/checkout/payment',
  checkout: '/checkout',
  orders: '/orders',
  refund: '/refund',
  account: '/account',
  addresses: '/account/addresses',
  offers: '/offers',
  login: '/auth/login',
  register: '/register',
  wishlist: '/wishlist',
  support: '/help',
  sell: '/sell',
} as const;
