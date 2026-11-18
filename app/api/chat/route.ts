/**
 * This is where the chat API route will live.
 *
 * During the workshop you'll wire this up to the agent in `lib/agent.ts`
 * using `createAgentUIStreamResponse` from the AI SDK. The chat panel in
 * `components/agent-chat.tsx` posts here once you swap its placeholder
 * `useState` for `useChat`.
 *
 * Workshop docs: https://agent-foundations-certification.vercel.app/docs/chat-agent
 */

import { startChat } from "@/lib/chat-stream";
import { chatFlow } from "@/lib/workflows/chat-flow";

// Start durable work without tying its lifetime to the browser connection.
export async function POST(request: Request): Promise<Response> {
  return startChat(request, chatFlow, "shop-chat");
}
