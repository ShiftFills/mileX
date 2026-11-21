/**
 * Storefront URL of a PRODUCT_IMAGE path ("uploads/products/a.png" -> "/uploads/products/a.png").
 * Full URLs are kept as they are. Undefined when the product has no image.
 */
export function productImageUrl(path: string | null | undefined): string | undefined {
  if (!path?.trim()) return undefined;
  if (/^(?:https?:|blob:|data:)/i.test(path)) return path;
  return `/${path.replace(/^\/+/, '')}`;
}
