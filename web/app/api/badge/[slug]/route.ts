/**
 * Embeddable status badge for an MCP server (README shield): /api/badge/<slug>
 * Shows the result of our live check. Monitoring Pro servers also show their 30-day answer rate.
 * Website card version: /api/badge/<slug>/card
 */
import { svg } from "@/lib/badge";
import { mcpBadge, svgHeaders } from "@/lib/badge-data";

export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = await mcpBadge((await params).slug);
  return new Response(svg("Electra Index", b.value, b.color), { headers: svgHeaders(300) });
}
