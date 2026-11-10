/** Website card badge for an MCP server (260x72): /api/badge/<slug>/card */
import { card } from "@/lib/badge";
import { mcpBadge, svgHeaders } from "@/lib/badge-data";

export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = await mcpBadge((await params).slug);
  return new Response(card(b.line, "MCP server · tested live", b.color), { headers: svgHeaders(300) });
}
