import "server-only";

import { createModelCallToUIChunkTransform, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { createUIMessageStreamResponse, safeValidateUIMessages, type UIMessage, type UIMessageChunk } from "ai";
import { getRun, start } from "workflow/api";
import { HookConflictError } from "workflow/errors";
import { z } from "zod";

type ChatWorkflow = (messages: UIMessage[]) => Promise<void>;
const requestSchema = z.object({ requestId: z.string().uuid(), messages: z.array(z.unknown()).min(1) });
const FAILURE_MESSAGE = "The assistant could not complete this response. Please try again.";

type ChatRun = ReturnType<typeof getRun>;

// The conversation must end with a user message that has non-empty text.
function isUserTurn(messages: UIMessage[]): boolean {
  const onlyChatRoles = messages.every((message) => message.role === "user" || message.role === "assistant");
  const last = messages.at(-1);
  const endsWithUser = last?.role === "user";
  const hasText = Boolean(last?.parts.some((part) => part.type === "text" && part.text.trim().length > 0));
  return onlyChatRoles && endsWithUser && hasText;
}

// A retry with the same requestId joins the existing run through its hook token.
async function startOrJoinRun(workflow: ChatWorkflow, messages: UIMessage[], scope: string, requestId: string): Promise<ChatRun> {
  try {
    return await start(workflow, [messages], {
      experimental_hook: {
        token: `${scope}:${requestId.toLowerCase()}`,
        // Late retries reuse a finished run for one day from start, not indefinitely.
        experimental_minRetention: "1 day",
      },
    });
  } catch (error) {
    if (!HookConflictError.is(error) || !error.conflictingRunId) throw error;
    return getRun(error.conflictingRunId);
  }
}

// The public reconnect route must never stream an admin workflow by run ID.
async function findChatRun(id: string, workflow: ChatWorkflow): Promise<ChatRun | null> {
  const run = getRun(id);
  const workflowId = (workflow as ChatWorkflow & { workflowId?: string }).workflowId;
  if (!(await run.exists) || !workflowId || await run.workflowName !== workflowId) return null;
  return run;
}

// Always replay the durable stream from its start; uiStartIndex skips chunks the client already has.
function replayRun(run: ChatRun, uiStartIndex: number): Response {
  return streamResponse(run.getReadable<ModelCallStreamPart>({ startIndex: 0 }), run.runId, uiStartIndex);
}

// Both chats need the same validation, retry identity, and safe stream boundary.
export async function startChat(request: Request, workflow: ChatWorkflow, scope: "shop-chat" | "admin-chat"): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid chat request." }, { status: 400 });
  const validated = await safeValidateUIMessages({ messages: parsed.data.messages });
  if (!validated.success || !isUserTurn(validated.data)) {
    return Response.json({ error: "Send user and assistant messages ending with a user message." }, { status: 400 });
  }

  try {
    const run = await startOrJoinRun(workflow, validated.data, scope, parsed.data.requestId);
    return replayRun(run, 0);
  } catch {
    return Response.json({ error: "Unable to start the assistant. Retry this request." }, { status: 503 });
  }
}

export async function resumeChat(request: Request, id: string, workflow: ChatWorkflow): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const statusOnly = query.get("status") === "1";
  const startIndex = Number(query.get("startIndex") ?? "0");
  if (!statusOnly && (!Number.isSafeInteger(startIndex) || startIndex < 0)) {
    return Response.json({ error: "startIndex must be a non-negative safe integer." }, { status: 400 });
  }
  try {
    const run = await findChatRun(id, workflow);
    if (!run) return Response.json({ error: "Chat run not found." }, { status: 404 });
    if (statusOnly) {
      return Response.json({ status: await run.status }, { headers: { "Cache-Control": "no-store" } });
    }
    return replayRun(run, startIndex);
  } catch {
    return Response.json({ error: "Unable to reconnect to the assistant." }, { status: 503 });
  }
}

function streamResponse(rawStream: ReadableStream<ModelCallStreamPart>, runId: string, uiStartIndex: number): Response {
  const stream = rawStream
    // UI cursors count transformed chunks, not durable model-call parts.
    .pipeThrough(createModelCallToUIChunkTransform({ uiStartIndex }))
    .pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller): void {
        // Provider errors can include request details; never forward their payloads.
        switch (chunk.type) {
          case "error":
            controller.enqueue({ type: "error", errorText: FAILURE_MESSAGE });
            break;
          case "tool-input-error":
            controller.enqueue({ type: "tool-input-error", toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: {}, errorText: FAILURE_MESSAGE });
            break;
          case "tool-output-error":
            controller.enqueue({ type: "tool-output-error", toolCallId: chunk.toolCallId, errorText: FAILURE_MESSAGE });
            break;
          default:
            controller.enqueue(chunk);
        }
      },
    }));
  const safeStream = withSanitizedReadErrors(stream);
  return createUIMessageStreamResponse({ stream: safeStream, headers: { "x-workflow-run-id": runId, "Cache-Control": "no-store" } });
}

// Read failures happen after the route returns, so keep those errors private too.
function withSanitizedReadErrors(stream: ReadableStream<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  return new ReadableStream<UIMessageChunk>({
    async pull(controller): Promise<void> {
      try {
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch {
        controller.enqueue({ type: "error", errorText: FAILURE_MESSAGE });
        controller.close();
      }
    },
    async cancel(): Promise<void> { await reader.cancel(); },
  });
}
