/**
 * This is where the tools for your agent will live.
 *
 * During the workshop you'll define tools in this file that your agents
 * will choose to run depending on the question or request that is made
 * to them.
 *
 * Workshop docs: https://agent-foundations-certification.vercel.app/docs/tools
 */

import { tool } from "ai";
import { z } from "zod";
import { FatalError, getWorkflowMetadata, RetryableError } from "workflow";
import { claimOrderReturn } from "@/lib/return-claim";
import { getReturnOrder, returnFlow } from "@/lib/workflows/return-flow";
import { returnInput, returnOutput, type ReturnInput } from "@/lib/return-schemas";
import {
  ApiRequestError,
  getCategories,
  getProductById,
  getProductsPage,
  getProductStock,
  isTransientApiError,
} from "@/lib/api";
import {
  categoriesOutput,
  productDetailsInput,
  productDetailsOutput,
  searchProductsInput,
  searchProductsOutput,
} from "@/lib/shopping-schemas";

type ReturnReply = { message: string; guidance: string };
type SearchInput = z.infer<typeof searchProductsInput>;
type SearchOutput = z.infer<typeof searchProductsOutput>;
type CategoriesOutput = z.infer<typeof categoriesOutput>;
type ProductDetailsInput = z.infer<typeof productDetailsInput>;
type ProductDetailsOutput = z.infer<typeof productDetailsOutput>;
type ReturnOutput = z.infer<typeof returnOutput>;

// Customer-facing `message` and model-only `guidance` for each non-eligibility return outcome.
const RETURN_REPLIES: Record<
  "stopped" | "started" | "alreadyRunning" | "alreadyFiled" | "unconfirmed" | "lookupUnavailable",
  ReturnReply
> = {
  alreadyRunning: {
    message: [
      "A return for this order is already being processed, so we didn't file another one.",
      "You don't need to do anything else.",
    ].join(" "),
    guidance: "Duplicate request: an earlier return for this order is still running. Nothing new was started.",
  },
  alreadyFiled: {
    message: [
      "A return for this order has already been filed, so we didn't file another one.",
      "The store still needs to review it before any refund is approved.",
    ].join(" "),
    guidance: "Duplicate request: this order already has a filed return. Nothing new was started.",
  },
  stopped: {
    message: [
      "We couldn't finish your return. Some steps may already have gone through, so please don't",
      "submit another return for this order yet.",
    ].join(" "),
    guidance: "The return stopped partway; earlier steps may have run. Don't resubmit automatically.",
  },
  started: {
    message: [
      "Your return request has been filed and is being processed in the background. Your refund isn't",
      "approved yet; the store still needs to review the return. You can keep chatting.",
    ].join(" "),
    guidance: "Filed and running; notification, pre-authorization and filing aren't confirmed yet. Not a refund approval.",
  },
  unconfirmed: {
    message: [
      "We couldn't confirm whether your return started. It may already be in progress, so please don't",
      "submit another request yet.",
    ].join(" "),
    guidance: "The return may already be running. Don't call it failed or resubmit.",
  },
  lookupUnavailable: {
    message: "We couldn't look up your order right now, so no return was started. Please try again in a moment.",
    guidance: "Order lookup is temporarily unavailable. No return workflow was started.",
  },
};
const NO_RETURN_GUIDANCE = "No return workflow was started.";

const RETURN_ORDER_DESCRIPTION = [
  "Look up an order, check that it can be returned, and start a background whole-order return.",
  "Ineligible or missing orders are rejected without starting anything.",
].join(" ");

// Steps retry temporary store failures without exposing upstream request details.
function lookupFailure(error: unknown): { ok: false; message: string } {
  if (isTransientApiError(error)) {
    throw new RetryableError("The store lookup is temporarily unavailable.");
  }
  if (error instanceof ApiRequestError && error.status === 404) {
    return { ok: false, message: "That product could not be found." };
  }
  return { ok: false, message: "The store could not complete this lookup. Check the filters and try again." };
}

