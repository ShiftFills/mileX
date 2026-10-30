/** Display names for product category slugs (used by storefront filters). */
export const PRODUCT_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  fashion: 'Fashion',
  electronics: 'Electronics',
  'home-living': 'Home & Living',
  beauty: 'Beauty',
};

export function productCategoryLabel(category: string): string {
  if (PRODUCT_CATEGORY_LABELS[category]) return PRODUCT_CATEGORY_LABELS[category];
  if (category.startsWith('category-')) return `Category ${category.slice('category-'.length)}`;
  return 'Uncategorized';
}
