# Sandbox computation and memory persistence — research (ticket 03)

Status: **COMPLETE for planning.** Every claim is read from current docs or the published `@vercel/sandbox@4.0.0` package. No live test was run, and none is needed to close research. Runtime acceptance checks are in §8. This is not a production-hardening plan.

Labels: **[D]** documented guarantee. **[T]** published 4.0.0 type declarations (`dist/*.d.ts`). **[C]** 4.0.0 compiled source (`dist/*.js`). **[L]** local project observation. **[I]** inference. **[R]** recommendation. **[REQ]** assessment requirement. **[NT]** not tested.

## 1. Sources
- S1 https://vercel.com/docs/sandbox/concepts/persistent-sandboxes (md, last_updated 2026-09-15).
- S2 https://vercel.com/docs/sandbox/concepts/authentication (md, last_updated 2026-08-25).
- S3 https://vercel.com/docs/sandbox/sdk-reference and https://vercel.com/docs/sandbox/pricing (fetched in the earlier pass; not re-read in this pass).
- S4 `https://registry.npmjs.org/@vercel/sandbox/-/sandbox-4.0.0.tgz`, read-only extraction in `/tmp/sbx4`. Files read: `package.json`, `dist/sandbox.d.ts`, `session.d.ts`, `command.d.ts`, `sandbox.js`, `session.js`, `api-client/api-client.js`.
- L: this repo's `package.json`, `pnpm-lock.yaml`, `next.config.mjs`. `.env*` files not read.
- REQ: `.wayfinder/requirements.md` (Sandbox computation, Persistent memory, Shared secrets).

## 2. Environment and compatibility
- [T] `@vercel/sandbox@4.0.0` has `engines.node >=22.19.0` and depends on `zod ^4.6.7`, `@vercel/oidc 4.0.0` and `@workflow/serde`.
- [L] The repo `package.json` has no `engines` field. There is no `.nvmrc`, `.node-version` or `.tool-versions`. `@types/node` is `^22`. The local `node -v` is v24.11.1, which satisfies >=22.19. A `.vercel/` directory exists (project is linked). Its contents were not read.
- [NT] The Node version configured in the Vercel project settings is not verified. Check that it is >=22.19. Node 22.x below 22.19 would fail the engines check. Node 24.x is fine.
- [L] The root dependency is `zod ^3.25.76` (lock resolves 3.25.76). The lockfile already contains a second `zod@4.1.11` transitive entry, so two zod majors already coexist in this install.
- [I] Nested zod 4 for the sandbox package is not assumed to conflict with the root zod 3. pnpm nests per-package dependencies. No migration is proposed. The acceptance check is `pnpm install` + `pnpm build` (§8).
- [L] The root has `@vercel/oidc ^3.7.1` and `next.config.mjs` sets `serverExternalPackages: ["@vercel/oidc"]`. The sandbox package brings its own `@vercel/oidc 4.0.0`. Import `@vercel/sandbox` only from server code. If the build complains about bundling, add `@vercel/sandbox` to `serverExternalPackages`. [NT]
- [T] Default image is `vercel/sandbox/universal:latest`: "Ubuntu-based image with Node.js 24, Bun, Python 3.14, coding agents, and common development utilities" (docs in `Sandbox.create`). So `node` and `python3` are the documented default interpreters. `jq` is not listed. [R] Write analysis commands for `node` (JSON in, JSON out) or `python3`. Do not rely on `jq`.

