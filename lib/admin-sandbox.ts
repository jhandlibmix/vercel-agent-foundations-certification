import "server-only";

import { Sandbox } from "@vercel/sandbox";
import { getStepMetadata, RetryableError } from "workflow";

export const ADMIN_SANDBOX_NAME = "ship-shop-admin";
const MEMORY_PATH = "/vercel/sandbox/memory.md";
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 20_000;

// Memory and computation must use the same persistent filesystem.
export async function getAdminSandbox(): Promise<Sandbox> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  // Vercel can supply a project ID even when authentication uses OIDC.
  if (token) {
    if (!teamId || !projectId) throw new Error("Sandbox access-token configuration is incomplete.");
    return Sandbox.getOrCreate({ name: ADMIN_SANDBOX_NAME, token, teamId, projectId });
  }
  // Do not eagerly resume: a lost snapshot must fail rather than recreate empty memory.
  return Sandbox.getOrCreate({ name: ADMIN_SANDBOX_NAME });
}

export async function loadAdminMemory(): Promise<string> {
  "use step";
  try {
    const sandbox = await getAdminSandbox();
    const memory = await sandbox.readFileToBuffer({ path: MEMORY_PATH });
    return memory?.toString("utf8") ?? "";
  } catch {
    throw new RetryableError("Saved admin context could not be loaded. This is not an empty-memory result.");
  }
}

export type MemoryResult = { ok: true; message: string };

export async function appendAdminMemory(note: string): Promise<MemoryResult> {
  "use step";
  try {
    const sandbox = await getAdminSandbox();
    const memory = (await sandbox.readFileToBuffer({ path: MEMORY_PATH }))?.toString("utf8") ?? "";
    const marker = `<!-- memory:${getStepMetadata().stepId} -->`;
    if (!memory.includes(marker)) {
      await sandbox.writeFiles([{ path: MEMORY_PATH, content: `${memory}\n${marker}\n${note}\n` }]);
    }
    return { ok: true, message: "Saved context in the admin sandbox." };
  } catch {
    throw new RetryableError("Admin context could not be saved. The write may have taken effect.");
  }
}

export type BashResult = {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
};

export async function runAdminCommand(command: string): Promise<BashResult> {
  "use step";
  try {
    const sandbox = await getAdminSandbox();
    const result = await sandbox.runCommand({ cmd: "bash", args: ["-lc", command], timeoutMs: COMMAND_TIMEOUT_MS });
    const [stdout, stderr] = await Promise.all([result.stdout(), result.stderr()]);
    return {
      ok: result.exitCode === 0,
      command,
      exitCode: result.exitCode,
      stdout: stdout.slice(0, MAX_OUTPUT_CHARS),
      stderr: stderr.slice(0, MAX_OUTPUT_CHARS),
      truncated: stdout.length > MAX_OUTPUT_CHARS || stderr.length > MAX_OUTPUT_CHARS,
    };
  } catch {
    throw new RetryableError("Sandbox command could not complete. It may have run before the connection failed.");
  }
}
