// Place your return workflow here!
import { FatalError, RetryableError } from "workflow";
import {
  ApiRequestError,
  createReturn,
  getOrder,
  isTransientApiError,
  notifyReturnInProcess,
  preauthorizeRefund,
} from "@/lib/api";
import type { Order } from "@/lib/types";
import type { ReturnInput, ReturnOutcome } from "@/lib/return-schemas";

// Stage names appear in step errors and in the workflow's customer-facing failure result.
const STAGE_ORDER_LOOKUP = "Order lookup";
const STAGE_CUSTOMER_NOTIFICATION = "Customer notification";
const STAGE_REFUND_PREAUTHORIZATION = "Refund pre-authorization";
const STAGE_RETURN_FILING = "Return filing";

// Keep upstream details out of durable errors and customer-visible results.
function returnFailure(error: unknown, action: string): never {
  if (!isTransientApiError(error)) {
    const orderNotFound = error instanceof ApiRequestError && error.status === 404 && action === STAGE_ORDER_LOOKUP;
    throw new FatalError(
      orderNotFound
        ? "That order could not be found."
        : `${action} was rejected by the store. The return has not been completed.`,
    );
  }
  throw new RetryableError(`${action} is temporarily unavailable; completion could not be confirmed.`);
}

// The preflight and child both use live order data before any return side effects.
export async function getReturnOrder(orderId: string): Promise<Order> {
  "use step";
  let order: Order;
  try {
    order = await getOrder(orderId);
  } catch (error) {
    return returnFailure(error, STAGE_ORDER_LOOKUP);
  }
  if (order.status !== "fulfilled") throw new FatalError("Only fulfilled orders are eligible for a return.");
  const hasInvalidItem = order.items.some(
    (item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1,
  );
  if (!order.items.length || hasInvalidItem) {
    throw new FatalError("The order has no valid items to return.");
  }
  return order;
}

async function notifyCustomer(orderId: string): Promise<void> {
  "use step";
  try {
    await notifyReturnInProcess(orderId);
  } catch (error) {
    returnFailure(error, STAGE_CUSTOMER_NOTIFICATION);
  }
}

async function authorizeRefund(orderId: string): Promise<void> {
  "use step";
  try {
    await preauthorizeRefund(orderId);
  } catch (error) {
    returnFailure(error, STAGE_REFUND_PREAUTHORIZATION);
  }
}

async function fileReturn(input: ReturnInput, order: Order): Promise<string> {
  "use step";
  try {
    const result = await createReturn({
      orderId: order.id,
      reason: input.reason,
      items: order.items.map(({ productId, quantity }) => ({ productId, quantity })),
    });
    return result.id;
  } catch (error) {
    return returnFailure(error, STAGE_RETURN_FILING);
  }
}

export async function returnFlow(input: ReturnInput): Promise<ReturnOutcome> {
  "use workflow";
  // Each completed action replays independently when a later action retries.
  let stage = STAGE_ORDER_LOOKUP;
  try {
    const order = await getReturnOrder(input.orderId);
    stage = STAGE_CUSTOMER_NOTIFICATION;
    await notifyCustomer(order.id);
    stage = STAGE_REFUND_PREAUTHORIZATION;
    await authorizeRefund(order.id);
    stage = STAGE_RETURN_FILING;
    const returnId = await fileReturn(input, order);
    return {
      ok: true,
      returnId,
      message: "The store accepted the return for processing. Its decision and refund approval are still pending.",
    };
  } catch {
    return {
      ok: false,
      message: [
        `We couldn't finish your return: ${stage.toLowerCase()} could not be confirmed.`,
        "Some earlier steps may already have gone through, so please don't submit another return for this order yet.",
      ].join(" "),
      guidance: [
        `${stage} could not be confirmed.`,
        "Earlier completed actions may already have taken effect. Do not automatically submit another return request.",
      ].join(" "),
    };
  }
}