## 3. Auth (server-side only)
- [D S2] OIDC is recommended and the SDK uses it automatically when available. Locally, `vercel link` + `vercel env pull` writes `VERCEL_OIDC_TOKEN` to `.env.local`, which expires after 12 h. On Vercel, token expiry is managed automatically. Access-token fallback: `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` passed as `teamId`/`projectId`/`token` to the SDK.
- [C S4] In 4.0.0 the `Sandbox`/`Session` methods (`getOrCreate`, `runCommand`, `readFileToBuffer`, `writeFiles`, …) are themselves marked `"use step"`. A deserialized `Session` "lazily resolves credentials … Uses getCredentials() which resolves from OIDC or env vars" (`session.d.ts`). So the SDK is designed to run in Workflow step contexts using OIDC or env credentials.
- [NT] The Workflow docs page for OIDC availability inside steps was **not read** (tool budget). This is a runtime acceptance check, not a human decision. [R] If the token is not available in a step (e.g. local dev), fall back to the documented server-only access-token config. The three values go in server-only env, never `NEXT_PUBLIC_`, never in tool results or the sandbox.
- [R] The store-API bypass secret is never written into the sandbox. The app fetches store data and writes only data files.

## 4. Named persistent lifecycle (verified against docs + 4.0.0 source)
- [D S1] Persistence is the default for `Sandbox.create`. Identity is a user-defined `name`, unique per project, immutable. A *sandbox* is long-lived. Each run is a *session* (one VM). On stop, the filesystem is auto-snapshotted. Resume boots a new session from the last snapshot with a fresh session timeout. Max duration caps each session, not the sandbox. Only the filesystem persists, not processes.
- [T/C] `Sandbox.getOrCreate(params?)`: `params` = `CreateSandboxParams` (+ credentials) with extra `resume?: boolean` (default false) and `onCreate?(sbx)`. Create-time options include `name`, `timeout` (ms), `persistent`, `snapshotExpiration` (ms, `0` = never), `keepLastSnapshots`, `resources`, `env`, `image`/`runtime` (mutually exclusive: TypeError), `onResume`. Algorithm in compiled source:
  1. No `name` ⇒ always creates.
  2. With `name` ⇒ `Sandbox.get(params)`.
  3. On `not_found` ⇒ `Sandbox.create(params)`, then `onCreate`.
  4. On `snapshot_not_found` ⇒ delete the stale named sandbox, create a fresh one with the same name, then `onCreate`.
  5. Any other error is rethrown.
- [D S1] If the sandbox exists, create parameters are ignored; use `sandbox.update()` to change them. `get`/`getOrCreate` do not start a VM by default. The first VM-requiring call (`runCommand`, `writeFiles`, `readFile*`, …) auto-resumes. In source, `withResume` resumes if there is no session or on stopped/stopping/snapshotting errors, then retries once. `stop()` and `update()` do not auto-resume.
- [D S1] **Expiry defaults:** snapshot TTL defaults to **30 days measured from last use, reset on each use**. `snapshotExpiration: 0` is never. The sandbox itself is removed after **14 days of inactivity if it cannot resume from a snapshot** (expired or deleted snapshot, or non-persistent). Read-only getters: `sandbox.expiresAt`, `sandbox.snapshotExpiration` [T].
- [D S1] Expired snapshot: with `resume:true`, `getOrCreate` deletes and re-creates (fresh, empty). **Without** `resume:true` it returns the existing handle, and the first VM-requiring call fails with `snapshot_not_found`.
  - [I from C] `resume:true` is the path that silently recreates an empty workspace. Without it, `snapshot_not_found` surfaces as a thrown error on the first call (e.g. the memory read), because `Sandbox.get` only checks snapshots on resume.
  - [I] A stopped sandbox with a valid snapshot is not "lost" memory. A sandbox that does not exist at all (`not_found`) is indistinguishable from first use, because there is no other store. That includes a sandbox removed after >30 days idle plus 14 days of removal grace.
- [D S1] Documented cross-process example: write file → `stop()` → later `Sandbox.get({name})` → `runCommand('cat', …)` returns the file.
- [NT] Whether a session ended by *timeout* (rather than explicit `stop()`) always produces the snapshot is not stated explicitly. The docs describe snapshot-on-stop.
- [R] Same-environment requirement: the one named sandbox is the single environment for both memory file and computation. Do not use `snapshot()`/`fork()`/`create({source:{type:'snapshot'}})` clones as the workspace.
- [R] Keep the name as a code constant (e.g. `ship-shop-admin`). Not a secret. No external DB is needed. Pass only strings into workflow steps; re-acquire with `getOrCreate` inside each step that needs it. 4.0.0 also has `WORKFLOW_SERIALIZE` on `Sandbox`, but nothing relies on it.

