export const API_ENDPOINTS = {
  products: {
    get: 'products/get',
    insert: 'products/insert',
    update: 'products/update',
  },
  productLookups: {
    categories: 'category/get',
    subCategories: 'sub_category/get',
    brands: 'brand_management/get',
    taxRates: 'tax_rate/get',
    productCodes: 'product_code/get',
  },
  productVariants: {
    get: 'product_variant/get',
  },
  sellerOnboarding: {
    businessTypes: 'business_type/get',
    countries: 'country/get',
    states: 'state/get',
    get: 'seller_onboarding/get',
    insert: 'seller_onboarding/insert',
    update: 'seller_onboarding/update',
  },
  sellerDocuments: {
    get: 'seller_docs/get',
    insert: 'seller_docs/insert',
    update: 'seller_docs/update',
  },
  sellerBankDetails: {
    get: 'seller_bank_details/get',
    insert: 'seller_bank_details/insert',
    update: 'seller_bank_details/update',
  },
  sellerVerification: {
    get: 'seller_verification/get',
  },
  customerRegistration: {
    insert: 'customer_registration/insert',
  },
} as const;
