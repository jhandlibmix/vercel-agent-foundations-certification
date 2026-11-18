"use client";

import type { ReactNode } from "react";
import { Tool, ToolContent, ToolHeader, type ToolPart, type ToolProps } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";

// Tools report store errors as `{ ok: false }` results; the badge should say so instead of "Completed".
function headerState(part: ToolPart): ToolPart["state"] {
  const output: unknown = part.state === "output-available" ? part.output : undefined;
  const reportedFailure = typeof output === "object" && output !== null && "ok" in output && output.ok === false;
  return reportedFailure ? "output-error" : part.state;
}

/**
 * Shared AI Elements `Tool` frame for both chats: a plain-language title and status badge,
 * with the result component open underneath so shoppers and employees never need to expand it.
 */
export function ToolFrame({
  tool: part,
  title,
  children,
  className,
  ...props
}: { tool: ToolPart; title: string; children: ReactNode } & Omit<ToolProps, "children" | "part">): React.JSX.Element {
  const state = headerState(part);
  return (
    <Tool defaultOpen className={cn("my-2 mb-2 min-w-0 bg-card text-card-foreground", className)} {...props}>
      {part.type === "dynamic-tool" ? (
        <ToolHeader title={title} type={part.type} state={state} toolName={part.toolName} />
      ) : (
        <ToolHeader title={title} type={part.type} state={state} />
      )}
      <ToolContent className="space-y-2 px-3 pt-0 pb-3 text-sm text-card-foreground">{children}</ToolContent>
    </Tool>
  );
}
