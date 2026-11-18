# Ship It Shop — Vercel Agent Foundations Certification

The Vercel Ship Shop starter extended with two separate AI SDK agents:

- **Shopping agent** (storefront chat, robot icon in the header) helps customers find products, inspect items, and request returns.
- **Store admin agent** (`/admin`, password-protected) helps employees investigate support, returns, inventory, and sales. It computes results in Vercel Sandbox and keeps persistent memory.

Both agents call models through **Vercel AI Gateway** (`openai/gpt-4.1-mini`). They run as durable **Vercel Workflows** and render their conversations with **AI Elements**. They share no conversation state, endpoints, or restricted tools.

## Tech stack

- **Next.js 16** (App Router) with **React 19**, **TypeScript** (`strict`)
- **AI SDK 7** (`ai`, `@ai-sdk/react`) and **`@ai-sdk/workflow`** (`WorkflowAgent`, `WorkflowChatTransport`)
- **Workflow** (`workflow`) for durable chats and returns
- **Vercel Sandbox** (`@vercel/sandbox`) for admin computation and memory
- **AI Elements** (`components/ai-elements/`), **Tailwind CSS v4**, **shadcn/ui**, `lucide-react`
- **pnpm**

## Setup

Prerequisites: a Vercel account, a GitHub account, Node.js **22.19.0 or newer** (LTS), and [pnpm](https://pnpm.io).

1. **Deploy and clone.** Create the repository and Vercel project (for example via the assignment's Deploy button), then clone the repository locally.
2. **Link the Vercel project.**
   ```bash
   npm install --global vercel
   vercel login
   vercel link
   ```
3. **Configure environment variables.** Add `ADMIN_PASSWORD` to the Vercel project for Development, Preview, and Production (see below). Then pull the Development values:
   ```bash
   vercel env pull .env.local
   ```
   This also writes `VERCEL_OIDC_TOKEN`, which AI Gateway and Vercel Sandbox use locally. The local token expires after 12 hours; rerun `vercel env pull .env.local` to refresh it. For a checkout without a linked project, start from `cp .env.example .env.local`.
4. **Run locally.**
   ```bash
   pnpm install
   pnpm dev
   ```
   Open <http://localhost:3000> for the storefront and agent panel, and <http://localhost:3000/admin> for the admin agent.
5. **Deploy.** Push to the Vercel-connected repository. On Vercel, AI Gateway and Sandbox authenticate automatically via OIDC.

## Environment variables

All variables are server-only. Never prefix a secret with `NEXT_PUBLIC_`, commit `.env.local`, or paste values into prompts, Sandbox files, or source code.

| Variable | Required | Purpose |
| --- | --- | --- |
| `BYPASS_SECRET` | Yes | Store API access value, sent as the `x-vercel-protection-bypass` header by `lib/api.ts`. Prepopulated by the Deploy button. |
| `API_BASE_URL` | No | Store API base URL. Defaults to `https://vercel-agentic-swag-store-api.vercel.app/api`. Prepopulated by the Deploy button. |
| `ADMIN_PASSWORD` | Yes, for `/admin` | Password for the demo admin login, set to the password given in the assignment. The starter hardcoded it; it now lives server-side, so the admin login and admin API return errors until it is set. |
| `VERCEL_OIDC_TOKEN` | Local development | Written by `vercel env pull`. Authenticates AI Gateway and Vercel Sandbox locally. Provided automatically on Vercel. |
| `AI_GATEWAY_API_KEY` | Optional | AI Gateway key, used instead of OIDC when set. |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` | Optional | Sandbox access-token authentication instead of OIDC. All three are required together. |
| `NEXT_PUBLIC_SITE_URL` | No | Public site URL for metadata. Defaults to `http://localhost:3000`. Not a secret. |

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| Shopping chat with streaming and follow-ups | `components/agent-chat.tsx` → `POST /api/chat` → `lib/workflows/chat-flow.ts` (`WorkflowAgent`) |
| `searchProducts`, `getAllCategories`, `getProductDetails`, `returnOrder` | `lib/tools.ts`, schemas in `lib/shopping-schemas.ts` and `lib/return-schemas.ts` |
| Generative UI for products, details, progress, and failures | `components/shopping-tool-result.tsx` (product cards link to existing `/products/[id]` pages) |
| Durable returns without blocking the chat | `lib/workflows/return-flow.ts` runs as its own workflow; `returnOrder` confirms the filing as soon as it starts |
| Shopping chat recovery after refresh or disconnect | `hooks/use-durable-chat.ts` + `GET /api/chat/[id]/stream` |
| Separate admin agent with starting prompts | `components/admin-agent-chat.tsx` → `POST /api/admin/chat` → `lib/workflows/admin-chat-flow.ts` |
| `getSupportTickets`, `getReturnsHistory`, `getInventoryStock`, `getSalesAnalytics`, catalog context | `lib/admin-tools.ts`, schemas in `lib/admin-schemas.ts` |
| `bash` in Vercel Sandbox with execution feedback | `lib/admin-sandbox.ts` (`runAdminCommand`), rendered by `components/admin-tool-result.tsx` |
| Persistent memory in the Sandbox | `/vercel/sandbox/memory.md`: `loadAdminMemory` before each turn, `saveMemory` tool to append |
| Admin-only capabilities and access control | `proxy.ts` and `lib/admin-auth.ts` protect `/admin` and `/api/admin/*`; the public resume route refuses admin runs |
| Secrets stay server-side | Tool and stream errors are replaced with generic messages (`lib/chat-stream.ts`); no env vars are forwarded into the Sandbox |

## How it works

### Shopping agent

`chatFlow` is a `"use workflow"` function that runs a `WorkflowAgent` with the four shopping tools. Every tool body is a `"use step"`, so the workflow retries transient store failures (network, 429, 5xx) via `RetryableError`. Missing records and invalid filters come back as `{ ok: false, message }` results rather than errors, so the agent can explain them truthfully. Categories are always validated against the live `/categories` endpoint.

**Returns.** `returnOrder` first runs an eligibility lookup: the order must exist and be `fulfilled`, otherwise nothing starts. It then starts `returnFlow` as a separate workflow and immediately tells the shopper the return has been filed, without waiting for it. `returnFlow` runs four steps in order: order lookup, customer notification, refund pre-authorization, and return filing. Each completed step is recorded by the workflow, so a retried filing does not repeat the notification or pre-authorization. A hook token derived from the chat run and tool call stops a replayed tool call from starting a second return.

**Recovery.** Each chat turn is one workflow run. The client stores the transcript, a `requestId`, and the server's `runId` in `localStorage`. The `requestId` doubles as a workflow hook token, so a retried POST attaches to the existing run instead of starting new work. After a refresh, `WorkflowChatTransport` reconnects via `GET /api/chat/[id]/stream?startIndex=…` and continues from the last received chunk, without duplicating output.

### Store admin agent

`adminChatFlow` is a separate workflow with its own tools. Before every turn, application code reads the memory file from the Sandbox and injects it into the instructions as data. A missing file means "no saved context yet". A failed read fails the turn instead of silently passing on empty memory.

**Back-office tools** are read-only. Each one saves its full API response (data, metadata, and data limitations) as a JSON file in the Sandbox and returns that file's path. The agent can then compute from the actual data instead of transcribing numbers.

**Sandbox computation.** `bash` runs `bash -lc <command>` in the named persistent Sandbox `ship-shop-admin`, with a 30-second timeout and output truncated at 20,000 characters. The instructions require Node or Python for all arithmetic, aggregates, and joins, such as product return rates or low-stock top sellers. A `prepareStep` gate requires a tool call after a sales lookup until a calculation has been attempted. The UI shows the command, stdout, stderr, the exit code, and running and failure states.

**Memory.** `saveMemory` appends a note to `/vercel/sandbox/memory.md`, in the same Sandbox used for computation. Each note carries a stable step marker, so a retried save does not append twice. The agent saves preferences, corrections (which name the context they supersede), and business context, but not transient store data.

### Known limits

- Sandbox persistence follows platform defaults: sessions stop after inactivity and resume from snapshots, which expire after 30 days without use. Memory is persistent across conversations, not permanent.
- Retried chat requests reuse a run for one day after it starts, so deduplication is bounded.
- Ticket and returns history have no pagination (maximum 500 per request). Store history covers about 180 days. The agent reports these limits in its answers.
- The admin conversation is not restored after a page refresh. Saved memory carries context into new conversations instead.
- The store API has no idempotency key. If a pre-authorization or filing request reaches the store but its response is lost, the step retry can send it again.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server on http://localhost:3000 |
| `pnpm build` | Production build (keeps the starter's `ignoreBuildErrors`) |
| `pnpm exec tsc --noEmit` | Strict type check |
| `pnpm start` | Serve the production build |

`pnpm lint` is wired to `eslint .`, but ESLint is not installed, so it fails. No test framework is configured.

## Project structure

```
app/
  (store)/                 # storefront route group (layout mounts the agent sidebar)
  admin/                   # /admin chat + /admin/login (demo auth)
  api/
    chat/                  # shopping chat: POST start, GET [id]/stream resume/status
    admin/chat/            # admin chat: same, behind admin auth
lib/
  api.ts, types.ts         # starter store API client and types (server-only)
  agent.ts                 # model ID and both agents' instructions
  tools.ts                 # shopping tools
  admin-tools.ts           # admin back-office, bash, and saveMemory tools
  admin-sandbox.ts         # persistent Sandbox, memory file, command runner
  chat-stream.ts           # shared request validation, run start/resume, safe streaming
  workflows/               # chat-flow, admin-chat-flow, return-flow
hooks/use-durable-chat.ts  # useChat + WorkflowChatTransport with refresh recovery
components/
  chat-transcript.tsx                           # shared message list, busy and error states
  agent-chat.tsx, shopping-tool-result.tsx      # shopping chat UI
  admin-agent-chat.tsx, admin-tool-result.tsx   # admin chat UI
  admin-dataset-views.tsx                       # admin ticket, return, stock, and sales views
  ai-elements/                                  # AI Elements components
```

See `CLAUDE.md` for storefront caching, render modes, and starter conventions.
