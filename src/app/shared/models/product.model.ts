export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  category: string;
  inStock: boolean;
  originalPrice?: number;
  discountLabel?: string;
  rating?: number;
  reviewCount?: string;
  variantDetails?: string;
}
