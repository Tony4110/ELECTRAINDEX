/**
 * MCP server sitemaps: /sitemap-mcp/1.xml … /sitemap-mcp/N.xml (5,000 pages each, only the indexable ones).
 * Built on each request (cached 1 h at the CDN), never frozen at build time: a slow or failed build-time query
 * can no longer leave Google with an empty file.
 */
import { db } from "@/lib/db";
import { SITE, SITEMAP_CHUNK } from "@/lib/site";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = /^(\d{1,3})\.xml$/.exec((await params).file);
  const n = m ? Number(m[1]) : 0;
  if (!n) return new Response("Not found", { status: 404 });
  const c = db();
  const rows: { slug: string; last_seen_at: string | null }[] = [];
  let failed = !c;
  if (c) {
    const from = (n - 1) * SITEMAP_CHUNK;
    for (let off = from; off < from + SITEMAP_CHUNK; off += 1000) {
      const { data, error } = await c.from("v_mcp_index").select("slug,last_seen_at").eq("indexable", true).order("slug").range(off, off + 999);
      if (error) { failed = true; break; }
      const page = (data as { slug: string; last_seen_at: string | null }[] | null) ?? [];
      rows.push(...page);
      if (page.length < 1000) break;
    }
  }
  if (failed && rows.length === 0) {
    // never hand Google an empty list because of a database hiccup: ask it to come back
    return new Response("Temporarily unavailable", { status: 503, headers: { "Retry-After": "3600", "Cache-Control": "no-store" } });
  }
  if (rows.length === 0) return new Response("Not found", { status: 404 });
  const body = rows.map((r) => `<url><loc>${SITE}/mcp/${esc(r.slug)}</loc>${r.last_seen_at ? `<lastmod>${new Date(r.last_seen_at).toISOString()}</lastmod>` : ""}</url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600", "Netlify-CDN-Cache-Control": "public, max-age=3600" } });
}
