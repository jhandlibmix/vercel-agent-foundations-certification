# Chat stack evidence — STATUS: durable-first follow-up complete; open items under Unresolved

> **Correction (supersedes earlier minimum path):** both assessment agents MUST be durable (`WorkflowAgent`) from first implementation. The `ToolLoopAgent` + `createAgentUIStreamResponse` material below is API background only, NOT an intermediate build stage. Do not wire request abort to cancel durable work. Existing admin gate and server-side secrets remain requirements only (no separate security ticket).

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

### ToolLoopAgent route — API BACKGROUND ONLY (not a build stage)
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

### Durable seam: `@ai-sdk/workflow@2.0.108` (verified 2026 registry + tarball source; no install/scripts run)
Sources: [W1] `https://registry.npmjs.org/@ai-sdk/workflow/2.0.108` (metadata); [W2] tarball `workflow-2.0.108.tgz` read-only extract to /tmp: `package.json`, `dist/index.d.ts`, `dist/workflow-chat-transport-*.d.ts`, `src/workflow-agent.ts`, README; [W3] https://ai-sdk.dev/docs/agents/workflow-agent (fetched, v7 latest; first ~15k chars + tail read, middle truncated); [W4] `ai@7.0.2`, `ai@7.0.176`, `@ai-sdk/react@latest` registry metadata; [W5] https://github.com/vercel/ai `content/docs/04-ai-sdk-ui/03-chatbot-message-persistence.mdx` (raw, main).

**Package metadata (fact [W1][W2]):** `latest` = 2.0.108 (published 2026-11-17). Repo `vercel/ai`, `packages/workflow`. Exports `.`, `./client`, `./video`. `peerDependencies`: `workflow ^5.1.0`, `zod ^3.25.76 || ^4.1.8` (zod 3.25.76 OK). **`dependencies`: `ai` EXACT `7.0.176`**, `ajv ^8.20.0`, `@ai-sdk/provider 4.0.39`, `@ai-sdk/provider-utils 5.0.82`. `ai` is a hard dependency, not a peer.

**Compatibility with `ai@7.0.2` (fact + inference):**
- NOT compatible as a single copy: `ai@7.0.2` (deps gateway 4.0.2, provider 4.0.0, provider-utils 5.0.0 [W4]) ≠ the pinned `ai@7.0.176`. Installing `@ai-sdk/workflow@2.0.108` beside `ai@7.0.2` yields a second nested `ai` copy (inference from pnpm semantics; nothing installed). Runtime/type mismatch across copies (UIMessage, tool, stream types) is UNVERIFIED.
- Aligned set (fact from metadata [W4]): `ai@7.0.176` depends on gateway 4.0.149/provider 4.0.39/provider-utils 5.0.82; latest `@ai-sdk/react@4.0.180` pins `ai 7.0.176`, same provider-utils, peer react `^18 || ~19.0.1 || ~19.1.2 || ^19.2.1` (project react 19.2.4 OK). Recommendation: when implementing, bump `ai` → 7.0.176 and `@ai-sdk/react` → 4.0.180 together with adding `@ai-sdk/workflow@2.0.108` and `workflow@^5.1.0` (latest seen 5.6.1) so one `ai` copy exists. `ai ^7.0.2` caret already allows 7.0.176; the lockfile just needs updating. Whether `@ai-sdk/react@4.0.3` (pins ai 7.0.2) works with `WorkflowChatTransport` is UNVERIFIED — avoid by aligning.
- `ai` 7.0.176 `convertToModelMessages`, `validateUIMessages`, `createUIMessageStreamResponse`, `isStepCount`, `tool`, `UIMessage`, `InferUITools` are imported by the workflow package/docs from `ai` (fact [W2][W3]); their presence in exactly 7.0.176 was not separately diffed (metadata-level check only).
- Next.js integration of the `workflow` package (config wrapper, route/bundling constraints for `'use workflow'`/`'use step'`) NOT verified here → Workflow ticket.

**Durable API shape (fact [W3][W2]):** `new WorkflowAgent({ model, instructions, tools })`; `'use workflow'` function calls `await convertToModelMessages(uiMessages)` then `agent.stream({ messages, writable: getWritable<ModelCallStreamPart>(), stopWhen })`; route `start(chat,[messages])` → `createUIMessageStreamResponse({ stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()), headers:{'x-workflow-run-id': run.runId} })`. Tool `execute` = `'use step'` function (3 retries default). `stream()` has no default step limit — set `stopWhen: isStepCount(n)` [W3]. `WorkflowAgent` does NOT implement `Agent`, so `createAgentUIStreamResponse`/`createAgentUIStream` cannot take it [W3]. Reconnect (optional for requirements; owned by Workflow ticket): `WorkflowChatTransport` from `@ai-sdk/workflow/client` needs `x-workflow-run-id` header + GET `{api}/{runId}/stream?startIndex=` [W3].

