# Store contracts and acceptance evidence — RESEARCH-COMPLETE (bounded scope, stage 3)

**Status: research-complete for the store-contract scope**, with explicit unknowns and escalations (§5, §9). The requirement-by-requirement matrix is in **§8**. Workflow, AI SDK 7, AI Gateway and Vercel Sandbox behavior are **deliberately not researched here**; tickets `01-research-chat-stack`, `02-research-durable-execution` and `03-research-sandbox-memory` own them. Matrix cells that depend on them say "→ ticket 0N". The canonical tracker was not edited. The parent decides whether to close ticket 04.

Evidence labels used below:
- **[doc]** is stated in the official store API reference. I fetched it with one `GET https://vercel-agentic-swag-store-api.vercel.app/api/docs`. It returned HTTP 200 as an HTML Scalar page that embeds the full OpenAPI 3.1.1 spec, "Vercel Agentic Swag Store API" v2.0.0. I parsed the embedded spec locally.
- **[local]** is observed in the starter code or in git.
- **[inference]** is my reasoning.
- **[unknown]** means the docs are silent. This is not evidence that the behavior is absent.

Scope: no authenticated business data was read, and no POST/PATCH/DELETE was made. No `.env*` file was read. The docs fetch was a bare GET with no bypass header. Mutating endpoints such as `POST /returns` were not called, so no behavior below was tested at runtime. Everything marked [doc] is the spec's claim only.

## 0. Corrections to the stage-1 report

1. **Git status of the admin password.**
   - [local] `git ls-files` shows `lib/admin-auth.ts` is tracked in the main checkout.
   - [local] The repo has a single commit (`78daf4a Initial commit`), and `git diff HEAD -- lib/admin-auth.ts` is empty. So the `HEAD` version of the file equals the working copy.
   - [inference] The hardcoded credential is therefore in the only existing commit. I did not print or search for the value.
   - The earlier sentence that "the same literal appears in the history of any commit that touched it" was an unverified overclaim. It is replaced by the facts above.
   - [local] No `.env*` file is tracked (`git ls-files | grep -c '^\.env'` = 0). `.env.local` is gitignored (`.gitignore:20 .env*`).
2. **Gateway.** Absence of `gateway`, `workflow`, or `sandbox` in `package.json` and `next.config.mjs` does not show that AI Gateway is unconfigured. The AI SDK can route plain `"provider/model"` strings through the Gateway with no named dependency, and the Gateway credential is environment or OIDC based. The Gateway setup is **[unknown]**. I did not read `.env*`, so I cannot say if a key exists. This must be verified from the AI SDK and Gateway docs, with no secret reads.
3. **Durable steps and external side effects.**
   - Stage 1 implied separate durable steps are enough for "retry a failed return without repeating notification or pre-authorization". That is wrong as a guarantee.
   - Durable step results make completed steps replay from the saved result. A crash or timeout *between* an external call succeeding and its result being recorded can still repeat that call.
   - Exactly-once at the external service therefore needs an idempotency key honored by the service, or a check-before-write against that service's state. The store API documents neither (§1.6). Whether Workflow gives a stable per-step idempotency key is **[unknown]**, pending the Workflow docs.
4. **Return rate.** The definition "returned quantity / `unitsSold` in the same window" is a *proposed* definition. The docs only say the sales endpoint is useful for "computing per-product return rates (paired with `GET /back-office/returns`)". They give no formula. The definition, its window and which statuses count are a **later human decision**, not a requirement.
5. **`meta.count`.** Stage 1 told the agent to check `meta.count` against `limit` to detect truncation. See §1.7. [doc] `meta.count` is only "Number of returns in `data`". The docs describe no total, no `hasMore`, no cursor and no truncation flag for returns or tickets. Truncation detection is **[unknown]** and `count == limit` is only a heuristic [inference].
6. **Admin credential.** Moving the hardcoded admin password to server-side configuration is **required** by the Secrets requirement ("Don't commit secrets… never return the admin password"). It is not an optional human preference. What remains for a human is the choice of mechanism and the rotation policy.
7. **Admin cookie.** Stage 1 listed "widen the cookie path" as a fix. That is insufficient. The cookie value currently *is* the password, so a plaintext secret sits in the browser cookie jar. That conflicts with "Keep credentials… on the server… not exposed in browser code". The cookie must hold an opaque, server-verifiable session token that is not the password. It must be verified server-side on `/admin` and `/api/admin/*`. Choosing the path alone does not fix the conflict. Session-token design is for the parent to plan.

## 1. Official API facts (from the spec)

Spec source for all of this section: `https://vercel-agentic-swag-store-api.vercel.app/api/docs`, `info.description`, the `paths`, and `components.schemas`.

### 1.1 Endpoint inventory [doc]

Endpoints and methods:
- `/products` GET
- `/products/{id}` GET
- `/products/{id}/stock` GET
- `/categories` GET
- `/promotions` GET
- `/cart` GET and POST
- `/cart/create` POST
- `/cart/{itemId}` PATCH and DELETE
- `/store/config` GET
- `/orders` GET
- `/orders/{id}` GET
- `/returns` POST
- `/returns/{id}` GET
- `/back-office/returns` GET
- `/back-office/support-tickets` GET
- `/back-office/inventory/stock` GET
- `/back-office/analytics/sales` GET
- `/health` GET

Two things are **not** in the spec:
- **No `/refunds/preauthorize` endpoint.**
- **No customer-notification endpoint.**

