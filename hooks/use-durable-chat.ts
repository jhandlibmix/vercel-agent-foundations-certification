"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow/client";
import { safeValidateUIMessages, type ChatStatus, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

export type ChatSnapshot = {
  messages: UIMessage[];
  requestId: string | null;
  runId: string | null;
};

export const EMPTY_CHAT: ChatSnapshot = { messages: [], requestId: null, runId: null };
export const SHOPPING_CHAT_KEY = "ship-shop-chat";

const RUN_STATUSES = ["pending", "running", "completed", "failed", "cancelled"] as const;
type RunStatus = (typeof RUN_STATUSES)[number];

const FAILED_MESSAGE = "This response could not be completed. You can send another message.";
const INTERRUPTED_MESSAGE = "The response was interrupted. Refresh to reconnect to the same work.";
const SAVE_CHECK_FAILED_MESSAGE = "Could not save or check the response. Refresh to reconnect to the same work.";
const SEND_FAILED_MESSAGE = "Could not send or save the message. Refresh to try reconnecting.";

function isRunStatus(value: unknown): value is RunStatus {
  return RUN_STATUSES.some((status) => status === value);
}

// Restore before mounting useChat so refresh replays only the active reply.
export async function loadChatSnapshot(key: string): Promise<ChatSnapshot> {
  const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
  if (saved === null) return EMPTY_CHAT;
  if (typeof saved !== "object" || !("messages" in saved) || !("requestId" in saved) || !("runId" in saved)) {
    throw new Error("Invalid saved conversation");
  }
  const validated = await safeValidateUIMessages({ messages: saved.messages });
  const { requestId, runId } = saved;
  if (!validated.success || !(requestId === null || typeof requestId === "string") || !(runId === null || typeof runId === "string")) {
    throw new Error("Invalid saved conversation");
  }
  return { messages: validated.data, requestId, runId };
}

export function useDurableChat(
  api: string,
  initial: ChatSnapshot,
  storageKey?: string,
): {
  messages: UIMessage[];
  status: ChatStatus;
  busy: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
} {
  const snapshot = useRef(initial);
  const [settling, setSettling] = useState(Boolean(initial.requestId || initial.runId));
  const [problem, setProblem] = useState<string | null>(null);

  function save(next: ChatSnapshot): void {
    // Save the turn and its run together so refresh cannot replay a partial reply.
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
    snapshot.current = next;
  }

  async function getStatus(runId = snapshot.current.runId): Promise<RunStatus | null> {
    if (!runId) return null;
    const response = await fetch(`${api}/${encodeURIComponent(runId)}/stream?status=1`);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("status" in body)) return null;
    return isRunStatus(body.status) ? body.status : null;
  }

  // Drop the unfinished turn: restore the last sent messages and allow a new send.
  function discardTurn(): void {
    chat.setMessages(snapshot.current.messages);
    save({ messages: snapshot.current.messages, requestId: null, runId: null });
    setProblem(FAILED_MESSAGE);
  }

  const [transport] = useState(() => new WorkflowChatTransport({
    api,
    prepareSendMessagesRequest: ({ messages }) => {
      // Keep this ID before POST so a lost response can reattach to the same work.
      save({ messages, requestId: crypto.randomUUID(), runId: null });
      setSettling(true);
      return { body: { messages, requestId: snapshot.current.requestId } };
    },
    prepareReconnectToStreamRequest: () => ({
      api: `${api}/${encodeURIComponent(snapshot.current.runId ?? "pending")}/stream`,
    }),
    fetch: async (input, init) => {
      // A refresh can happen before the server's run ID reaches the browser.
      const url = String(input);
      const recoveringPost = url.startsWith(`${api}/pending/stream`);
      const needsPost = recoveringPost && !snapshot.current.runId;
      let response: Response;
      if (needsPost && !snapshot.current.requestId) {
        // The saved turn was already dropped (e.g. its run expired); there is nothing to rejoin.
        response = new Response(null, { status: 404 });
      } else if (needsPost) {
        // The run ID never arrived, so repeat the POST; the server dedupes by requestId.
        response = await fetch(api, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: snapshot.current.messages, requestId: snapshot.current.requestId }),
          signal: init?.signal,
        });
      } else if (recoveringPost) {
        // The transport appends ?startIndex=N; carry it over to the real run's stream URL.
        const [, query] = url.split("?");
        const search = query === undefined ? "" : `?${query}`;
        response = await fetch(`${api}/${encodeURIComponent(snapshot.current.runId ?? "")}/stream${search}`, init);
      } else {
        response = await fetch(input, init);
      }
      // 404: the saved run expired or was removed, so reconnecting can never succeed; drop the turn.
      if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) {
        save({ ...snapshot.current, requestId: null, runId: null });
      }
      const runId = response.headers.get("x-workflow-run-id");
      if (response.ok && runId) save({ ...snapshot.current, runId });
      return response;
    },
  }));

  const chat = useChat({
    messages: initial.messages,
    transport,
    resume: Boolean(initial.requestId || initial.runId),
    onError: async () => {
      const requestId = snapshot.current.requestId;
      try {
        const status = await getStatus();
        if (snapshot.current.requestId !== requestId) return;
        if (!snapshot.current.requestId || status === "failed" || status === "cancelled") {
          discardTurn();
        } else {
          setProblem(INTERRUPTED_MESSAGE);
        }
      } catch {
        if (snapshot.current.requestId !== requestId) return;
        setProblem(INTERRUPTED_MESSAGE);
      }
      setSettling(false);
    },
    onFinish: async ({ messages, isAbort, isDisconnect, isError }) => {
      const requestId = snapshot.current.requestId;
      const interrupted = isAbort || isDisconnect || isError;
      if (!requestId && interrupted) return;
      try {
        // A closed HTTP stream does not mean the workflow has finished.
        let status = await getStatus();
        while (!interrupted && (status === "pending" || status === "running")) {
          await new Promise<void>((resolve) => setTimeout(resolve, 250));
          if (snapshot.current.requestId !== requestId) return;
          status = await getStatus();
        }
        if (snapshot.current.requestId !== requestId) return;
        if (status === "completed" && !interrupted) {
          save({ messages, requestId: null, runId: null });
          setProblem(null);
        } else if (status === "failed" || status === "cancelled" || status === "completed") {
          discardTurn();
        } else {
          setProblem(INTERRUPTED_MESSAGE);
        }
      } catch {
        if (snapshot.current.requestId === requestId) setProblem(SAVE_CHECK_FAILED_MESSAGE);
      } finally {
        if (snapshot.current.requestId === requestId || snapshot.current.requestId === null) setSettling(false);
      }
    },
  });

  const busy = settling || chat.status === "submitted" || chat.status === "streaming" || Boolean(snapshot.current.requestId && problem);
  useEffect(() => {
    if (!busy) return;
    let checking = false;
    // A failed workflow can leave its stream open. Check it without starting new work.
    const timer = setInterval(async (): Promise<void> => {
      if (checking) return;
      checking = true;
      const requestId = snapshot.current.requestId;
      try {
        const status = await getStatus();
        if (snapshot.current.requestId !== requestId) return;
        if (status === "failed" || status === "cancelled") {
          await chat.stop();
          if (snapshot.current.requestId !== requestId) return;
          discardTurn();
          setSettling(false);
        }
      } catch {
        // A failed status request is not evidence that the workflow failed.
      } finally {
        checking = false;
      }
    }, 1000);
    return (): void => clearInterval(timer);
  }, [busy, chat.stop, chat.setMessages]);

  async function send(text: string): Promise<void> {
    setProblem(null);
    try {
      await chat.sendMessage({ text });
    } catch {
      setSettling(false);
      setProblem(SEND_FAILED_MESSAGE);
    }
  }

  return {
    messages: chat.messages,
    status: chat.status,
    busy,
    error: problem,
    send,
  };
}
