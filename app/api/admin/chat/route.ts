/**
 * This is where the admin chat API route will live.
 *
 * During the workshop you'll wire this up to the agent in `lib/agent.ts`
 * using `createAgentUIStreamResponse` from the AI SDK. The chat panel in
 * `components/agent-chat.tsx` posts here once you swap its placeholder
 * `useState` for `useChat`.
 *
 * Workshop docs: https://agent-foundations-certification.vercel.app/docs/admin-chat-agent
 */

import { startChat } from "@/lib/chat-stream";
import { adminChatFlow } from "@/lib/workflows/admin-chat-flow";
import { isAdminAuthenticated } from "@/lib/admin-auth";

// Start durable work without tying its lifetime to the browser connection.
export async function POST(request: Request): Promise<Response> {
  // The admin chat API needs the login cookie too.
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Admin sign-in required." }, { status: 401 });
  return startChat(request, adminChatFlow, "admin-chat");
}