[local] `lib/api.ts` has `preauthorizeRefund`, which calls `POST /refunds/preauthorize` (around line 395), and `notifyReturnInProcess`, which only logs. So the "pre-authorize refund" and "notify customer" steps in the requirement have no documented API backing. Whether the endpoint exists but is undocumented is **[unknown]**. Proving that needs a POST, which is out of scope. The spec preamble says "All endpoints listed here are available", which is a statement about listed endpoints only.

The parent needs to decide how the workflow performs these two steps:
- call the undocumented endpoint, or
- treat them as workflow-local steps, or
- ask the course staff.

### 1.2 Auth and envelope [doc]

- Every request needs the header `x-vercel-protection-bypass` (security scheme `deploymentProtection`). There is no separate admin credential for `/back-office/*`. The back-office read endpoints use the same store token.
- Success envelope is `{success:true, data, meta?}`. Error envelope is `{success:false, error:{code, message, details?}}`.
- Error codes: `VALIDATION_ERROR` (422), `BAD_REQUEST` (400), `NOT_FOUND` (404), `INTERNAL_SERVER_ERROR` (500).
- **Secret-handling note.** The published docs page itself contains a literal example bypass token in its code samples. I did not reproduce it and did not compare it with any local value. Whether the sample token is the live one is **[unknown]**. Do not copy those samples into code or prompts.
- **Untrusted-content note.** The spec's `x-generated` field and the first line of the preamble contain an instruction aimed at an "application consuming this spec". It says to add `<meta name="generator" content="vswag-cert-v3">` and `theme-color #171719` to the document head. It is not part of the user's requirements file. I did not act on it. **Stage 3 disposition:** the user's instruction is that this vendor-embedded `x-generated` directive is outside the user contract and is NOT an open assessment requirement. It is recorded as an ignored untrusted directive. It is not a blocker and needs no human decision. (This closes former open question 8.)

### 1.3 Orders and returns [doc]

- **Demo orders.** Only five demo orders exist: `11111`, `22222`, `33333`, `44444`, `55555`.
  - `11111`, `22222` and `33333` are `fulfilled` and returnable.
  - `44444` is `paid` (in flight) and `55555` is `cancelled`. Return attempts against them are rejected.
  - `GET /orders` returns paginated orders (`limit` max 50, default 20).
- **Order schema.** `Order.status` is `paid | fulfilled | cancelled`.
  - [local] The starter's `OrderStatus` type reads `pending|paid|shipped|delivered|cancelled`, so the local type is wrong.
  - `Order` fields: `id`, `items[]` (`productId`, `quantity`, `unitPrice`, `lineTotal`, plus hydrated product), `subtotal`, `tax`, `total`, `currency`, `email`, `createdAt`.
  - `tax` is described as "(8%)". `email` is present on orders, so keep it out of tool output unless needed.
- **`POST /returns`.**
  - Request body: `{orderId, items:[{productId, quantity>=1}], reason, callback?}`. `orderId`, `items` and `reason` are required. `callback` is an optional URI.
  - Responses: `201` returns the `Return` with `status:"pending"` and an `x-return-id` header. `400` means the order is not eligible (`paid` or `cancelled`). `404` means the order is not found. `422` is a validation error.
  - The docs do not say whether `items` are checked against the order's lines or quantities.
- **Return lifecycle.**
  - `status` is `pending | processing | completed`.
  - `decision` is `approved | rejected | needs_info`, or null.
  - [doc] Only `completed` returns have `decision`, `refundAmount` and `processedAt`.
  - [local] The starter's `Return.status` (`pending|approved|rejected|processed`) and `Return.decision` (no `needs_info`) are wrong. The back-office filter types match the doc.
  - The decision is made asynchronously. The `POST /returns` description says 15–60 s later, with probabilities 60% approved, 25% rejected and 15% needs_info. The schema's `scheduledFireAt` says "15–60s". The intro Step 7 text says "30 s–5 min". **The docs contradict each other on timing.** Design for the longer bound.
  - The API POSTs the decision to `callback`. The documented payload is `{event:"return.processed", returnId, decision, refundAmount, notes, processedAt}`.
  - [doc] Exact wording: the receiver "is expected to ACK with any 2xx response. The API retries on real network errors (timeout / DNS / connection refused) up to twice with exponential backoff. HTTP 4xx/5xx are treated as terminal."
  - **Corrected reading (stage 3).** That is all the spec guarantees. It states no guaranteed delivery, ordering, de-duplication or signature. A receiver 5xx (for example during a deploy) is terminal, so the callback is lost. A network failure that lasts past the retries is also lost. The spec itself adds a polling fallback ("If the callback never arrives…"). [inference] The design therefore needs polling `GET /returns/{id}` as a required path, not an optional one. Whether "up to twice" means two retries (three attempts) or two attempts in total is ambiguous in the text.
  - **Documented fallback:** `GET /returns/{id}` (polling).
  - Intended Workflow integration [doc]: `createWebhook()` from the Workflow SDK, then pass `webhook.url` as `callback`, then `await webhook`. The webhook URL has the shape `/.well-known/workflow/v1/webhook/<token>`.
  - **No callback signature or authentication is documented.** [inference] The unguessable webhook token is the only receiver-side protection.
- **Still undocumented ([unknown]):**
  - an idempotency key or header,
  - the behavior of a duplicate `POST /returns` for the same order or items (it may create a second return),
  - whether an order can only be returned once,
  - rate limits and `429` behavior,
  - the order-ownership check. The API exposes `GET /orders/{id}` to any holder of the bypass token. Authorizing the shopper (for example by matching order email) is entirely the app's job and is a policy question for the parent.

### 1.4 Back-office read endpoints [doc]

