export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  category: string;
  inStock: boolean;
  sku?: string;
  productCodeId?: string;
  brand?: string;
  isActive?: boolean;
  originalPrice?: number;
  discountLabel?: string;
  rating?: number;
  reviewCount?: string;
  variantDetails?: string;
  /** Gallery images; falls back to `imageUrl` when omitted. */
  images?: string[];
  colors?: ProductColor[];
  sizes?: string[];
  /** Units left; surfaced as "Only N left" when low. */
  stockLeft?: number;
  /** Maximum quantity allowed per order by the catalog API. */
  maxOrderQuantity?: number;
  highlights?: string[];
  specifications?: ProductSpecification[];
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductSpecification {
  label: string;
  value: string;
}