**UI message typing (fact [W2][W3]):** `dist/index.d.ts` exports `InferWorkflowAgentTools<A>` and
`type InferWorkflowAgentUIMessage<A, META = unknown> = UIMessage<META, never, InferUITools<InferWorkflowAgentTools<A>>>`. Docs show `export type MyAgentUIMessage = InferWorkflowAgentUIMessage<typeof myAgent>`. Use this — NOT `InferAgentUIMessage` (ToolLoopAgent-only) — then `useChat<MyAgentUIMessage>({ transport })`. This resolves the earlier UNVERIFIED item. Caveat: the agent instance must be a value at module scope for `typeof`; docs construct the agent inside the `'use workflow'` function, so the Workflow ticket must decide how the typed agent/tools definition is shared with the client type import without pulling server code into the client bundle (use `import type` only; bundle behavior UNVERIFIED). No shared-tools abstraction for swapping is needed — the durable API is the only API.
- `WorkflowChatTransport<UI_MESSAGE extends UIMessage>` is generic over the UI message type [W2].

**Local component typing (observed in `components/ai-elements/prompt-input.tsx`):**
- `PromptInputMessage` (line ~484): `interface { text: string; files: FileUIPart[] }`. `PromptInput onSubmit(message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void | Promise<void>`.
- `PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & { status?: ChatStatus; onStop?: () => void }`; `ChatStatus` imported from `ai`, defined in ai 7.0.2 d.ts as `'submitted' | 'streaming' | 'ready' | 'error'` — exactly `useChat().status`. Submit shows spinner for `submitted`, square + `onStop` button for `streaming` only if `onStop` is passed; otherwise renders `type="submit"` (verified in source). Resolves earlier unverified item. Not passing `onStop` avoids exposing a stop control that implies cancelling durable work. Whether `useChat().stop()` with `WorkflowChatTransport` cancels the run: UNVERIFIED (the transport's abort handling not read).
- Submit handler: `sendMessage({ text: message.text })` (files ignored unless a requirement needs them).

**Request abort / cancellation (fact [W2][W3]):** `WorkflowAgent` accepts `abortSignal` (constructor or per `stream()` call) and `timeout`; the docs' route/workflow examples pass neither and do not forward `request.signal`. Do NOT pass `req.signal` into `start()` args (not serializable as run input) or into the agent: a closed browser request must not cancel the durable run. Explicit run cancellation (if ever required) is a Workflow ticket decision; not researched.

**Message validation at the durable boundary (fact [W5]; inference for durable placement):**
- AI SDK persistence docs: "When processing messages on the server that contain tool calls, custom metadata, or data parts, you should validate them using `validateUIMessages` before sending them to the model", passing `{ messages, tools, dataSchemas, metadataSchema }` and then `convertToModelMessages(validatedMessages)` [W5].
- The `WorkflowAgent` docs' route example does `const { messages }: { messages: UIMessage[] } = await request.json()` with a TS annotation only — no runtime validation [W3]. That is a type assertion, not validation. `createAgentUIStreamResponse` (non-durable) takes `uiMessages: unknown[]` and is the documented validating path [S1]; the workflow route has no equivalent.
- Recommendation: in the POST route, before `start()`, call `validateUIMessages({ messages: body.messages, tools })` (add `safeValidateUIMessages` for a 400 response on failure) and pass only validated, serializable messages to `start()`. Alternative: validate at the top of the `'use workflow'` function before `convertToModelMessages`; a failure there creates a failed run instead of an HTTP 400. UNVERIFIED: whether the route can import the same `tools` definition (steps with `'use step'`) outside the workflow bundle; if not, validate with schema-only tool stubs or inside the workflow. Also verify (Workflow ticket) that `UIMessage[]` args are serializable by `start()`.

**Model (documented examples, not a mandatory human decision):** `WorkflowAgent` docs use Gateway strings, e.g. `'anthropic/claude-sonnet-5.5'` ([W3] model resolution section). Recommend that documented string as the default (assumes the parent's statement that the model supports tools via Gateway; I did not query the live Gateway model list or Gateway availability). No provider survey.

## Version traps (fact unless noted)
1. v7 `ai` docs/examples differ from v5/v6: `stepCountIs` is an alias of `isStepCount`; agent streaming helper `toUIMessageStream({stream: result.stream})` + `createUIMessageStreamResponse` appear in v7 docs, while many older examples use `result.toUIMessageStreamResponse()` [S2][S5]. Stick to `createAgentUIStreamResponse` for ToolLoopAgent.
2. AI Elements `Tool` doc example uses legacy `parameters:` and `toUIMessageStreamResponse()` [S6] — stale; use `inputSchema` only.
3. Banner on AI Elements site: project moving to shadcn/ui, deprecated end of Nov 2026 [S6]. Installed local components remain valid; not a blocker.
4. `WorkflowAgent` `stream()` has no default step limit vs ToolLoopAgent's 20 [S3].
5. Experimental names: `experimental_sandbox`, `experimental_transform` on agent APIs (still prefixed in 7.0.2 [S1]).
6. In `onToolCall` client handlers, check `toolCall.dynamic` first [S5] — only relevant for client-side tools (not needed; all assessment tools are server-side).
7. Gateway API key wins over OIDC even if invalid [S4].
8. `proxy.ts` matcher excludes `/api/admin/*` (observed) — flag for security ticket.

## Recommendation (durable-first; supersedes earlier minimum path)
1. Both agents: `WorkflowAgent` (`@ai-sdk/workflow`) inside a `'use workflow'` function; tools via `tool({ inputSchema: z (zod 3), execute: <'use step' fn> })`; `stopWhen: isStepCount(n)` because `stream()` has no default limit; Gateway string model (default doc example above); `writable: getWritable<ModelCallStreamPart>()`.
2. Route (`/api/chat`, `/api/admin/chat`): validate body with `validateUIMessages`/`safeValidateUIMessages`, `start(workflow,[validated])`, return `createUIMessageStreamResponse({ stream: run.readable.pipeThrough(createModelCallToUIChunkTransform()), headers:{'x-workflow-run-id': run.runId} })`. No `request.signal` wiring.
3. Client: `useChat<InferWorkflowAgentUIMessage<typeof agent>>({ transport })` where transport is `DefaultChatTransport({api})` or `WorkflowChatTransport({api})` (reconnect needs the GET stream route; choose in Workflow ticket); submit `sendMessage({ text: message.text })`; pass `status` from `useChat` to `PromptInputSubmit`; omit `onStop`.
4. Versions: align `ai` 7.0.176 + `@ai-sdk/react` 4.0.180 + `@ai-sdk/workflow` 2.0.108 + `workflow ^5.1.0` (single `ai` copy).
5. Credentials/admin gate: existing requirements only; server-side `AI_GATEWAY_API_KEY` or OIDC; no secrets in tool outputs.

## Remaining handoff to detailed Workflow ticket
- Next.js build/config integration for `workflow` (not verified here), workflow file location and bundling of tools/`'use step'` functions.
- How the route imports tool definitions for validation and how client imports the inferred type without server code.
- Reconnect/resume choice (`WorkflowChatTransport` + GET route vs plain `DefaultChatTransport`) per the requirements' durability wording (not re-read here).
- `stop()` semantics with `WorkflowChatTransport`; explicit run cancellation (not wired to request abort).
- Admin `bash` tool/sandbox live-handle handling: docs state context must be serializable and sandbox is a live handle to reattach inside steps (from earlier [S3] read; not re-verified).
- Whether `proxy.ts` matcher covering `/admin/:path*` but not `/api/admin/*` satisfies the existing admin-gate requirement: observed fact only; check against `.wayfinder/requirements.md` (no new security ticket).

## Unresolved
- Type/runtime behavior of a duplicate `ai` copy (if `ai@7.0.2` is kept with `@ai-sdk/workflow@2.0.108`): unverified; avoided by alignment.
- Exact export parity of `ai@7.0.176` vs 7.0.2 (only metadata compared).
- `@ai-sdk/react@4.0.3` + `WorkflowChatTransport` compatibility: unverified.
- Middle of the WorkflowAgent docs page was truncated by the fetch tool (~15k chars); sections on sandbox/tool approval/runtimeContext not re-read this pass.
- Validation placement feasibility (route vs workflow) and `start()` serialization of `UIMessage[]`: unverified.
- Live Gateway availability/tool support of the documented example model: not queried.
- Gateway doc page text was truncated; auth section read fully earlier.
