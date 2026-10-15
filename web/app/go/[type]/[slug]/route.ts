import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * /go/<type>/<slug>?to=website|pricing|repository&from=<page path>
 * Records an outbound click (no personal data) and redirects to the destination stored in the database.
 * The destination never comes from the URL, so this cannot be used as an open redirect.
 */
const TYPES: Record<string, { entity: string; view: string; cols: Record<string, string> }> = {
  agent: { entity: "agent", view: "v_agent_cards", cols: { website: "website", pricing: "pricing_url" } },
  mcp: { entity: "mcp_server", view: "v_mcp_servers", cols: { website: "website", repository: "repository_url" } },
};
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless/i;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; slug: string }> }) {
  const { type, slug } = await params;
  const t = TYPES[type];
  const to = req.nextUrl.searchParams.get("to") ?? "website";
  const from = (req.nextUrl.searchParams.get("from") ?? "").slice(0, 300);
  const c = db();
  const home = new URL("/", req.url);
  if (!t || !c || !(to in t.cols)) return NextResponse.redirect(home, 302);

  let url: string | null = null;
  // humans only: crawlers and link previews are redirected without being counted
  if (!BOT.test(req.headers.get("user-agent") ?? "")) {
    const { data, error } = await c.rpc("go_outbound", { p_type: t.entity, p_slug: slug, p_target: to, p_path: from });
    if (!error && typeof data === "string") url = data;
  }
  if (!url) {
    // not counted (bot, or tracking not installed yet): still send the visitor to the right place
    const { data } = await c.from(t.view).select(t.cols[to]).eq("slug", slug).maybeSingle();
    const v = (data as Record<string, string | null> | null)?.[t.cols[to]] ?? null;
    url = v && /^https?:\/\//i.test(v) ? v : null;
  }
  if (!url) return NextResponse.redirect(new URL(type === "agent" ? `/agents/${slug}` : `/mcp/${slug}`, req.url), 302);
  const res = NextResponse.redirect(url, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
