/**
 * Embeddable status badge for an MCP server: /api/badge/<slug>
 * Shows the result of our live check. Monitoring Pro servers also show their 30-day answer rate.
 */
import { db } from "@/lib/db";

export const revalidate = 300;

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
// rough width of Verdana 11px text (shields.io style)
const w = (s: string) => Math.round([...s].reduce((n, ch) => n + (/[il.:|' ]/.test(ch) ? 3.6 : /[mwMW%]/.test(ch) ? 9.5 : /[A-Z0-9]/.test(ch) ? 7.5 : 6.4), 0)) + 12;

function svg(label: string, value: string, color: string) {
  const lw = w(label), vw = w(value), W = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${W}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#121816"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/><rect width="${W}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text></g></svg>`;
}

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
  }
  return new Response(svg("Electra Index", value, color), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}
