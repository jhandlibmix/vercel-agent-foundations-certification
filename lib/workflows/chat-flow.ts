// Place your chat workflow and DurableAgent here!

import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { convertToModelMessages, type UIMessage } from "ai";
import { FatalError, getWritable } from "workflow";
import { CHAT_MODEL, SHOPPING_INSTRUCTIONS } from "@/lib/agent";
import { shoppingTools } from "@/lib/tools";

// A separate durable agent keeps shopping tools out of the admin conversation.
export async function chatFlow(messages: UIMessage[]): Promise<void> {
  "use workflow";

  const agent = new WorkflowAgent({
    model: CHAT_MODEL,
    instructions: SHOPPING_INSTRUCTIONS,
    tools: shoppingTools,
  });
  // Passing the tools applies returnOrder's model-only output to earlier turns too.
  const result = await agent.stream({
    messages: await convertToModelMessages(messages, { tools: shoppingTools }),
    writable: getWritable<ModelCallStreamPart>(),
  });

  // Model-stream failures can resolve instead of throwing; they must fail the run too.
  if ("error" in result || result.finishReason === "error") {
    throw new FatalError("The assistant could not complete this response.");
  }
}
