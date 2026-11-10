/** Website card badge for an AI agent (260x72): /api/badge/agent/<slug>/card */
import { card } from "@/lib/badge";
import { agentBadge, svgHeaders } from "@/lib/badge-data";

export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = await agentBadge((await params).slug);
  return new Response(card(b.line, "Verified prices · independent ranking", b.color), { headers: svgHeaders(3600) });
}
