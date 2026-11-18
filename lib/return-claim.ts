import { getHookByToken, getRun, start } from "workflow/api";
import { HookConflictError } from "workflow/errors";
import type { ReturnInput, ReturnOutcome } from "@/lib/return-schemas";

type ReturnWorkflow = (input: ReturnInput) => Promise<ReturnOutcome>;
type ReturnRun = ReturnType<typeof getRun<ReturnOutcome>>;

// Long enough that a later chat (or another tab) can't file the same order twice.
const ORDER_TOKEN_RETENTION = "30 days";
// Each failed attempt hands the order to the next token; this bounds the chain walk.
const MAX_ATTEMPTS_PER_ORDER = 10;

async function ownerRequestKey(token: string): Promise<unknown> {
  try {
    const metadata: unknown = await (await getHookByToken(token)).metadata;
    return typeof metadata === "object" && metadata !== null && "requestKey" in metadata ? metadata.requestKey : undefined;
  } catch {
    // The retention can lapse between the conflict and this read; treat the owner as someone else.
    return undefined;
  }
}

/**
 * Start at most one return per order. The order token is held while a return runs and stays
 * reserved after it succeeds, so a repeated request reports the existing return instead of
 * notifying, pre-authorizing and filing again. A retry of the same request (same `requestKey`)
 * reattaches to its own run. Only a failed attempt frees the order for a new one, which then
 * claims a token derived from the failed run so concurrent retries still collide.
 */
export async function claimOrderReturn(
  workflow: ReturnWorkflow,
  input: ReturnInput,
  requestKey: string,
): Promise<{ run: ReturnRun; duplicate: boolean }> {
  const orderKey = encodeURIComponent(input.orderId.toLowerCase());
  let token = `return-order:${orderKey}`;
  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_ORDER; attempt++) {
    try {
      const run = await start(workflow, [input], {
        experimental_hook: { token, experimental_minRetention: ORDER_TOKEN_RETENTION, metadata: { requestKey } },
      });
      return { run, duplicate: false };
    } catch (error) {
      if (!HookConflictError.is(error) || !error.conflictingRunId) throw error;
      const owner = getRun<ReturnOutcome>(error.conflictingRunId);
      if ((await ownerRequestKey(token)) === requestKey) return { run: owner, duplicate: false };
      const status = await owner.status;
      if (status === "pending" || status === "running") return { run: owner, duplicate: true };
      if (status === "completed" && (await owner.returnValue).ok) return { run: owner, duplicate: true };
      token = `return-order:${orderKey}:after:${owner.runId}`;
    }
  }
  throw new Error("Too many earlier return attempts for this order.");
}