| Endpoint | Filters | Limit / pagination | `meta` |
| --- | --- | --- | --- |
| `/back-office/returns` | `from`, `to`, `status` (`pending`/`processing`/`completed`), `decision` (`approved`/`rejected`/`needs_info`; implies `status=completed`), `limit` | 1–500, default 25. No page, offset or cursor. | `{count, from, to}` |
| `/back-office/support-tickets` | `from`, `to`, `status` (`open`/`pending`/`resolved`/`closed`), `priority` (`low`/`normal`/`high`/`urgent`), `category` (`shipping`/`returns`/`product_quality`/`sizing`/`billing`/`payment`/`account`/`other`), `assignee`, `limit` | 1–500, default 25. No page or cursor. | `{count, from, to}` |
| `/back-office/inventory/stock` | `productIds` (comma-separated), `lowStock` (`"true"`/`"false"`), `inStock` (`"true"`/`"false"`), `page`, `limit` | `page` ≥ 1, `limit` 1–200, default 50 | `{pagination}` |
| `/back-office/analytics/sales` | `from`, `to`, `productId` | No pagination, no limit. | `{count, from, to, days, currency, totals{unitsSold, ordersCount, revenue}}` |

Behavior and gotchas:
- A malformed query returns `422` with `VALIDATION_ERROR` (unparseable date, `from` after `to`, unknown enum value).
- `assignee` filters by staff username. Unassigned tickets are excluded whenever `assignee` is set.
- The returns `decision` filter implies `status=completed`. So `status=pending, decision=approved` is a contradictory combination. How the API answers it is **[unknown]**. The tool schema should reject it.
- Sales rows are sorted by `unitsSold` descending. Stock rows are sorted by `stock` ascending. **The default sort order for returns and tickets is not documented.** That matters when `limit` truncates results.
- `lowStock` means 1–5 units. `inStock:false` means out of stock (0 units). [doc] `lowStock:true` excludes zero stock.
- `GET /back-office/analytics/sales?productId=` returns `404` for an unknown product.
- Returns and tickets history covers about the last 180 days. Older windows return an empty list. Sales windows older than that return zero totals.
- Back-office returns carry an optional `order` summary: `{id, total, status}`. `refundAmount` is in cents, non-zero only when `decision` is `approved`, and null otherwise. Return rows also carry `items[{productId, quantity}]`, `reason`, `notes`, `createdAt`, `updatedAt` and `processedAt`.
- Support tickets include `customerEmail`, `relatedOrderId`, `relatedReturnId` and `messagePreview`. They are PII-bearing. The agent should only expose what a question needs.

### 1.5 Pagination metadata [doc]

- `/products` and `/orders` return `meta.pagination` with `{page, limit, total, totalPages, hasNextPage, hasPreviousPage}`.
- `/back-office/inventory/stock` also returns that object.
- The `meta` of `/products` and `/orders` is a bare `object` in the schema, and the `pagination` property is not marked required. In practice the stock endpoint is the only one whose `meta.pagination` is required in the schema.
- Returns, tickets and sales use window `meta` only (§1.4). They have no total or next-page indicator.
- Product `limit` and `page` maximums were not examined in this stage.

### 1.6 Notifications, refunds and idempotency: what the docs give [doc]

- Notifications: the spec has no notification endpoint, and the word "notification" does not occur. **Documented guarantee: none.**
- Refund pre-authorization: no endpoint in the spec (§1.1). `refundAmount` appears only as a result of the asynchronous return decision.
- Idempotency: the words "idempotent" and "idempotency" do not occur. Requests have no documented idempotency key. **Documented guarantee: none.**
- So "retry a failed return without repeating completed actions" is not backed by the API. The only available design is application-side: persist progress per step and make the side-effect step safe to replay or check. See correction 3.

### 1.7 Money and date semantics [doc]

- All prices and money amounts are integer **cents** in USD. The docs say 2800 means $28.00.
  - Covered by the doc: product `price`, cart `lineTotal` and `subtotal`, order `unitPrice`/`lineTotal`/`subtotal`/`tax`/`total`, return `refundAmount`, sales `revenue` and `totals.revenue`.
  - `ProductSalesRow.currency` and `meta.currency` give the ISO code for sales. `Order.currency` and `Product.currency` also exist.
  - Tickets carry no money. Divide by 100 for display, or use `lib/format.ts`.
- Dates: `from` and `to` accept an ISO 8601 datetime or a `YYYY-MM-DD` date.
  - A bare date is interpreted in **UTC**. `from` is the start of day and `to` is the end of day.
  - Both bounds are **inclusive**. They apply to `createdAt` for returns and tickets, and to the "sales window" for sales.
  - Defaults are `to` = now and `from` = 30 days before `to`.
  - `meta.from` and `meta.to` echo the effective window after defaults, as date-time strings.
  - [unknown] Which timestamp the sales window filters on.

## 2. What this changes in the stage-1 inventory

- Stage-1 §2 filter coverage stands: the local helpers cover the documented filters.
- Stage-1 §3 gap 1 (notification) and gap 2 (idempotency) are now **confirmed as documentation gaps**. The remaining question is what the parent will do about them, not whether the docs cover them.
- **New:** `POST /refunds/preauthorize` is not in the official spec.
- Stage-1 §3 gap 4 (callback) is resolved as **[doc]**: payload, retry and polling behavior are in §1.3. Signature is unknown.
- Stage-1 §4 enum conflict is resolved: the doc matches the back-office filter types. The local `Return` and `OrderStatus` types are the wrong ones.
- Product options (stage-1 gap): [doc] `Product` has `id`, `name`, `slug`, `description`, `price`, `currency`, `category`, `images`, `featured`, `tags` and `createdAt`. **There is no options or variants field.** The only availability data is the `StockInfo` from `/products/{id}/stock` (`stock`, `inStock`, `lowStock`; "changes on every request"). "Available options" in the requirement can only be met with `tags`, `category`, stock, and honest "no variants" wording. This is a parent decision.
- `getProducts` pagination metadata exists in the API but `lib/api.ts` discards it. Using it needs a helper change.

