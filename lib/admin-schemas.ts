import { z } from "zod";

const date = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a valid calendar date."),
  z.string().datetime({ offset: true }),
]);
const dates = { from: date.optional(), to: date.optional() };

const DATE_ORDER_MESSAGE = "from must not be after to.";

function orderedDates(input: { from?: string; to?: string }): boolean {
  if (!input.from || !input.to) return true;
  // A date-only `to` covers the whole day.
  const end = input.to.length === 10 ? `${input.to}T23:59:59.999Z` : input.to;
  return Date.parse(input.from) <= Date.parse(end);
}

export const supportTicketsInput = z.object({
  ...dates,
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  category: z.enum(["shipping", "returns", "product_quality", "sizing", "billing", "payment", "account", "other"]).optional(),
  assignee: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).refine(orderedDates, DATE_ORDER_MESSAGE);

export const returnsHistoryInput = z.object({
  ...dates,
  status: z.enum(["pending", "processing", "completed"]).optional(),
  decision: z.enum(["approved", "rejected", "needs_info"]).optional(),
  limit: z.number().int().min(1).max(500).optional(),
}).refine(orderedDates, DATE_ORDER_MESSAGE)
  .refine(
    (input) => !input.decision || !input.status || input.status === "completed",
    "A decision filter requires completed returns.",
  );

export const inventoryStockInput = z.object({
  productIds: z.array(z.string().trim().min(1)).optional(),
  lowStock: z.boolean().optional(),
  inStock: z.boolean().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const salesAnalyticsInput = z.object({
  ...dates,
  productId: z.string().trim().min(1).optional(),
}).refine(orderedDates, DATE_ORDER_MESSAGE);

// Output schemas for the admin tool-result UI.
export const commandInput = z.object({ command: z.string() });
export const commandOutput = z.object({
  ok: z.boolean(),
  command: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  truncated: z.boolean(),
});
export const memoryOutput = z.object({ ok: z.literal(true), message: z.string() });
// The tool output keeps model-facing fields (file path, limitations); only data and meta are rendered.
export const datasetOutput = z.object({ ok: z.literal(true), data: z.array(z.unknown()), meta: z.unknown() });
export const lookupError = z.object({ ok: z.literal(false), message: z.string() });
export const limitInput = z.object({ limit: z.number().optional() });

export const rangeMeta = z.object({ count: z.number(), from: z.string(), to: z.string() });
export const ticketRow = z.object({
  id: z.string(),
  subject: z.string(),
  status: z.string(),
  priority: z.string(),
  category: z.string(),
  assignee: z.string().nullable(),
  createdAt: z.string(),
});
export const returnRow = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.string(),
  decision: z.string().nullable(),
  refundAmount: z.number().nullable(),
  createdAt: z.string(),
});
export const stockRow = z.object({
  productId: z.string(),
  product: z.object({ name: z.string(), category: z.string() }),
  stock: z.number(),
  inStock: z.boolean(),
  lowStock: z.boolean(),
});
export const stockMeta = z.object({
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNextPage: z.boolean(),
  }),
});
export const salesRow = z.object({
  productId: z.string(),
  product: z.object({ name: z.string() }),
  unitsSold: z.number(),
  ordersCount: z.number(),
  revenue: z.number(),
  currency: z.string(),
});
export const salesMeta = rangeMeta.extend({
  days: z.number(),
  currency: z.string(),
  totals: z.object({ unitsSold: z.number(), ordersCount: z.number(), revenue: z.number() }),
});
