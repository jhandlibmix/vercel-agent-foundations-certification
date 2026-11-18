# Chat stack evidence — STATUS: COMPLETE for scope (see Unresolved)

Scope: issue `research-chat-stack`. Local facts below observed in main checkout `node_modules` (not installed/changed by research). No env/credential files read.

## Local facts (observed)
- package.json: `ai ^7.0.2`, `@ai-sdk/react ^4.0.3`, `zod ^3.25.76`, `streamdown ^2.5.0`, `@vercel/oidc ^3.7.1`, `next 16.3.8`, `react 19.2.4`.
- Installed: ai 7.0.2, @ai-sdk/react 4.0.3, @ai-sdk/gateway 4.0.2 (transitive dep of `ai`, `.pnpm` only; not top-level), @ai-sdk/provider-utils 5.0.0, zod 3.25.76 (also zod 4.1.11 in `.pnpm`). `ai` peer: zod ^3.25.76 || ^4.1.8 → zod 3 OK. `@ai-sdk/react` peer react includes ^19.2.1 → OK.
- NOT installed: `workflow`, `@workflow/ai`, `@ai-sdk/workflow`/WorkflowAgent (not exported by `ai` 7.0.2 d.ts). Only `@workflow/serde` present transitively.
- No `components/ai-elements/` tool/reasoning components: only `conversation.tsx`, `message.tsx`, `prompt-input.tsx`, `suggestion.tsx`. `message.tsx` exports `Message`, `MessageContent`, `MessageResponse` (Streamdown), actions, branch. `Suggestion` takes `suggestion` + `onClick(suggestion: string)`.
- Shells: `components/agent-chat.tsx` and `components/admin-agent-chat.tsx` use local `useState`, empty `handleSubmit(message: PromptInputMessage) {}`, `PromptInputSubmit status="ready"`. Admin shell has 3 `SUGGESTIONS` (not wired to onClick).
- Routes `app/api/chat/route.ts`, `app/api/admin/chat/route.ts` return 501 stubs; `lib/agent.ts` is `export {}`. Starter comments name `ToolLoopAgent` + `createAgentUIStreamResponse` + `useChat`.
- `proxy.ts` matcher is only `/admin/:path*` → `/api/admin/chat` is NOT covered by the admin cookie proxy (fact; relevant to security-model ticket, not decided here).
- ai 7.0.2 d.ts exports (fact): `ToolLoopAgent`, `createAgentUIStream`, `createAgentUIStreamResponse` (params `agent`, `uiMessages: unknown[]`, `abortSignal`, `timeout`, `experimental_sandbox`, `options`, `onStepEnd`, `consumeSseStream`, plus UIMessageStreamOptions), `InferAgentUIMessage`, `InferUITools`, `isStepCount` (alias `stepCountIs`, `ToolLoopAgent` default stop `isStepCount(20)`), `hasToolCall`, `validateUIMessages`, `convertToModelMessages`, `DefaultChatTransport`, `lastAssistantMessageIsCompleteWithToolCalls`, `isToolUIPart`, `getToolName`. `useChat({ resume })` and `resumeStream` exist in @ai-sdk/react 4.0.3.
- UI tool part states in 7.0.2: `input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error`, `output-denied`.
- Gateway 4.0.2 auth (from dist source): `AI_GATEWAY_API_KEY` env or `apiKey` option; else Vercel OIDC token via `@vercel/oidc`.

## Sources
- [S1] Local: `/node_modules/ai@7.0.2/dist/index.d.ts`, `@ai-sdk/react@4.0.3/dist/index.d.ts`, `@ai-sdk/gateway@4.0.2/dist/index.js` (observed).
- [S2] Context7 `/vercel/ai/ai_7.0.0` (docs at github.com/vercel/ai tag `ai@7.0.0`: `18-create-agent-ui-stream-response.mdx`, `03-agents/02-building-agents.mdx`, `03-agents/07-workflow-agent.mdx`, `00-ai-gateway.mdx`).
- [S3] https://ai-sdk.dev/docs/agents/workflow-agent (v7 latest docs, fetched).
- [S4] https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway (fetched).
- [S5] https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage (fetched, truncated after tool-part example).
- [S6] https://elements.ai-sdk.dev/components/tool (fetched).
- [S7] `npm view @ai-sdk/workflow`, `npm view workflow` (registry, observed 2026).