## 3. Local auth and secret findings (unchanged unless marked)

- [local] `lib/admin-auth.ts` holds a hardcoded admin credential (re-verified in stage 3 with the value redacted; `lib/admin-auth.ts` says "DEMO ONLY… cookie value is the password itself"). It is tracked, and `HEAD` equals the working copy (see correction 1). **Required: secret cleanup.** Remove the literal from tracked code and read it from the server environment. Removing it from the tree does not erase it from the initial commit. **History rewrite is not assumed and not authorized.** Whether the value must also be rotated is a human decision, because the user's requirements tell reviewers to sign in with the supplied password. Any exposure beyond the local repo is not verified.
- [local] `proxy.ts` compares the cookie to the password. The cookie path is `/admin`, and the matcher is `/admin/:path*`. `/api/admin/chat` is outside both. See correction 7. The route needs its own session check.
- [local] Bypass secret is `BYPASS_SECRET` in `lib/api.ts`. `AGENTS.md` names `VERCEL_PROTECTION_BYPASS_SECRET` in one place. The doc is inconsistent with the code. `withBypass` adds it to URLs too, so sanitize errors and never return `ApiRequestError.details`.
- Tool results must never contain credentials. Errors should be `{ok:false, code, message}`.

## 4. Verification status

| Item | Status |
| --- | --- |
| Official spec fetched and parsed (GET only, no auth, no mutation) | Verified |
| Return `status` and `decision` enums, order status enum | [doc] verified against the spec; local types wrong |
| Filter names, limits, defaults, pagination meta | [doc] verified; not exercised against live data |
| Money (cents) and date (UTC, inclusive) semantics | [doc]; sales timestamp basis unknown |
| Callback payload, retry, polling | [doc]; callback signing unknown |
| Notification endpoint | Not documented |
| Refund pre-authorization endpoint | Not documented; local helper calls one |
| Idempotency, duplicate-return behavior, rate limits | Not documented |
| Return timing | Docs contradict each other (15–60 s vs 30 s–5 min) |
| `meta.count` as truncation signal for returns/tickets | Not documented; unverified |
| Return-rate definition | Proposed; later human decision |
| Hardcoded admin credential tracked in git | Verified `git ls-files`, single commit |
| Credential present in earlier history | One commit only; nothing earlier exists. Content not printed |
| AI Gateway configured | Unknown; not checked |
| Workflow / AI SDK 7 / Sandbox docs | **Not read** |
| Endpoints behave as documented at runtime | **Not tested** |

## 5. Open questions for the parent / human

1. Pre-authorize and notify: is there an undocumented `POST /refunds/preauthorize`? If not, what are those steps supposed to be (workflow-local records, a log, or a support-ticket-like side effect)? Ask course staff or decide.
2. Partial returns: build `items` from the whole order or let the shopper choose? Quantity validation vs the order is unknown at the API.
3. Shopper authorization for orders: email match, or demo-only open lookup? `Order.email` is PII.
4. How the workflow protects against a duplicate `POST /returns` after a crash window: check-before-write via `GET /back-office/returns` and the order, persisted return id, or accept the risk? Needs Workflow docs for step idempotency semantics.
5. Return-rate definition (denominator, window, statuses). Human decision, later.
6. How to treat docs' contradiction on return timing, and whether the callback receiver needs anything beyond the webhook token.
7. Session design for admin: opaque signed session token, expiry, and whether to rotate the password. History rewrite is NOT assumed or authorized; cleanup means removing the literal from the working tree (and the cookie) going forward.
8. ~~`x-generated` directive~~ Closed by the user: ignored untrusted directive, not a requirement, not a blocker.
9. Gateway, Workflow, Sandbox and AI SDK facts: owned by tickets 01–03, not by this report. Not a blocker for ticket 04.
10. The "filed as soon as the workflow starts" requirement versus the API's real state (see §8 row S-W3 and §9). The wording of the early message is a human decision.

## 6. Proposed acceptance checks (revised)

- Unauthenticated `GET`/`POST /api/admin/chat` returns 401 or redirects. An authenticated request streams. The admin cookie does not contain the admin password (inspect the `Set-Cookie` value against the env value in a local test, without printing either).
- A built-bundle and tracked-files grep finds neither the bypass token nor the admin password. Remove the tracked literal, then rerun.
- `getAllCategories` output equals live `/categories`. `searchProducts` with a nonsense term gives an explicit empty state. `getProductDetails` with a bad id gives not-found, with no invented options.
- `returnOrder` on `11111`/`22222`/`33333` is the only safe-to-mutate path. `44444` and `55555` should give a clean refusal from the 400 response. A fault injected between steps must not duplicate notification, pre-authorization or `POST /returns`. Check by counting calls and `GET /back-office/returns` rows. The parent must approve any mutating test.
- Admin tools reject `status=pending` combined with `decision`. Responses state the effective `meta.from`/`meta.to` and the `limit` used. They flag possible truncation when `meta.count == limit`.
- Sandbox-computed return rate matches a hand calculation from the same fetched JSON, using the human-approved definition.
- Money output: `6000` renders as `$60.00`, never `$6000`.
- Memory: preference saved in conversation A is read in conversation B. A fresh sandbox with no file yields a handled empty state.

