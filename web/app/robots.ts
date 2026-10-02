import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE, SITEMAP_CHUNK } from "@/lib/site";

export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const c = db();
  let chunks = 1;
  if (c) {
    const { count } = await c.from("v_mcp_servers").select("id", { count: "exact", head: true });
    chunks = Math.max(1, Math.ceil((count ?? 0) / SITEMAP_CHUNK));
  }
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/search", "/submit?"] }],
    sitemap: [`${SITE}/sitemap/0.xml`, ...Array.from({ length: chunks }, (_, i) => `${SITE}/sitemap/${i + 1}.xml`)],
    host: SITE,
  };
}
