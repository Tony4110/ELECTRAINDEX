/**
 * Embeddable "Listed on Electra Index" badge for an AI agent (README shield): /api/badge/agent/<slug>
 * Website card version: /api/badge/agent/<slug>/card
 */
import { svg } from "@/lib/badge";
import { agentBadge, svgHeaders } from "@/lib/badge-data";

export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const b = await agentBadge((await params).slug);
  return new Response(svg("Electra Index", b.value, b.color), { headers: svgHeaders(3600) });
}