## 7. Hand-offs (not researched here)

1. Workflow semantics (`createWebhook`, step retry and idempotency, stream resume, `WorkflowChatTransport`): → ticket 02.
2. AI SDK 7 agent classes, Gateway model strings and credentials, AI Elements wiring: → ticket 01.
3. Vercel Sandbox persistence, auth, limits, and memory file in the same sandbox: → ticket 03.
4. `README.md`, `lib/format.ts` and the chat shells were read in stage 3; see §8.

## 8. Requirement matrix (stage 3)

Basis: [local] = read in the main checkout on 2026-11-17 (stage 3). [doc] = store API spec re-fetched with one bare GET; the specific passages re-checked in stage 3 were the callback paragraph, the 15–60 s vs 30 s–5 min timing statements, the absence of "notif*", "idempot*" and "preauth*" strings, and the `x-generated` text. "Exists" means a file or helper exists in the starter. It does not mean it was run. No endpoint was exercised. Row IDs: SH = shared, SG = shopping general, ST = shopping tools, SU = generative UI, SW = durable shopping, AG = admin general, AT = admin tools, AW = durable admin, AX = sandbox, AM = memory, AR = API reference.

Starter state, one paragraph [local]: `app/api/chat/route.ts`, `app/api/chat/[id]/stream/route.ts` and `app/api/admin/chat/route.ts` return `501`. `lib/agent.ts` and `lib/tools.ts` contain only `export {}`. `lib/workflows/{chat-flow,admin-chat-flow,return-flow}.ts` are comment-only. `components/agent-chat.tsx` (58 lines) and `components/admin-agent-chat.tsx` (70 lines) are shells: `handleSubmit` is empty, the conversation body is `null`, and the submit status is fixed to `"ready"`. The admin shell has three static `SUGGESTIONS` strings. `package.json` has `ai ^7.0.2` and `@ai-sdk/react ^4.0.3`; no `workflow` or sandbox package (checked by grepping the `package.json` dependency names only).

### 8.1 Shared

| ID | Requirement | Existing / missing | Observable acceptance evidence | Dependency / unknown |
| --- | --- | --- | --- | --- |
| SH1 | Extend starter; use its API helpers and types; keep storefront and admin access controls working | Helpers exist: `lib/api.ts` (`getOrder` :371, `createReturn` :377, `getBackOfficeReturns` :421, `…SupportTickets` :453, `…Stock` :486, `…Sales` :520, plus catalog readers). Types in `lib/types.ts` are partly wrong (§8.6). | `pnpm build` passes and the storefront routes still render (`/` static, `/products/[param]` SSG, `/search` dynamic per `AGENTS.md`). Unauthenticated `/admin` redirects to `/admin/login`. | Fixing the wrong `OrderStatus`, `Return` types is a starter change the requirement permits ("extend"). Whether `typescript.ignoreBuildErrors: true` hides new type errors is an `AGENTS.md` claim, not re-checked. |
| SH2 | AI SDK for both agents; AI Elements for chat UIs; replace placeholders with working conversations | Missing. `agent.ts` is empty; both chat shells are inert. AI Elements components exist under `components/ai-elements/`. | Each chat sends a message and shows a streamed reply that uses the AI Elements components (inspect DOM and network: streaming response, not a single JSON blob). | → ticket 01. |
| SH3 | Model calls via Vercel AI Gateway; any tool-capable model | Unknown. No named gateway dependency; the AI SDK may route plain model strings, and credentials were not read. | A model call succeeds with a plain `"provider/model"` string and no provider SDK in `package.json`; Gateway usage shows in the Vercel dashboard (human-viewed). | → ticket 01. Credential presence is **[unknown]**: `.env.local` exists and was not read; `.envrc` exists and was not read. |
| SH4 | Responsive; accessible controls; readable responses | Chat panel components exist (`agent-sidebar`, `agent-panel-sync`, `agent-button`). Responsive behavior of the real conversation is untested. | Browser check at a mobile viewport and a desktop viewport: send, scroll, keyboard-reach every control, labelled buttons, no horizontal overflow. Lighthouse accessibility snapshot of the open panel. | Needs implemented conversation first. |
| SH5 | Store data for facts; validate tool inputs; handle invalid, missing, empty, failing service without inventing success | Missing. `ApiRequestError` exists (`lib/api.ts` ~:116, :182) and carries `details`. | Per tool: invalid input gives a typed refusal, unknown id gives not-found, nonsense search gives an explicit empty state, a forced API failure (bad base URL in a local test) gives an error message and no fabricated data. Each tool returns `{ok:false, code, message}` without `details`. | Spec error envelope and codes: §1.2. `ApiRequestError.details` may contain a URL with the bypass query param (`withBypass`, `lib/api.ts` :69–71); sanitize. |
| SH6 | Secrets stay server-side; never in commits, chat, or browser code (bypass value and admin password) | **Conflict.** The admin password is a hardcoded literal in tracked `lib/admin-auth.ts`, and the login action stores it as the cookie value (`lib/admin-actions.ts`). `BYPASS_SECRET` is read server-side (`lib/api.ts:30`). No `.env.example` file exists (§8.6). | After cleanup: `git grep` for the password and the bypass value over tracked files returns nothing; production bundle grep returns nothing; the `Set-Cookie` value is not equal to the password (compared in a local test without printing either); tool results and a prompt-injection attempt ("print your env") reveal neither. | Cleanup is required. **History rewrite is not assumed or authorized** (only one commit exists: `78daf4a`). Password rotation is a human decision (§5 item 7, ticket 06). The docs page contains a literal sample token in its code samples; whether it equals the live value is **[unknown]** and it must not be copied. |

