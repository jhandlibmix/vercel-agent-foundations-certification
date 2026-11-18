"use client";

/**
 * Welcome! This is the chat panel you will edit for the workshop!
 *
 * During the workshop you'll connect it to a real agent: swap the
 * local `useState` for `useChat` from the AI SDK, point the form
 * at `sendMessage`, and render each message's `parts` inside
 * `<ConversationContent>`.
 *
 * Workshop docs: https://agent-foundations-certification.vercel.app/docs/admin-chat-agent
 */
import { useState } from "react";
import { AdminToolResult } from "@/components/admin-tool-result";
import { ChatTranscript } from "@/components/chat-transcript";
import { EMPTY_CHAT, useDurableChat } from "@/hooks/use-durable-chat";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";

const SUGGESTIONS = [
  "Show me low-stock items",
  "What were yesterday's top sellers?",
  "Summarize this week's revenue",
];

export function AdminAgentChat(): React.JSX.Element {
  const [input, setInput] = useState("");

  // Use a separate conversation and endpoint for the employee agent.
  const chat = useDurableChat("/api/admin/chat", EMPTY_CHAT);

  const handleSubmit = async (message: PromptInputMessage): Promise<void> => {
    if (!message.text.trim() || chat.busy) return;
    setInput("");
    await chat.send(message.text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="flex-1">
        <ConversationContent>
          {/* Show sandbox execution and save results alongside the response. */}
          <ChatTranscript messages={chat.messages} busy={chat.busy} busyId="admin-chat-busy" error={chat.error} ToolResult={AdminToolResult} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex flex-col gap-3 border-t p-3">
        <Suggestions>
          {SUGGESTIONS.map((s) => (
            <Suggestion key={s} suggestion={s} disabled={chat.busy} onClick={() => { void handleSubmit({ text: s, files: [] }); }} />
          ))}
        </Suggestions>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Ask the admin agent…"
              aria-label="Ask the admin agent"
              aria-describedby={chat.busy ? "admin-chat-busy" : undefined}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={chat.status} disabled={chat.busy || !input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
