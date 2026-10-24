/**
 * Embeddable "Listed on Electra Index" badge for an AI agent: /api/badge/agent/<slug>
 * Shows the Agent Score when there is one. Links back to the agent page when embedded with the snippet.
 */
import { db } from "@/lib/db";
import { svg } from "@/lib/badge";

export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let value = "listed", color = "#1F3FD1";
  const c = db();
  if (c && /^[a-z0-9-]{1,200}$/.test(slug)) {
    const { data } = await c.from("v_agent_cards").select("quality_score").eq("slug", slug).maybeSingle();
    const a = data as { quality_score: number | null } | null;
    if (!a) { value = "not listed"; color = "#8A8F8C"; }
    else if (a.quality_score != null && a.quality_score >= 50) value = `listed · Agent Score ${Math.round(a.quality_score)}`;   // a low score stays on the page, not on the badge
  }
  return new Response(svg("Electra Index", value, color), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
