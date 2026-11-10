/**
 * Embeddable "Listed on Electra Index" badge for an AI agent: /api/badge/agent/<slug>
 * Shows the Agent Score when there is one. Links back to the agent page when embedded with the snippet.
 */
import { db } from "@/lib/db";
import { svg, card } from "@/lib/badge";

export const revalidate = 3600;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let value = "listed", color = "#1F3FD1", line = "Independent listing";
  const c = db();
  if (c && /^[a-z0-9-]{1,200}$/.test(slug)) {
    const { data } = await c.from("v_agent_cards").select("quality_score").eq("slug", slug).maybeSingle();
    const a = data as { quality_score: number | null } | null;
    if (!a) { value = "not listed"; color = "#8A8F8C"; }
    else if (a.quality_score != null && a.quality_score >= 50) { value = `listed · Agent Score ${Math.round(a.quality_score)}`; line = `Agent Score ${Math.round(a.quality_score)}/100`; }   // a low score stays on the page, not on the badge
  }
  const isCard = new URL(req.url).searchParams.get("style") === "card";
  const body = isCard ? card(value === "not listed" ? "Not listed" : line, "Verified prices · independent ranking", color) : svg("Electra Index", value, color);
  return new Response(body, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
