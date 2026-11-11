/** Sitemap index (/sitemap.xml) pointing to /sitemap/0.xml (core, agents, French pages) and /sitemap/1..N.xml (MCP servers). */
import { db } from "@/lib/db";
import { SITE, SITEMAP_CHUNK } from "@/lib/site";

export const revalidate = 3600;

export async function GET() {
  let chunks = 1;
  try {
    const c = db();
    if (c) {
      // Same count as generateSitemaps() in app/sitemap.ts: only indexable MCP pages (no empty sitemaps announced).
      const ix = await c.from("v_mcp_index").select("slug", { count: "exact", head: true }).eq("indexable", true);
      const { count } = ix.error ? await c.from("v_mcp_servers").select("id", { count: "exact", head: true }) : ix;
      chunks = Math.max(1, Math.ceil((count ?? 0) / SITEMAP_CHUNK));
    }
  } catch { /* keep 1 */ }
  const now = new Date().toISOString();
  const urls = [`${SITE}/sitemap/0.xml`, ...Array.from({ length: chunks }, (_, i) => `${SITE}/sitemap-mcp/${i + 1}.xml`)];
  const items = urls.map((u) => `  <sitemap><loc>${u}</loc><lastmod>${now}</lastmod></sitemap>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
