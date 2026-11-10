import { db } from "@/lib/db";

/** What the agent badge says: short value for the README shield, line for the website card. */
export async function agentBadge(slug: string) {
  let value = "listed", color = "#1F3FD1", line = "Independent listing";
  const c = db();
  if (c && /^[a-z0-9-]{1,200}$/.test(slug)) {
    const { data } = await c.from("v_agent_cards").select("quality_score").eq("slug", slug).maybeSingle();
    const a = data as { quality_score: number | null } | null;
    if (!a) { value = "not listed"; color = "#8A8F8C"; line = "Not listed"; }
    else if (a.quality_score != null && a.quality_score >= 50) {   // a low score stays on the page, not on the badge
      value = `listed · Agent Score ${Math.round(a.quality_score)}`; line = `Agent Score ${Math.round(a.quality_score)}/100`;
    }
  }
  return { value, color, line };
}

/** What the MCP server badge says: result of the live check. */
export async function mcpBadge(slug: string) {
  let value = "not checked", color = "#8A8F8C";
  const c = db();
  if (c && /^[a-z0-9-]{1,200}$/.test(slug)) {
    const { data } = await c.rpc("monitor_badge", { p_slug: slug });
    const b = data as { status?: string; pro?: boolean; rate30?: number | null } | null;
    if (!b) { value = "not listed"; }
    else if (b.status === "online" || b.status === "auth_required") {
      value = b.status === "online" ? "online" : "reachable";
      if (b.pro && b.rate30 != null) value += ` · ${b.rate30}% 30d`;
      color = "#1E8E5A";
    } else if (b.status === "down") { value = "not responding"; color = "#C2410C"; }
    else if (b.status === "unconfirmed") { value = "checking"; color = "#B7791F"; }
    else { value = "listed"; color = "#1F3FD1"; }   // listed, not hosted / not checked live (e.g. runs locally)
  }
  return { value, color, line: value.charAt(0).toUpperCase() + value.slice(1) };
}

export const svgHeaders = (maxAge: number) => ({ "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}` });