## Findings
### Versions / compatibility (fact)
- `ai` 7.0.2 + `@ai-sdk/react` 4.0.3 are a matching pair: react pkg pins `ai: 7.0.2`, provider-utils 5.0.0 [S1]. React 19.2.4 satisfies peer. Zod 3.25.76 satisfies `ai` peer `^3.25.76 || ^4.1.8` [S1]. Use `zod` 3 schemas with `tool({ inputSchema })`; no migration needed.
- `ToolLoopAgent`, `createAgentUIStreamResponse`, `InferAgentUIMessage`, `tool`, `isStepCount` (alias `stepCountIs`), `DefaultChatTransport`, `useChat` all exist in installed versions [S1][S2]. `isStepCount(20)` is the ToolLoopAgent default [S1].
- Gateway is bundled: `ai` depends on `@ai-sdk/gateway`; plain `"creator/model"` strings route through Gateway; `gateway`/`createGateway` are exported from `ai` [S4]. No provider package needed. The `@ai-sdk/gateway` import itself is not top-level resolvable under pnpm (fact) — import `gateway`/`createGateway` from `ai` only.

### Server agent + route (minimum path)
```ts
// lib/agent.ts (shopping; admin gets a separate agent/file)
import { ToolLoopAgent, tool, isStepCount, type InferAgentUIMessage } from "ai";
import { z } from "zod";
export const shoppingAgent = new ToolLoopAgent({
  model: "<creator>/<model-id>", // any Gateway string with tool-use support; value = human decision, not chosen here
  instructions: "...",
  tools: { searchProducts: tool({ description, inputSchema: z.object({...}), execute: async (input) => ... }) },
  stopWhen: isStepCount(8), // optional; default is 20
});
export type ShoppingUIMessage = InferAgentUIMessage<typeof shoppingAgent>;
```
```ts
// app/api/chat/route.ts
import { createAgentUIStreamResponse } from "ai";
export async function POST(req: Request) {
  const { messages } = await req.json();
  return createAgentUIStreamResponse({ agent: shoppingAgent, uiMessages: messages, abortSignal: req.signal });
}
```
Cited: [S2] create-agent-ui-stream-response + building-agents; signature verified in [S1] (`uiMessages: unknown[]`, `abortSignal`, `experimental_sandbox`, `onStepEnd`, `consumeSseStream`, headers/status). Starter stub comments name the same functions (observed).

### Client
```tsx
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
const { messages, sendMessage, status, stop, error } = useChat<ShoppingUIMessage>({
  transport: new DefaultChatTransport({ api: "/api/chat" }), // admin: "/api/admin/chat"
});
const handleSubmit = (m: PromptInputMessage) => { if (!m.text?.trim()) return; sendMessage({ text: m.text }); setInput(""); };
```
- Render `message.parts`; text → `<MessageResponse>`; typed tool parts are `tool-<toolName>` with states `input-streaming | input-available | approval-requested | approval-responded | output-available | output-error | output-denied`; `part.input`/`part.output` typed from the tool's `inputSchema`/return type through `InferAgentUIMessage` [S1][S2][S5].
- `PromptInputSubmit status` accepts the `useChat` `status` (inference from AI Elements prop naming; verify in `components/ai-elements/prompt-input.tsx` at implementation). Existing shell passes literal `"ready"`.
- Admin `Suggestion` has `onClick(suggestion: string)` (observed) → call `sendMessage({ text: suggestion })`.
- `useChat` default api is `/api/chat`; admin must set `api: "/api/admin/chat"` explicitly (inference from `DefaultChatTransport({api})` option present in [S1]).

### Typed tool results / generative UI (fact + inference)
- Tool `execute` return type flows to `part.output` when `useChat<InferAgentUIMessage<typeof agent>>` is used [S2]. Return a discriminated union (e.g. `{ ok: true, ... } | { ok: false, error }`) from `execute` for expected failures; thrown errors surface as `output-error` + `errorText` (states per [S1][S5]; the discriminated-union convention is a recommendation, not an SDK rule).
- Generative UI = switch on `part.type`/`part.state` and render existing `ProductCard`-style components for `output-available`; `input-streaming/available` → progress; `output-error`/ `ok:false` → explanation. No SDK component needed.
- AI Elements `Tool` (`ToolHeader/ToolContent/ToolInput/ToolOutput`, `npx ai-elements@latest add tool`) is NOT in the repo (only conversation/message/prompt-input/suggestion). It renders status badges from the same states [S6]. Needed only for the admin `bash` execution feedback if the human wants it; otherwise hand-render. Adding via CLI = install-time action, not performed.
- Never put secret-bearing values in tool outputs (they are streamed to browser) — requirement; enforced by tool design.

### Gateway auth / server-only config (fact [S4][S1])
- Auth order: `apiKey` option → `AI_GATEWAY_API_KEY` env → Vercel OIDC token (auto on Vercel deployments; locally via `vercel env pull`, expires 12h, or `vercel dev`). If an API key is present it is always used, even if invalid [S4]. `@vercel/oidc` is already a top-level dependency.
- Required config is server-side env only (no `NEXT_PUBLIC_`): either `AI_GATEWAY_API_KEY` or an OIDC token. Credential values not read/verified here.

