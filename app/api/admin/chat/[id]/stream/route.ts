import { resumeChat } from "@/lib/chat-stream";
import { adminChatFlow } from "@/lib/workflows/admin-chat-flow";
import { isAdminAuthenticated } from "@/lib/admin-auth";

// Reattach to existing work, or report its terminal status before saving the turn.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  // Replaying admin output requires the same login as starting it.
  if (!(await isAdminAuthenticated())) return Response.json({ error: "Admin sign-in required." }, { status: 401 });
  const { id } = await params;
  return resumeChat(request, id, adminChatFlow);
}
