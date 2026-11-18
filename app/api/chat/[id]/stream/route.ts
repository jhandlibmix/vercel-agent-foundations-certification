/**
 * This is where we'll add a route for resuming a stream for an agent chat.
 *
 * During the workshop you will wire this up in the Workflows chapter.
 *
 * Workshop docs: https://agent-foundations-certification.vercel.app/docs/workflows
 */

import { resumeChat } from "@/lib/chat-stream";
import { chatFlow } from "@/lib/workflows/chat-flow";

// Reattach to existing work, or report its terminal status before saving the turn.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return resumeChat(request, id, chatFlow);
}