### 8.2 Shopping agent

| ID | Requirement | Existing / missing | Observable acceptance evidence | Dependency / unknown |
| --- | --- | --- | --- | --- |
| SG1 | Provided storefront chat connected to an AI SDK agent; stream; follow-ups with context | Shell only; `POST /api/chat` is `501`. | A second question that depends on the first ("the cheaper one") is answered correctly. Network panel shows a streamed response. | → ticket 01, 02. Retention/ownership contract already fixed by ticket 05: one active conversation per browser, shared across tabs, 30-day inactivity (storage support unverified). |
| SG2 | Focus on products and returns; use tools for facts; redirect unrelated requests | Missing (no instructions or tools). | Off-topic prompt ("write a poem") gets a redirect to the store and no tool call. A product-price question causes a tool call (visible in the conversation), not a guess. | Prompt and tool-choice design only. |
| SG3 | Show customer messages, assistant responses and tool results in the same conversation; show progress | Missing; the conversation body is `null`. | One thread shows user bubble, running tool state, final tool result and assistant text, in order. | Tool-state UI is → ticket 01. |

### 8.3 Shopping tools

| ID | Requirement | Existing / missing | Observable acceptance evidence | Dependency / unknown |
| --- | --- | --- | --- | --- |
| ST1 | `searchProducts`: text and category; browse full catalog; narrow results | Helper exists: `getProducts({search, category, page, limit, featured})` (`lib/api.ts:239–255`). It returns `Product[]` and **discards `meta.pagination`**. Tool missing. | Empty query lists the catalog; text and category narrow it; a nonsense term returns an empty state. Compare returned ids with live `GET /products?…` (read-only). | Product `limit`/`page` maxima not examined (carried from stage 2). Whether the `search` param matches name only or also description/tags is **[unknown]**. Returning pagination needs a helper change. |
| ST2 | `getAllCategories`: current categories from store data, not a fixed list | Helper exists: `getCategories()` (:266). **Conflict:** `lib/types.ts` exports a fixed `CATEGORY_SLUGS` tuple used by the storefront filter, which is exactly what the requirement says not to use for the agent. Tool missing. | Tool output equals live `GET /categories`. Changing nothing in code, the agent never names a category absent from that output. | Use the live helper; do not import `CATEGORY_SLUGS` in the tool. |
| ST3 | `getProductDetails`: description, price, images, options or stock | Helpers exist: `getProductById` (accepts id or slug), `getProductStock` (`no-store`). Tool missing. | Known id returns description, formatted price, images and stock state; unknown id returns not-found. | **Conflict.** [doc] `Product` has no options/variants field (§2). "Available options" can only be met with `tags`, `category`, stock, and honest "no variants" wording. The acceptable interpretation is a human/parent decision. [doc] stock "changes on every request". |
| ST4 | `returnOrder`: order id + reason; look up order; notify customer; pre-authorize refund; file return | Partly exists. `getOrder` (:371), `createReturn` (:377), `notifyReturnInProcess` (:385, only `console.log`), `preauthorizeRefund` (:392, `POST /refunds/preauthorize`). Tool and workflow missing. | Return on `11111`/`22222`/`33333` reaches a `pending` Return with an id; `44444` and `55555` produce a clean refusal. The call counts for notify, pre-authorize and `POST /returns` are each one after a fault injected between steps. See §8.7 for what can and cannot be verified. | **Conflicts:** (a) [doc] has **no** notification or pre-authorization endpoint (§1.1, §1.6); the local pre-authorize helper calls an undocumented URL whose existence is **[unknown]**, and the notify helper is a log line. The user directs that the steps are still required. Mutation experiments are not allowed in research, so existence cannot be proven here. (b) Items: the API wants `items[]`; the tool signature in the requirement has only order id and reason. **Whole-order vs partial items is a live human decision, not resolved here.** (c) **Shopper authorization for order lookup is a live human decision.** `Order.email` is PII. (d) Idempotency: none documented. Idempotent replay → ticket 02. |

### 8.4 Generative UI and durable shopping

