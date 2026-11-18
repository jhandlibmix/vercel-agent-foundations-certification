"use client";

import type { JSX } from "react";
import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { LoaderCircle } from "lucide-react";
import { DatasetView, Note } from "@/components/admin-dataset-views";
import { ShoppingToolResult } from "@/components/shopping-tool-result";
import { ToolFrame } from "@/components/tool-frame";
import { commandInput, commandOutput, datasetOutput, limitInput, lookupError, memoryOutput } from "@/lib/admin-schemas";
import { cn } from "@/lib/utils";

type ToolCopy = { label: string; noun: string; running: string; failed: string };
type ToolPart = ToolUIPart | DynamicToolUIPart;
type ResultProps = { part: ToolPart; output: unknown; copy: ToolCopy };

const DEFAULT_HISTORY_LIMIT = 25;

// Plain-language names so employees never see internal tool identifiers.
const TOOL_COPY: Record<string, ToolCopy> = {
  getSupportTickets: {
    label: "Support tickets",
    noun: "support tickets",
    running: "Checking support tickets…",
    failed: "Couldn't load support tickets. No result was confirmed.",
  },
  getReturnsHistory: {
    label: "Returns history",
    noun: "returns",
    running: "Checking returns history…",
    failed: "Couldn't load returns history. No result was confirmed.",
  },
  getInventoryStock: {
    label: "Inventory",
    noun: "products",
    running: "Checking inventory…",
    failed: "Couldn't load inventory. No result was confirmed.",
  },
  getSalesAnalytics: {
    label: "Sales",
    noun: "sales",
    running: "Checking sales figures…",
    failed: "Couldn't load sales figures. No result was confirmed.",
  },
  bash: {
    label: "Calculation",
    noun: "calculation",
    running: "Running calculation…",
    failed: "The calculation couldn't finish. It may have partly run before the failure.",
  },
  saveMemory: {
    label: "Context memory",
    noun: "context",
    running: "Saving context…",
    failed: "Context could not be saved; the write may have taken effect.",
  },
};
const FALLBACK_COPY: ToolCopy = {
  label: "Store lookup",
  noun: "records",
  running: "Checking store data…",
  failed: "Couldn't complete this lookup. No result was confirmed.",
};

const STDOUT_CLASS = "mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-xs";
const STDERR_CLASS = "mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-destructive/10 p-2 font-mono text-xs";

function CommandResult({ part, output }: ResultProps): JSX.Element {
  const input = commandInput.safeParse(part.input);
  const command = commandOutput.safeParse(output);
  const shownCommand = command.success ? command.data.command : input.success ? input.data.command : null;
  return (
    <>
      {command.success ? (
        <p role={command.data.ok ? "status" : "alert"} className={cn("mt-1", !command.data.ok && "text-destructive")}>
          {command.data.ok ? "Calculation finished" : `Calculation failed (exit code ${command.data.exitCode})`}
        </p>
      ) : null}
      {shownCommand ? (
        <details className="mt-2" open>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Command</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-xs">$ {shownCommand}</pre>
        </details>
      ) : null}
      {command.success ? (
        <>
          <p className="mt-2 text-xs font-medium text-muted-foreground">Output</p>
          <pre className={STDOUT_CLASS}>{command.data.stdout || "(no output)"}</pre>
          {command.data.stderr ? (
            <>
              <p className="mt-2 text-xs font-medium text-destructive">Errors</p>
              <pre className={STDERR_CLASS}>{command.data.stderr}</pre>
            </>
          ) : null}
          {command.data.truncated ? <Note>Output truncated: only the first 20,000 characters of each stream are shown. Ask for a narrower calculation to see the rest.</Note> : null}
        </>
      ) : null}
    </>
  );
}

function MemoryResult({ output }: ResultProps): JSX.Element | null {
  const memory = memoryOutput.safeParse(output);
  return memory.success ? <p role="status" className="mt-1">{memory.data.message}</p> : null;
}

function LookupResult({ part, output, copy }: ResultProps): JSX.Element {
  const dataset = datasetOutput.safeParse(output);
  const error = lookupError.safeParse(output);
  const requested = limitInput.safeParse(part.input);
  const limit = requested.success && requested.data.limit ? requested.data.limit : DEFAULT_HISTORY_LIMIT;
  const name = getToolName(part);
  return (
    <>
      {error.success ? <p role="alert" className="mt-1 text-destructive">{error.data.message}</p> : null}
      {dataset.success ? <div className="mt-1"><DatasetView name={name} rows={dataset.data.data} meta={dataset.data.meta} limit={limit} noun={copy.noun} /></div> : null}
    </>
  );
}

function ResultBody({ name, ...props }: ResultProps & { name: string }): JSX.Element {
  if (name === "bash") return <CommandResult {...props} />;
  if (name === "saveMemory") return <MemoryResult {...props} />;
  return <LookupResult {...props} />;
}

export function AdminToolResult({ part }: { part: ToolPart }): JSX.Element {
  const name = getToolName(part);
  // Catalog tools keep their existing product UI.
  if (name === "searchProducts" || name === "getAllCategories") return <ShoppingToolResult part={part} />;
  const copy = TOOL_COPY[name] ?? FALLBACK_COPY;
  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error" || part.state === "output-denied";
  const output = part.state === "output-available" ? part.output : undefined;

  return (
    <ToolFrame tool={part} title={copy.label} role="region" aria-label={copy.label}>
      {/* Pending or failed work must never look like a confirmed result. */}
      {running ? (
        <p role="status" className="mt-1 flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{copy.running}
        </p>
      ) : null}
      {failed ? <p role="alert" className="mt-1 text-destructive">{copy.failed}</p> : null}
      <ResultBody name={name} part={part} output={output} copy={copy} />
    </ToolFrame>
  );
}