## 5. Retention (no target invented)
- [R] Use the documented platform default (30 days since last use; sandbox removed 14 days after it cannot resume). Do not set `snapshotExpiration` unless a requirement appears. Permanent retention is not an assessment requirement. [REQ] "Keep them available in a new conversation" is met within that supported lifecycle.
- [R] Disclose in README/admin UI/final notes: memory persists in the Vercel Sandbox named environment while it is used at least every 30 days. After longer idle, memory may be lost. In the snapshot-expired-but-sandbox-present window the memory read throws `snapshot_not_found`, and the admin chat must show that failure (not "no saved memory"). After the sandbox is removed, the next conversation starts with an empty memory file. This is a limit of the platform default, not a bug.
- [R] Do **not** pass `resume: true` to `getOrCreate`, so a snapshot loss is not silently replaced by an empty memory. For the memory read, treat only a `null` result from `readFileToBuffer` as "no saved memory". Treat thrown errors as failures to display.
- [R] If the platform default is not acceptable later, `snapshotExpiration: 0` at creation is the documented one-line opt-out. It only applies at creation or via `update()`. This is optional and not part of the minimum path.

## 6. API signatures that matter (4.0.0 `.d.ts` + source)
| API | Signature / behavior | Source |
|---|---|---|
| `readFile(file, opts?)` | `file: { path: string; cwd?: string }`, `opts?: { signal }` → `Promise<NodeJS.ReadableStream \| null>` (null if not found) | T |
| `readFileToBuffer(file, opts?)` | same `file`/`opts` → `Promise<Buffer \| null>` (null if not found) | T |
| Missing-file result | API client returns `null` on HTTP 404; `readFileToBuffer` returns `null` if the stream is null. Other non-OK responses throw `APIError`. Both read APIs share the null result. | C (`api-client.js` readFile, `session.js` readFileToBuffer) |
| `writeFiles(files, opts?)` | `files: { path: string; content: string \| Uint8Array; mode?: number }[]` → `Promise<void>`. No `cwd` option. "Defaults to writing to /vercel/sandbox unless an absolute path is specified." Runs as the default user. `Buffer` is accepted as `Uint8Array`. | T |
| `sandbox.cwd` | getter `string` (current session cwd) | T |
| `runCommand` overloads | `(cmd, args?, { signal?, timeoutMs? })` and `(params)`. Params: `cmd`, `args?`, `cwd?`, `env?`, `sudo?`, `detached?`, `stdin?`, `stdout?`/`stderr?` (Writable pipes), `signal?`, `timeoutMs?`. Non-detached returns `Promise<CommandFinished>`. `detached: true` returns `Promise<Command>`. `onStart(command)` hook is allowed only when not detached. | T |
| `timeoutMs` | "Maximum time … before it is killed with SIGKILL … enforced by the sandbox at exec time" | T |
| `CommandFinished` | `exitCode: number` ("always populated"), `durationMs?`. Inherits `Command`: `stdout()`, `stderr()`, `output()` (strings) and `logs()` async iterator. | T |
| Errors | Failures are `APIError` (and `StreamError`) classes from `api-client/api-error`. Exported error helpers include not-found / snapshot-not-found / sandbox-stopped checks used internally. | T/C |

- [NT] Whether a non-zero command exit is returned as `CommandFinished.exitCode !== 0` (expected from the "always populated" type and the `exitCode ?? 0` mapping in `session.js`) or thrown, is not confirmed by a run. The exit code and thrown error shape after a `timeoutMs` SIGKILL (probably exit 137 or an error) are likewise unconfirmed. [R] Handle both: non-zero exit → tool result `{exitCode, stdout, stderr}` for the model to explain. A thrown `APIError` or timeout → classify as failure. Do not report success for either.