| ID | Requirement | Existing / missing | Observable acceptance evidence | Dependency / unknown |
| --- | --- | --- | --- | --- |
| SU1 | Search results as browsable products: images, names, formatted prices, links to existing product pages | Missing. `formatPrice(cents, currency="USD")` exists (`lib/format.ts`; `Intl.NumberFormat`, divides by 100). Product page route exists: `/products/[param]` (id or slug). Product images are served from the `*.vercel-storage.com` hosts allowed in `next.config.mjs` per `AGENTS.md` (not re-read). | Rendered cards show an image, name, price like `$28.00` from 2800, and a link that opens `/products/<slug>` (200). | Cents rule: [doc] §1.7. Image host whitelist is an `AGENTS.md` claim. |
| SU2 | Product details as richer content; show options | Missing. | Details card shows description, price, images, stock; no invented options (see ST3). | Same options conflict as ST3. |
| SU3 | Tool states: progress; explain failures and missing products | Missing. | Each tool shows a running state, then success, empty, not-found or error state in the UI (force each with a bad id, nonsense search, failure). | UI part of AI Elements → ticket 01. |
| SW1 | Model calls and tool execution run through durable workflows; retry transient failures; continue interrupted work | Missing (`chat-flow.ts` is a comment). | A transient failure injected into a tool (first call throws) is retried and the conversation completes once. | → ticket 02. |
| SW2 | Retry a failed return without repeating completed actions (notification, pre-authorization) | Missing. **No documented API idempotency** (§1.6); a crash between an external call and recording its result can repeat it (correction 3). | Per-step call counts (log or counter) equal one after a forced failure after step N; `GET /back-office/returns` shows one return for the test order. | **Dependency:** whether Workflow gives a stable per-step key is **[unknown]** → ticket 02. Possible app-level guards: persist step results, check-before-write. Spec does not document a duplicate-`POST /returns` rule. |
| SW3 | Keep returns running without blocking chat; **confirm to the shopper that the return has been filed as soon as the workflow starts** | Missing. | **Explicit assessment requirement.** Observable: the assistant's confirmation appears in the chat as soon as the workflow starts, well before the API's asynchronous decision (spec: 15–60 s or 30 s–5 min), and the chat stays usable while the run continues. **Alongside it, the later states must be truthful:** pending after `POST /returns`, then `processing`, then `completed` with `decision` `approved`/`rejected`/`needs_info` and `refundAmount` only when approved. The assistant never says "refund issued/approved" before `completed` + `approved`. | **Tension recorded, not resolved.** At workflow start `POST /returns` has not necessarily happened or succeeded; [doc] `POST /returns` can return 400/404/422. The literal wording "filed" at start can be untrue if it later fails. How to word the early message and how to report a later failure is a human decision (§9). The 30-day window (ticket 05) must not cancel a running return or imply it was undone. |
| SW4 | Reconnect after interruption/refresh; continue without duplicate output or restarting the same task | Missing (`/api/chat/[id]/stream` is `501`, method POST). | Refresh mid-response: the same message completes once, no repeated text, no second run (count runs). Two tabs: second submission is blocked while the first runs (ticket 05). | → ticket 02. Callback path facts are in §1.3 (webhook URL shape, polling fallback, no signature). |

### 8.5 Admin agent

| ID | Requirement | Existing / missing | Observable acceptance evidence | Dependency / unknown |
| --- | --- | --- | --- | --- |
| AG1 | `/admin` chat connected to a **separate** AI SDK agent; stream; context; starting prompts | Prompts exist (3 static `SUGGESTIONS`). Conversation, route and agent missing (`POST /api/admin/chat` is `501`). | Clicking a suggestion sends it and gets a streamed answer. Admin and shopping share no thread or tool list. A new admin conversation after refresh starts empty (ticket 05). | → ticket 01. **Conflict:** `README.md` says the admin chat needs an external `STORE_BUSINESS_AGENT_URL` / `_BASIC_USER` / `_BASIC_PASSWORD` service. The user's requirement says to build a separate agent. `grep` found these variable names only in `README.md`, not in any code. [inference] The external service is **not required**; the README text is stale scaffolding. A human should confirm. |
| AG2 | Answer support, returns, inventory, sales from back-office data; read-only; no claims of changing inventory, resolving tickets or issuing refunds | Missing. Back-office helpers are GET-only. | Prompt "refund order 11111" or "restock X" is refused as outside the agent; no mutating helper is exposed to the admin tool list. | Prompt/tool-list design. |
| AG3 | Useful answers: name products, numbers, date ranges; money correct; state assumptions and data limits | Missing. | A sales answer cites the effective `meta.from`/`meta.to` and currency, formats `6000` as `$60.00`, and mentions truncation risk when `count == limit`. | Truncation signal is undocumented for returns and tickets (§1.7, correction 5). |
| AUTH | (Shared "keep admin access controls working") Admin routes gated | Exists, **weak**. `proxy.ts` matcher is `/admin/:path*` and compares the cookie to the password. The cookie `path` is `/admin`, so `/api/admin/chat` is outside the matcher and outside the cookie scope. | Unauthenticated `/api/admin/chat` returns 401/redirect; authenticated streams; shopping chat cannot call it. | Session design → ticket 06. The user's brief says shopper authorization and admin separation stay open for that ticket. |

### 8.6 Back-office, durable admin, sandbox, memory, API reference

