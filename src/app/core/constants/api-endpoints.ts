export const API_ENDPOINTS = {
  products: {
    get: 'products/get',
    insert: 'products/insert',
    update: 'products/update',
  },
  productLookups: {
    // Public endpoint: storefront visitors who are not logged in have no access token.
    categories: 'all_category/get',
    subCategories: 'sub_category/get',
    brands: 'brand_management/get',
    taxRates: 'tax_rate/get',
    productCodes: 'product_code/get',
  },
  productVariants: {
    get: 'product_variant/get',
    insert: 'product_variant/insert',
    update: 'product_variant/update',
    delete: 'product_variant/delete',
  },
  variantLookups: {
    colours: 'colours/get',
    sizes: 'sizes/get',
    materials: 'materials/get',
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
    // CHANGED (new): Account Type dropdown options (-1 = all account types).
    accountTypes: 'bank_account_type/get/-1',
  },
  sellerVerification: {
    get: 'seller_verification/get',
    updateDecision: 'seller_approve_reject/update',
  },
  user: {
    login: 'user/login',
    // CHANGED (new): POST, no body. The backend reads the HttpOnly `refreshToken` cookie it sets at login.
    refresh: 'user/refresh',
  },
  orderManagement: {
    get: 'order_dashboard/get',
    orderCount: 'order_count/get',
    orderStatuses: 'all_status/get',
    paymentStatuses: 'payment_status/get',
    shippingStatuses: 'shipping_status/get',
  },
  sellerDashboard: {
    summary: 'seller_dashboard/dashboard',
  },
  dateFilter: {
    get: 'date_filter/get',
  },
  status: {
    get: 'status/get/-1',
  },
  documentVerification: {
    approve: 'document_verification/approve',
    reject: 'document_verification/reject',
  },
  customerRegistration: {
    insert: 'customer_registration/insert',
  },
  customerAddress: {
    get: 'customer_address/get',
    insert: 'customer_address/insert',
    update: 'customer_address/update',
  },
  customerOrders: {
    get: 'customer_orders/get',
  },
  returnReasons: {
    get: 'return_reason/get',
  },
  returnRequests: {
    get: 'return_request/get',
    update: 'return_request/update',
  },
  paymentMethod: {
    get: 'payment_method/get',
  },
  placeOrder: {
    insert: 'place_order',
  },
  shoppingCart: {
    get: 'shopping_cart/get',
    insert: 'shopping_cart/insert',
    delete: 'shopping_cart/delete',
  },
  wishlist: {
    saveForLater: 'wishlist/save_for_later',
  },
} as const;