"use client";

// AI Elements `tool` (https://elements.ai-sdk.dev/components/tool), vendored from the registry.
// Local changes: project import paths, decorative icons hidden from screen readers, and the
// JSON-dump `ToolInput`/`ToolOutput` parts left out because both chats render tool results as
// plain-language components instead of raw parameters.

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import { CheckCircleIcon, ChevronDownIcon, CircleIcon, ClockIcon, WrenchIcon, XCircleIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible className={cn("group not-prose mb-4 w-full rounded-md border", className)} {...props} />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | { type: DynamicToolUIPart["type"]; state: DynamicToolUIPart["state"]; toolName: string }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon aria-hidden="true" className="size-4 text-yellow-600" />,
  "approval-responded": <CheckCircleIcon aria-hidden="true" className="size-4 text-blue-600" />,
  "input-available": <ClockIcon aria-hidden="true" className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon aria-hidden="true" className="size-4" />,
  "output-available": <CheckCircleIcon aria-hidden="true" className="size-4 text-green-600" />,
  "output-denied": <XCircleIcon aria-hidden="true" className="size-4 text-orange-600" />,
  "output-error": <XCircleIcon aria-hidden="true" className="size-4 text-red-600" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
  <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
    {statusIcons[status]}
    {statusLabels[status]}
  </Badge>
);

export const ToolHeader = ({ className, title, type, state, toolName, ...props }: ToolHeaderProps) => {
  const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger className={cn("flex w-full items-center justify-between gap-4 p-3", className)} {...props}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <WrenchIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title ?? derivedName}</span>
        {getStatusBadge(state)}
      </div>
      <ChevronDownIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
      />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);
