import { z } from "zod";
import { failureSchema } from "@/lib/shopping-schemas";

export const returnInput = z.object({
  orderId: z.string().trim().min(1).describe("The customer's order identifier."),
  reason: z.string().trim().min(3).max(500).describe("The customer's reason for returning the whole order."),
});
// `message` is shown to the shopper; optional `guidance` instructs the model only.
const guidance = z.string().optional();
export const returnOutput = z.union([
  failureSchema,
  z.object({ ok: z.literal(true), status: z.literal("started"), runId: z.string(), message: z.string(), guidance }),
  z.object({ ok: z.literal(true), status: z.literal("filed"), runId: z.string(), returnId: z.string(), message: z.string(), guidance }),
]);
export type ReturnInput = z.infer<typeof returnInput>;
export type ReturnOutcome = { ok: true; returnId: string; message: string } | { ok: false; message: string; guidance?: string };
