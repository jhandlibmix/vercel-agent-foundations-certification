"use client";

/**
 * Welcome! This is the chat panel you will edit for the workshop!
 *
 * During the workshop you'll connect it to a real agent: swap the
 * local `useState` for `useChat` from the AI SDK, point the form
 * at `sendMessage`, and render each message's `parts` inside
 * `<ConversationContent>`.
 *
 * Workshop docs: https://agent-foundations-certification.vercel.app/docs/chat-agent
 */
import { useEffect, useState } from "react";
import { ShoppingToolResult } from "@/components/shopping-tool-result";
import { ChatTranscript } from "@/components/chat-transcript";
import { SHOPPING_CHAT_KEY, loadChatSnapshot, useDurableChat, type ChatSnapshot } from "@/hooks/use-durable-chat";
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

export function AgentChat(): React.JSX.Element {
  const [initial, setInitial] = useState<ChatSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChatSnapshot(SHOPPING_CHAT_KEY).then(setInitial, () => {
      setError("Could not restore the conversation. Check that browser storage is available, then refresh.");
    });
  }, []);

  if (error) return <p role="alert" className="p-3 text-sm">{error}</p>;
  if (!initial) return <p role="status" className="p-3 text-sm">Loading conversation…</p>;
  return <ShoppingConversation initial={initial} />;
}

function ShoppingConversation({ initial }: { initial: ChatSnapshot }): React.JSX.Element {
  const [input, setInput] = useState("");
  const chat = useDurableChat("/api/chat", initial, SHOPPING_CHAT_KEY);

  const handleSubmit = async (message: PromptInputMessage): Promise<void> => {
    if (!message.text.trim() || chat.busy) return;
    setInput("");
    await chat.send(message.text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="flex-1">
        <ConversationContent>
          {/* Keep lookup progress and product results beside the assistant's response. */}
          <ChatTranscript messages={chat.messages} busy={chat.busy} busyId="shopping-chat-busy" error={chat.error} ToolResult={ShoppingToolResult} />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Ask the agent"
              aria-label="Ask the agent"
              aria-describedby={chat.busy ? "shopping-chat-busy" : undefined}
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
