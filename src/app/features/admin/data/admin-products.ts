export interface AdminProductRow {
  id: number;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: string;
  stock: number;
  status: 'Active' | 'Inactive';
  image: string;
}

/** Extra catalogue fields shown on the full Edit Product screen (demo data, no API connected yet). */
export interface AdminProductDetails {
  subcategory: string;
  description: string;
  hsnCode: string;
  taxRate: string;
  mrp: string;
  discount: string;
  minimumOrderQuantity: string;
  maximumOrderQuantity: string;
  weight: string;
  length: string;
  width: string;
  height: string;
  hasVariants: boolean;
}

export const ADMIN_PRODUCTS: AdminProductRow[] = Array.from({ length: 128 }, (_, index) => ({
  id: index + 1,
  name: 'Wireless Earbuds',
  sku: 'MLEX-001',
  category: 'Electronics',
  brand: 'Samsung',
  price: '₹2,500',
  stock: 120,
  status: index < 112 ? 'Active' : 'Inactive',
  image: '/images/headphones.svg',
}));

export const ADMIN_PRODUCT_DETAILS: AdminProductDetails = {
  subcategory: 'Audio',
  description: 'High quality wireless earbuds with noise cancellation and long battery life.',
  hsnCode: '851762',
  taxRate: '18%',
  mrp: '4999',
  discount: '50',
  minimumOrderQuantity: '1',
  maximumOrderQuantity: '10',
  weight: '0.25',
  length: '5',
  width: '5',
  height: '3',
  hasVariants: true,
};

export function findAdminProduct(id: string | number): AdminProductRow | undefined {
  return ADMIN_PRODUCTS.find((product) => String(product.id) === String(id));
}