async function searchProducts(input: SearchInput): Promise<SearchOutput> {
  "use step";
  try {
    if (input.category) {
      const categories = await getCategories();
      if (!categories.some((category) => category.slug === input.category)) {
        return {
          ok: false,
          message: "That category isn't in the store. Try browsing the available categories.",
          guidance: "Use getAllCategories to find current category slugs.",
        };
      }
    }
    const result = await getProductsPage(input);
    return { ok: true, products: result.data, pagination: result.meta.pagination };
  } catch (error) {
    return lookupFailure(error);
  }
}

async function getAllCategories(): Promise<CategoriesOutput> {
  "use step";
  try {
    return { ok: true, categories: await getCategories() };
  } catch (error) {
    return lookupFailure(error);
  }
}

async function getProductDetails(input: ProductDetailsInput): Promise<ProductDetailsOutput> {
  "use step";
  try {
    const [product, stock] = await Promise.all([
      getProductById(input.idOrSlug),
      getProductStock(input.idOrSlug),
    ]);
    return { ok: true, product, stock };
  } catch (error) {
    return lookupFailure(error);
  }
}

async function startReturn(input: ReturnInput, toolCallId: string): Promise<ReturnOutput> {
  "use step";
  // Step retries of this tool call reattach to their own run; other requests for the order are duplicates.
  const requestKey = `${getWorkflowMetadata().workflowRunId}:${toolCallId}`;
  let claim;
  try {
    claim = await claimOrderReturn(returnFlow, input, requestKey);
  } catch {
    throw new RetryableError("Unable to confirm that the return started. It may already be running.");
  }
  const { run, duplicate } = claim;
  // Observe only already-settled work; never wait for an unfinished child.
  const status = await run.status;
  if (status === "completed") {
    const outcome = await run.returnValue;
    if (!outcome.ok) return outcome;
    const reply = duplicate ? RETURN_REPLIES.alreadyFiled : { message: outcome.message, guidance: undefined };
    return { ok: true, status: "filed", runId: run.runId, returnId: outcome.returnId, ...reply };
  }
  if (status === "failed" || status === "cancelled") {
    return { ok: false, ...RETURN_REPLIES.stopped };
  }
  return { ok: true, status: "started", runId: run.runId, ...(duplicate ? RETURN_REPLIES.alreadyRunning : RETURN_REPLIES.started) };
}

async function returnOrder(input: ReturnInput, { toolCallId }: { toolCallId: string }): Promise<ReturnOutput> {
  // Reject missing/non-returnable orders before acknowledging background initiation.
  try {
    await getReturnOrder(input.orderId);
  } catch (error) {
    if (FatalError.is(error)) {
      return { ok: false, message: `${error.message} No return was started.`, guidance: `${error.message} ${NO_RETURN_GUIDANCE}` };
    }
    return { ok: false, ...RETURN_REPLIES.lookupUnavailable };
  }
  try {
    return await startReturn(input, toolCallId);
  } catch {
    return { ok: false, ...RETURN_REPLIES.unconfirmed };
  }
}

export const shoppingTools = {
  // The return tool checks existence and eligibility before starting any background work.
  returnOrder: tool({
    description: RETURN_ORDER_DESCRIPTION,
    inputSchema: returnInput,
    outputSchema: returnOutput,
    execute: returnOrder,
    // The chat already shows `message` to the shopper; hiding it keeps the model from repeating it.
    toModelOutput: ({ output }) => {
      const { message: _shown, ...result } = output;
      return { type: "json", value: { ...result, customerAlreadySawOutcome: true } };
    },
  }),
  searchProducts: tool({
    description: "Browse or search products by text and a live category slug. Use pagination to see more results.",
    inputSchema: searchProductsInput,
    outputSchema: searchProductsOutput,
    execute: searchProducts,
  }),
  getAllCategories: tool({
    description: "Discover the store's current categories and their product counts.",
    inputSchema: z.object({}),
    outputSchema: categoriesOutput,
    execute: getAllCategories,
  }),
  getProductDetails: tool({
    description: "Get full product details and current stock using a product ID or slug.",
    inputSchema: productDetailsInput,
    outputSchema: productDetailsOutput,
    execute: getProductDetails,
  }),
};
