import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE, SITEMAP_CHUNK } from "@/lib/site";

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const c = db();
  let chunks = 1;
  if (c) {
    // Same count as generateSitemaps() in sitemap.ts: only indexable MCP pages, so we never announce empty sitemaps.
    const ix = await c.from("v_mcp_index").select("slug", { count: "exact", head: true }).eq("indexable", true);
    const { count } = ix.error ? await c.from("v_mcp_servers").select("id", { count: "exact", head: true }) : ix;
    chunks = Math.max(1, Math.ceil((count ?? 0) / SITEMAP_CHUNK));
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/mcp", "/search", "/submit?", "/go/", "/monitor/r/", "/monitor?", "/spotlight/r/", "/spotlight?"] }],
    sitemap: [`${SITE}/sitemap.xml`, `${SITE}/sitemap/0.xml`, ...Array.from({ length: chunks }, (_, i) => `${SITE}/sitemap-mcp/${i + 1}.xml`)],
    host: SITE,
  };
}
