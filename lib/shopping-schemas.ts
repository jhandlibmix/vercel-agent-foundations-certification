import { z } from "zod";

export const searchProductsInput = z.object({
  search: z.string().trim().optional().describe("Text to match; omit to browse the catalog."),
  category: z.string().trim().min(1).optional().describe("A slug discovered with getAllCategories."),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(8),
});
export const productDetailsInput = z.object({ idOrSlug: z.string().trim().min(1) });

const productSchema = z.object({
  id: z.string(), name: z.string(), slug: z.string(), description: z.string(),
  price: z.number().int(), currency: z.string(), category: z.string(),
  images: z.array(z.string()), featured: z.boolean(), tags: z.array(z.string()), createdAt: z.string(),
});
// `message` is shown to shoppers; optional `guidance` is only for the model.
export const failureSchema = z.object({ ok: z.literal(false), message: z.string(), guidance: z.string().optional() });
export const searchProductsOutput = z.union([failureSchema, z.object({
  ok: z.literal(true), products: z.array(productSchema),
  pagination: z.object({ page: z.number(), limit: z.number(), total: z.number(), totalPages: z.number(), hasNextPage: z.boolean(), hasPreviousPage: z.boolean() }),
})]);
export const categoriesOutput = z.union([failureSchema, z.object({
  ok: z.literal(true), categories: z.array(z.object({ slug: z.string(), name: z.string(), productCount: z.number() })),
})]);
export const productDetailsOutput = z.union([failureSchema, z.object({
  ok: z.literal(true), product: productSchema,
  stock: z.object({ productId: z.string(), stock: z.number(), inStock: z.boolean(), lowStock: z.boolean() }),
})]);
