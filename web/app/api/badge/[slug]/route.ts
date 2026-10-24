/**
 * Embeddable status badge for an MCP server: /api/badge/<slug>
 * Shows the result of our live check. Monitoring Pro servers also show their 30-day answer rate.
 */
import { db } from "@/lib/db";
import { svg } from "@/lib/badge";

export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
  return new Response(svg("Electra Index", value, color), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
