export const API_ENDPOINTS = {
  products: {
    get: 'products/get',
  },
  productVariants: {
    get: 'product_variant/get',
  },
  sellerOnboarding: {
    businessTypes: 'business_type/get',
    countries: 'country/get',
    states: 'state/get',
    insert: 'seller_onboarding/insert',
  },
} as const;
