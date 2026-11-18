import { tool } from "ai";
import { z } from "zod";
import { getStepMetadata, RetryableError } from "workflow";
import { appendAdminMemory, getAdminSandbox, runAdminCommand } from "@/lib/admin-sandbox";
import type { BashResult, MemoryResult } from "@/lib/admin-sandbox";
import {
  ApiRequestError,
  getBackOfficeReturns,
  getBackOfficeSales,
  getBackOfficeStock,
  getBackOfficeSupportTickets,
  isTransientApiError,
} from "@/lib/api";
import { inventoryStockInput, returnsHistoryInput, salesAnalyticsInput, supportTicketsInput } from "@/lib/admin-schemas";
import { shoppingTools } from "@/lib/tools";
import type {
  BackOfficeDateRangeMeta,
  BackOfficeSalesMeta,
  BackOfficeStockMeta,
  ProductSalesRow,
  Return,
  StockEntry,
  SupportTicket,
} from "@/lib/types";

type DatasetResult<T, M> =
  | { ok: true; data: T; meta: M; path: string; limitations: string[] }
  | { ok: false; message: string };

// Descriptions say what each tool does; analysis policy lives in ADMIN_INSTRUCTIONS.
const SAVED_FILE = "Saves the full response (data, meta, limitations) to a Sandbox JSON file and returns its path.";

const SUPPORT_TICKETS_DESCRIPTION = [
  "Read support tickets filtered by date, status, priority, category, assignee and limit (max 500,",
  `no pagination). ${SAVED_FILE}`,
].join(" ");

const RETURNS_HISTORY_DESCRIPTION = [
  "Read return history with order and refund details, filtered by date, status, decision (requires",
  `status completed) and limit (max 500, no pagination). ${SAVED_FILE}`,
].join(" ");

const INVENTORY_STOCK_DESCRIPTION = [
  "Read current inventory filtered by productIds, lowStock and inStock, with page and limit. Follow",
  `meta.pagination.hasNextPage for complete results. ${SAVED_FILE}`,
].join(" ");

const SALES_ANALYTICS_DESCRIPTION = [
  "Read units sold, orders and revenue (integer cents) per product for a date range, optionally",
  `for one productId. ${SAVED_FILE}`,
].join(" ");

const BASH_DESCRIPTION = [
  "Run a bash command in the persistent Vercel Sandbox, isolated from the app server. node and",
  "python3 are available for reading saved data files. 30-second timeout; a nonzero exit code is a failure.",
].join(" ");

const SAVE_MEMORY_DESCRIPTION = [
  "Append a note to persistent admin memory: an employee preference, correction or business fact.",
  "Never save secrets.",
].join(" ");

// Limitations are saved with each dataset so calculations and final reports keep the data caveats.
const HISTORY_LIMITATIONS = [
  [
    "API-returned dataset, not a guaranteed complete population. Tickets and returns are capped at",
    "the requested limit (default 25, maximum 500), without pagination; a full page may be",
    "truncated. History covers approximately 180 days.",
  ].join(" "),
];
const STOCK_LIMITATIONS = [
  [
    "Current stock, not historical stock. Follow meta.pagination.hasNextPage with the next page",
    "before claiming a complete ranking.",
  ].join(" "),
];
const SALES_LIMITATIONS = [
  [
    "Money is in integer cents. Sales history covers approximately 180 days; older windows can",
    "return zero totals.",
  ].join(" "),
];

// Admin analysis must calculate from the actual response in the same sandbox as memory.
async function saveDataset<T, M>(result: { data: T; meta: M }, limitations: string[]): Promise<DatasetResult<T, M>> {
  const sandbox = await getAdminSandbox();
  const path = `/vercel/sandbox/data-${getStepMetadata().stepId}.json`;
  // Calculations need the same caveats as the lookup so final reports retain data limits.
  await sandbox.writeFiles([{ path, content: JSON.stringify({ ...result, limitations }) }]);
  return { ok: true, ...result, path, limitations };
}

function lookupFailure(error: unknown): { ok: false; message: string } {
  if (isTransientApiError(error)) {
    throw new RetryableError("The admin lookup or sandbox dataset write is temporarily unavailable.");
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return { ok: false, message: "The requested record or product could not be found." };
  }
  return { ok: false, message: "The store could not complete this lookup. Check the filters and try again." };
}

async function getSupportTickets(
  input: z.infer<typeof supportTicketsInput>,
): Promise<DatasetResult<SupportTicket[], BackOfficeDateRangeMeta>> {
  "use step";
  try {
    return await saveDataset(await getBackOfficeSupportTickets(input), HISTORY_LIMITATIONS);
  } catch (error) {
    return lookupFailure(error);
  }
}

async function getReturnsHistory(
  input: z.infer<typeof returnsHistoryInput>,
): Promise<DatasetResult<Return[], BackOfficeDateRangeMeta>> {
  "use step";
  try {
    return await saveDataset(await getBackOfficeReturns(input), HISTORY_LIMITATIONS);
  } catch (error) {
    return lookupFailure(error);
  }
}

async function getInventoryStock(
  input: z.infer<typeof inventoryStockInput>,
): Promise<DatasetResult<StockEntry[], BackOfficeStockMeta>> {
  "use step";
  try {
    return await saveDataset(await getBackOfficeStock(input), STOCK_LIMITATIONS);
  } catch (error) {
    return lookupFailure(error);
  }
}

async function getSalesAnalytics(
  input: z.infer<typeof salesAnalyticsInput>,
): Promise<DatasetResult<ProductSalesRow[], BackOfficeSalesMeta>> {
  "use step";
  try {
    return await saveDataset(await getBackOfficeSales(input), SALES_LIMITATIONS);
  } catch (error) {
    return lookupFailure(error);
  }
}

// Only the authenticated admin workflow receives sandbox capabilities.
export const adminTools = {
  getSupportTickets: tool({
    description: SUPPORT_TICKETS_DESCRIPTION,
    inputSchema: supportTicketsInput,
    execute: getSupportTickets,
  }),
  getReturnsHistory: tool({
    description: RETURNS_HISTORY_DESCRIPTION,
    inputSchema: returnsHistoryInput,
    execute: getReturnsHistory,
  }),
  getInventoryStock: tool({
    description: INVENTORY_STOCK_DESCRIPTION,
    inputSchema: inventoryStockInput,
    execute: getInventoryStock,
  }),
  getSalesAnalytics: tool({
    description: SALES_ANALYTICS_DESCRIPTION,
    inputSchema: salesAnalyticsInput,
    execute: getSalesAnalytics,
  }),
  searchProducts: shoppingTools.searchProducts,
  getAllCategories: shoppingTools.getAllCategories,
  bash: tool({
    description: BASH_DESCRIPTION,
    inputSchema: z.object({ command: z.string().trim().min(1) }),
    execute: async ({ command }: { command: string }): Promise<BashResult> => runAdminCommand(command),
  }),
  saveMemory: tool({
    description: SAVE_MEMORY_DESCRIPTION,
    inputSchema: z.object({ note: z.string().trim().min(1) }),
    execute: async ({ note }: { note: string }): Promise<MemoryResult> => appendAdminMemory(note),
  }),
};