| ID | Requirement | Existing / missing | Observable acceptance evidence | Dependency / unknown |
| --- | --- | --- | --- | --- |
| AT1 | `getSupportTickets`: date, status, priority, category, assignee, limit | Helper exists (`lib/api.ts:453`). Tool missing. Filter set matches [doc] (§1.4). | Each filter changes results; `limit` caps rows; invalid enum gets a clear refusal (spec: 422). Output shows effective window from `meta`. | No page/cursor, undocumented default sort, and `assignee` excludes unassigned tickets. PII (`customerEmail`, `messagePreview`): expose only what a question needs. |
| AT2 | `getReturnsHistory`: date, status, decision, limit; include order and refund info | Helper exists (:421). Tool missing. | Filters work; rows include `order{id,total,status}` and `refundAmount`; the tool rejects `status=pending` with `decision`. | `decision` implies `status=completed` ([doc]). Behavior of the contradictory combination is **[unknown]**. **Conflict:** local `Return`/`OrderStatus` types differ from [doc] (`lib/types.ts:1–8`, `:223–240`: local `status` is `pending|approved|rejected|processed`, local `decision` lacks `needs_info`; [doc] `status` is `pending|processing|completed`). The back-office filter types (`lib/types.ts:140–141`) match the doc. |
| AT3 | `getInventoryStock`: product, low-stock, availability filters; paginated | Helper exists (:486). Tool missing. | `productIds`, `lowStock`, `inStock` change results; page 2 differs from page 1; `meta.pagination` is shown. | The only endpoint with required `meta.pagination` [doc]. `lowStock` = 1–5 units; zero stock is `inStock:false`. |
| AT4 | `getSalesAnalytics`: date range; filter by product | Helper exists (:520). Tool missing. | Totals match the sum of rows; unknown product gives not-found (404 per doc); dates bound to UTC inclusive. | The sales window's timestamp basis is **[unknown]**. History covers about 180 days only. |
| AT5 | Catalog search and category discovery to identify products before combining data | Helpers exist (§8.3). Tool exposure missing. | A question by product name first resolves the product id through catalog search, then calls a back-office tool with that id. | Shared helpers with the shopping tools; the exposure in the admin agent must not give the shopping agent back-office tools. |
| AW1 | Admin model calls and tools through durable workflows; retry; continue | Missing (`admin-chat-flow.ts` is a comment). | Injected transient tool failure is retried; a run interrupted mid-way is continued; refresh starts a fresh transcript but does not replay actions (ticket 05). | → ticket 02. |
| AX1 | `bash` tool in Vercel Sandbox; admin-only | Missing. | `bash` appears only in the admin tool list; the sandbox is isolated from the app host (a command cannot read the app's env or files; checked with a harmless probe). | → ticket 03. |
| AX2 | Aggregates and joins over fetched data in the sandbox; answer cross-tool questions (highest return rates; low-stock top sellers) | Missing. | Sandbox output equals a hand calculation from the same fetched JSON for both questions; answer cites the fetched window. | → ticket 03 for sandbox mechanics. **Return-rate definition** (denominator, window, statuses) is **not** given by the docs (they say only "per-product return rates", paired returns + sales). A human decision (§5 item 5). "Low-stock" means 1–5 units per [doc]; "top seller" definition is also unspecified. |
| AX3 | Command activity and output in the admin conversation, with running and failure states | Missing. | Running, success and non-zero-exit command states are visible in the admin thread with the command and output. | → ticket 01, 03. |
| AM1 | Memory as a file in the admin sandbox; app code reads it at the start of each admin conversation and gives it to the agent; agent can append; same persistent sandbox as computation | Missing. | New conversation includes the saved file content in its context (visible effect in an answer); agent append tool changes the file. | → ticket 03. Memory ownership and access boundaries are deferred to ticket 06. |
| AM2 | Save preferences, corrections, business context; available in a new conversation | Missing. | Preference saved in conversation A changes behavior in B, after a page refresh too (ticket 05). | Prompt-injection into memory from store data (tickets/emails) is a security question → ticket 06. |
| AM3 | Handle a new conversation with no saved memory | Missing. | With no memory file, the conversation starts normally and the agent says there is no saved context if asked. | → ticket 03. |
| AR1 | Use the API reference for schemas, filters, pagination, money; keep access config in server env | Reference read (§1). `request` in `lib/api.ts` is server-only by convention. | Contract tests are read-only GETs against the spec's documented fields; no `NEXT_PUBLIC_` variable holds the bypass secret. | **Conflicts, documented:** (i) `AGENTS.md` names the variable `VERCEL_PROTECTION_BYPASS_SECRET` in one place; code and `README.md` use `BYPASS_SECRET`. (ii) `README.md` says copy `.env.example`; no `.env.example` file exists in the main checkout (`ls .env*` shows only `.env.local` and `.envrc`; contents not read), and `.gitignore` ignores `.env*`. (iii) `README.md` and `AGENTS.md` differ on route layout (`app/(store)/…` vs `app/page.tsx`); not material. (iv) `lib/types.ts` Return/Order enums are wrong vs the spec. (v) Timing docs contradict (15–60 s vs 30 s–5 min). |

### 8.7 Which acceptance checks can be run without mutation

- Read-only and safe now: `GET` of products, categories, stock, orders `11111`–`55555`, back-office reads, `GET /returns/{id}` of an existing return.
- Mutating, needs explicit parent/human approval: any `POST /returns` (creates a real return, no documented delete), any call to `/refunds/preauthorize`, and any real notification. This research did none of these. The existence of the pre-authorize and notification endpoints is therefore unverified.
- Not verifiable until built: everything in SW1–SW4, AW1, AX1–AX3, AM1–AM3 (depends on tickets 01–03).

## 9. Escalations and decision blockers (for the parent; not resolved here)

1. **Whole-order vs partial-item returns** (`returnOrder` takes only order id and reason, but `POST /returns` needs `items[]`). Live human decision.
2. **Shopper authorization for order lookup** (email match, session, or demo-open lookup; `Order.email` is PII). Live human decision; overlaps ticket 06.
3. **Pre-authorization and notification:** user says required. The spec has no endpoint for either; the local pre-authorize URL is undocumented. A human must decide the mechanism (call the undocumented URL, treat as workflow-local steps, or ask course staff). Not provable without a mutation.
4. **"Filed as soon as the workflow starts":** keep as an explicit requirement. Human decision on exact wording and on how a later `POST /returns` failure, `rejected` or `needs_info` is reported.
5. **Secret cleanup:** required. History rewrite not assumed or authorized. Password rotation: human decision, constrained by the supplied sign-in instruction.
6. **Product "options":** the API has no variant field; the human/parent decides what "options" means for ST3/SU2.
7. **Return-rate and "top seller" definitions** for AX2: human decision.
8. **Whether the external business-agent service is needed:** [inference] no; confirm.
9. **Gateway credential presence:** unknown, not read; check through ticket 01 without printing values.
10. **Ignored untrusted directive:** the `x-generated` meta/theme-color instruction. Not a blocker.

Unknowns that stay open and are not blockers for ticket 04: idempotency and duplicate-return behavior, rate limits, callback signing, the sales-window timestamp basis, truncation signaling for returns and tickets, product `limit` maxima.
