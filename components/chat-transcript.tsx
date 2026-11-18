import { isToolUIPart, type DynamicToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

type ToolPart = ToolUIPart | DynamicToolUIPart;

// Both chats render the same messages, live region, and error alert; only the tool UI and busy id differ.
export function ChatTranscript({
  messages,
  busy,
  busyId,
  error,
  ToolResult,
}: {
  messages: UIMessage[];
  busy: boolean;
  busyId: string;
  error: string | null;
  ToolResult: (props: { part: ToolPart }) => React.JSX.Element;
}): React.JSX.Element {
  return (
    <>
      {messages.map((message) => (
        <Message key={message.id} from={message.role}>
          <MessageContent>
            {message.parts.map((part, index) => part.type === "text" ? (
              <MessageResponse key={index}>{part.text}</MessageResponse>
            ) : isToolUIPart(part) ? <ToolResult key={part.toolCallId} part={part} /> : null)}
          </MessageContent>
        </Message>
      ))}
      {/* Keep the live region mounted so screen readers announce busy changes. */}
      <p id={busyId} role="status" aria-live="polite" className={busy ? "text-sm text-muted-foreground" : "sr-only"}>{busy ? "Working on your request…" : ""}</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </>
  );
}
