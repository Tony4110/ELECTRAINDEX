import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/**
 * /go/<type>/<slug>?to=website|pricing|repository&from=<page path>[&s=1 for a sponsored placement]
 * Records an outbound click and redirects to the destination stored in the database.
 * A click counts as human only if it comes from one of our pages and does not look like a robot;
 * the database also keeps one human click per visitor and product per day (see 0048).
 * Visitor = one-way hash of connection + browser + day: no address, no cookie is stored.
 * The destination never comes from the URL, so this cannot be used as an open redirect.
 */
const TYPES: Record<string, { entity: string; view: string; cols: Record<string, string> }> = {
  agent: { entity: "agent", view: "v_agent_cards", cols: { website: "website", pricing: "pricing_url" } },
  mcp: { entity: "mcp_server", view: "v_mcp_servers", cols: { website: "website", repository: "repository_url" } },
};
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|python|curl|wget|httpclient|axios|node-fetch|go-http|java\/|okhttp|scrapy|phantom|selenium|playwright|puppeteer/i;
const OUR_HOSTS = /(^|\.)electraindex\.com$|\.netlify\.app$|^localhost$/i;

/** Does this request look like a person who clicked a button on one of our pages? */
function looksHuman(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  if (!ua || BOT.test(ua) || !/Mozilla\//.test(ua)) return false;
  if (!req.headers.get("accept-language")) return false;
  let refHost = "";
  try { refHost = new URL(req.headers.get("referer") ?? "").hostname; } catch { return false; }
  if (!OUR_HOSTS.test(refHost)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site") return false;
  return true;
}

function visitorHash(req: NextRequest) {
  const ip = req.headers.get("x-nf-client-connection-ip") ?? (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${req.headers.get("user-agent") ?? ""}|${day}|electra-clicks`).digest("hex").slice(0, 32);
}

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
  // declared crawlers and link previews are redirected without being logged; everything else is logged,
  // and marked human only when it looks like a real visitor coming from our pages
  if (!BOT.test(req.headers.get("user-agent") ?? "")) {
    const { data, error } = await c.rpc("go_outbound", {
      p_type: t.entity, p_slug: slug, p_target: to, p_path: from,
      p_visitor: visitorHash(req), p_human: looksHuman(req), p_sponsored: req.nextUrl.searchParams.get("s") === "1",
    });
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