## 7. Minimum assessment path (recommendations)
1. **Server module** `lib/admin-sandbox.ts` (server-only): `ADMIN_SANDBOX_NAME` constant plus `getAdminSandbox()` = `Sandbox.getOrCreate({ name: ADMIN_SANDBOX_NAME })`, with a `timeout` value valid for the account plan if the 5-minute default is too short. Called inside each `'use step'` that needs it.
2. **Memory file** `/vercel/sandbox/memory.md` (absolute path; relative `memory.md` resolves to the same place).
3. **Load at the start of every admin conversation [REQ]:** application code (route handler or first workflow step) calls `readFileToBuffer({ path: MEMORY_PATH })`. Behavior:
   - `null` → pass an explicit "no saved memory" string/state to the admin agent (the empty-memory case).
   - Buffer → UTF-8 string → inject into the admin agent instructions. This is the "read in app code and give the contents to the agent" requirement.
   - thrown (incl. `snapshot_not_found`) → show the failure in the chat. Do not treat it as empty.
   - This call may auto-resume a stopped sandbox (boot latency). That is expected.
4. **Append tool** `saveMemory({ note })`, used on explicit employee request (instruction in the agent prompt). Step: read (null → "") → append a dated line → `writeFiles` (overwrite). No atomic append API is documented. [R] Put `getStepMetadata().stepId` in the line as an idempotency marker and skip the append if it is already present. This is check-before-write for retried steps, not a universal exactly-once guarantee. No broad concurrency design is proposed.
5. **`bash` tool (admin-only):** `runCommand({ cmd: 'bash', args: ['-lc', command], timeoutMs })` in the same sandbox. Return `{ exitCode, stdout, stderr }` (truncated). The chat shows tool states: input available/running → output available (exit 0) → failure (exit ≠ 0 or thrown error), mapped through AI Elements by the UI ticket.
6. **Dataset arithmetic and joins [REQ]:** fetch tools run in the app. [R] Write fetched JSON with `writeFiles` into `/vercel/sandbox/data/<name>.json` (data from app code, not model-pasted numbers) and let `bash` compute aggregates/joins with `node`/`python3`, e.g. return rate per product = returns ÷ units sold, and low-stock top sellers = inventory(lowStock) ⋈ sales(top N) on productId. Two options: the `bash` tool accepts `files?: {path, content}[]`, or each fetch tool persists its JSON and returns the path. Either satisfies "compute in Sandbox, not model arithmetic". The same sandbox holds memory and data (same environment).
7. All sandbox calls run in server-side steps. Retried bash steps re-run read-only analysis commands. Memory changes go through `saveMemory`, not ad hoc bash edits ([R], prompt-level).
8. Not researched, not needed: AI SDK `experimental_sandbox` (the explicit `bash` tool is required anyway); Drives; snapshots as workspace.

## 8. Runtime acceptance checks (not run)
1. `pnpm install` + `pnpm build` with `@vercel/sandbox@4.0.0` and root zod 3; no zod/bundling errors; Vercel project Node >=22.19 (§2).
2. `getOrCreate({name})` twice returns the same sandbox; the second call does not recreate it.
3. Write `memory.md`, let the sandbox stop (explicit `stop()` and by session timeout), then in a new request/conversation `readFileToBuffer` returns the content. A missing file returns `null`.
4. `runCommand` on `exit 3` and on a timeout shows the actual result/error shape (§6 [NT]). Confirm `node` and `python3` exist in the default image.
5. `VERCEL_OIDC_TOKEN` works inside a Workflow step locally and deployed; otherwise use the access-token trio server-side (§3).
6. Quota/plan: if the owning account is Hobby, session max is 45 min and creation can pause after quota exhaustion [D S3]. Only relevant if creation is blocked.

## 9. Genuine remaining dependencies
- Runtime acceptance checks above (live account/project with Sandbox enabled; OIDC or server env credentials). This is an implementation-time need, not a research gap.
- Implementation tickets: workflow step wrapper, `saveMemory`/`bash` tools, admin UI states.
- Documented limit to state in deliverables: default 30-day snapshot TTL (reset on use) and 14-day sandbox removal (§5).