### Workflow seam (fact [S3][S7]; decision deferred to durable-execution ticket)
- `ToolLoopAgent` is in-memory; not durable [S3]. Durable path in v7 docs is `WorkflowAgent` from `@ai-sdk/workflow` (NOT in `ai`; `DurableAgent` from `workflow/ai` is the old name, Context7 shows migration diff) [S2][S3].
- Registry: `@ai-sdk/workflow@2.0.108` peers `workflow ^5.1.0`, `zod ^3.25.76 || ^4.1.8`; `workflow@5.6.1` latest [S7]. Neither installed. `@ai-sdk/workflow`'s peer on `ai` was not checked → compatibility with `ai@7.0.2` is UNVERIFIED.
- Seam differences from the minimal path (all from [S3]): agent runs in a `'use workflow'` function with `convertToModelMessages(messages)` and `writable: getWritable<ModelCallStreamPart>()`; route does `start(chat,[messages])` and returns `createUIMessageStreamResponse({ stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()), headers: {"x-workflow-run-id": run.runId} })`; tool `execute` bodies are `'use step'` functions (default 3 retries); `stream()` has no default step limit (set `stopWhen: isStepCount(n)`); context must be serializable; sandbox is a live handle (reattach inside steps). Client reconnect uses `WorkflowChatTransport` from `@ai-sdk/workflow/client` with `GET {api}/{runId}/stream?startIndex=` route; requires `x-workflow-run-id` header. Typed tool UI messages: `InferAgentUIMessage` is defined for `ToolLoopAgent`; its use with `WorkflowAgent` is UNVERIFIED (could type `useChat<UIMessage<unknown, never, InferUITools<typeof tools>>>` from the shared tool set — inference).
- Implication: build the shells/tools/typed UI against shared `tools` objects so swapping `ToolLoopAgent` → `WorkflowAgent` changes only route + agent file. Next step is not required if the durable ticket decides to go straight to WorkflowAgent.

## Version traps (fact unless noted)
1. v7 `ai` docs/examples differ from v5/v6: `stepCountIs` is an alias of `isStepCount`; agent streaming helper `toUIMessageStream({stream: result.stream})` + `createUIMessageStreamResponse` appear in v7 docs, while many older examples use `result.toUIMessageStreamResponse()` [S2][S5]. Stick to `createAgentUIStreamResponse` for ToolLoopAgent.
2. AI Elements `Tool` doc example uses legacy `parameters:` and `toUIMessageStreamResponse()` [S6] — stale; use `inputSchema` only.
3. Banner on AI Elements site: project moving to shadcn/ui, deprecated end of Nov 2026 [S6]. Installed local components remain valid; not a blocker.
4. `WorkflowAgent` `stream()` has no default step limit vs ToolLoopAgent's 20 [S3].
5. Experimental names: `experimental_sandbox`, `experimental_transform` on agent APIs (still prefixed in 7.0.2 [S1]).
6. In `onToolCall` client handlers, check `toolCall.dynamic` first [S5] — only relevant for client-side tools (not needed; all assessment tools are server-side).
7. Gateway API key wins over OIDC even if invalid [S4].
8. `proxy.ts` matcher excludes `/api/admin/*` (observed) — flag for security ticket.

## Recommendation (minimum supported path)
1. Per agent: `ToolLoopAgent` (`ai`) with Gateway string model, zod-3 `tool({ inputSchema, execute })`, `InferAgentUIMessage` type. 2. Route: `createAgentUIStreamResponse({ agent, uiMessages: messages, abortSignal })`. 3. Client: `useChat<AgentUIMessage>({ transport: new DefaultChatTransport({ api }) })`, `sendMessage({text})`, render `parts` with existing `Message`/`MessageResponse`; typed tool parts → product components. 4. Credentials: server-side `AI_GATEWAY_API_KEY` or OIDC only. 5. Durability: layer `WorkflowAgent` per durable ticket without changing tool schemas/UI.

## Unresolved
- `@ai-sdk/workflow@2.0.108` peer range on `ai` and compatibility with `ai@7.0.2` (not checked); `WorkflowAgent` typed-UI inference.
- Whether `createAgentUIStreamResponse` internally validates `uiMessages` against tool schemas (not verified; `validateUIMessages`/`safeValidateUIMessages` exist in 7.0.2 [S1]).
- Exact `PromptInputSubmit` `status` prop type and `PromptInputMessage` shape in local component (file not read in full).
- `useChat({ resume })` non-Workflow resume semantics (server GET endpoint) not researched — Workflow ticket owns recovery.
- Model id choice (human decision); no provider survey done.
- Gateway doc page text was truncated; auth section read fully, later sections not needed.
