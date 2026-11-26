export const API_ENDPOINTS = {
  products: {
    get: 'products/get',
    insert: 'products/insert',
    update: 'products/update',
  },
  productLookups: {
    // Public endpoint: storefront visitors who are not logged in have no access token.
    // The category list of every screen that consumes categories (Add/Edit Product, All Products, Home, Product
    // Listing, Header Menu). Admin changes made through categoryManagement below invalidate its cached response.
    categories: 'all_category/get',
    subCategories: 'sub_category/get',
    brands: 'brand_management/get',
    taxRates: 'tax_rate/get',
    productCodes: 'product_code/get',
  },
  // CHANGED (new): Admin Category Management (requires an Admin access token).
  categoryManagement: {
    /** GET `?CATEGORY_ID=-1&LIMIT=…&OFFSET=…` (-1: every category, parents and subcategories). */
    get: 'category_management/get',
    /** POST `{ CATEGORY_NAME, PARENT_CATEGORY_ID, CATEGORY_IMAGE, DESCRIPTION, STATUS, CREATED_BY }`. */
    insert: 'category_management/insert',
    /** PUT `{ CATEGORY_ID, CATEGORY_NAME, PARENT_CATEGORY_ID, CATEGORY_IMAGE, DESCRIPTION, STATUS, UPDATED_BY }`. */
    update: 'category_management/update',
    /** DELETE with body `{ CATEGORY_ID }`. */
    delete: 'category_management/delete',
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
  // CHANGED (new): customer Shipment Tracking. GET `?ORDER_NUMBER=…&LIMIT=…&OFFSET=…`: one row per product of the
  // order, each with the order's shipping and carrier details.
  shipmentTracking: {
    get: 'tracking',
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
    // CHANGED (new): Order Management (Admin). PUT `{ ORDER_ID, ORDER_STATUS, PAYMENT_STATUS, SHIPPING_STATUS }`, the
    // status IDs from the order, payment and shipping status lookups.
    update: 'place_order/update',
  },
  shoppingCart: {
    get: 'shopping_cart/get',
    insert: 'shopping_cart/insert',
    delete: 'shopping_cart/delete',
  },
  // CHANGED: the wishlist has its own APIs. They replace wishlist/save_for_later (the hearts and the cart's Save for
  // later) and move_to_cart/get + move_to_cart/update (the Wishlist screen), which worked on saved cart rows (CART_ID).
  // The access token identifies the customer; a wishlist item is a PRODUCT_ID with its PRODUCT_VARIANT_ID.
  wishlist: {
    /** POST `{ PRODUCT_ID, PRODUCT_VARIANT_ID, ACTION: "ADD" | "REMOVE" }`: adds or removes one product variant. */
    manage: 'wishlist/manage',
    /** GET `?LIMIT=…&OFFSET=…`: one page of the signed-in customer's wishlist, with each product's details. */
    get: 'wishlist/get',
  },
  // CHANGED (new): the customer Offers & Discounts page. Requires an access token.
  offerDiscount: {
    /**
     * GET `?OFFER_ID=…&LIMIT=…&OFFSET=…`: one row per offer and applicable product, so an offer for several products
     * comes back as several rows with the same OFFER_ID. OFFER_ID=-1 asks for every offer (as in the other listings).
     */
    get: 'offer_discount/get',
  },
  // CHANGED (new): product image storage on AWS S3.
  s3Images: {
    /** POST multipart/form-data with the file in the `image` field. */
    upload: 's3/upload',
    /**
     * GET `s3/images/<folder>/<file name>` (the image key, e.g. `s3/images/images/a1.png`) returns a signed URL.
     * `s3/image/<name>` is not a route (404).
     */
    image: 's3/images',
  },
} as const;