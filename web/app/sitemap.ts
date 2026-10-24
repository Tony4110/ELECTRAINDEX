import type { MetadataRoute } from "next";
import { db, MIN_TOOLS_FOR_INDEX } from "@/lib/db";
import { SITE, SITEMAP_CHUNK, MIN_DESC } from "@/lib/site";
import { featuredPairsByTheme, pairSlug } from "@/lib/compare";
import { allPosts } from "@/lib/posts";
import { PUBLIC_LANGS, lhref, isLocalized } from "@/lib/i18n";
import { db as dbType } from "@/lib/db";

/** French pages (only those that exist: translated agents, mapped tasks and themes). */
async function frUrls(c: NonNullable<ReturnType<typeof dbType>>, now: Date) {
  const [{ data: ag }, { data: tk }, { data: th }] = await Promise.all([
    c.from("v_agent_i18n").select("slug").eq("lang", "fr").limit(5000),
    c.from("v_tasks").select("slug"),
    c.from("v_theme_overview").select("theme_slug"),
  ]);
  const paths = [
    "/tasks", "/themes", "/pricing", "/spotlight", "/monitor",
    ...((th as { theme_slug: string }[] | null) ?? []).map((t) => `/themes/${t.theme_slug}`),
    ...((tk as { slug: string }[] | null) ?? []).map((t) => `/tasks/${t.slug}`),
    ...((ag as { slug: string }[] | null) ?? []).map((a) => `/agents/${a.slug}`),
  ].filter((p) => isLocalized("fr", p));
  const alts = ((ag as { slug: string }[] | null) ?? []).map((a) => `/agents/${a.slug}/alternatives`);
  return [
    ...["/fr/meilleurs-agents-ia", "/fr/comparer-prix-agents-ia"].map((u) => ({ url: `${SITE}${u}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 })),
    ...[...paths, ...alts].map((p) => ({ url: `${SITE}${lhref("fr", p)}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}

export const revalidate = 3600;

/** Sitemap 0 = core pages, themes, tasks, agents, compare. Sitemaps 1..N = tools, 5,000 per file. */
export async function generateSitemaps() {
  try {
    const c = db();
    if (!c) return [{ id: 0 }];
    const { count } = await c.from("v_mcp_servers").select("id", { count: "exact", head: true });
    const chunks = Math.max(1, Math.ceil((count ?? 0) / SITEMAP_CHUNK));
    return Array.from({ length: chunks + 1 }, (_, id) => ({ id }));
  } catch {
    return [{ id: 0 }]; // never let a DB hiccup break sitemap discovery
  }
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const n = Number(id);
  const now = new Date();

  // Core pages need no database — always valid, even if Supabase is unreachable.
  const core: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...["/compare", "/blog", "/tasks", "/mcp", "/payments", "/new", "/pulse", "/mcp-server", "/pricing", "/monitor", "/spotlight", "/sources", "/capabilities", "/submit", "/advertise"].map((p) => ({ url: SITE + p, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 })),
    ...PUBLIC_LANGS.filter((l) => l !== "en").flatMap((l) => ["", "/submit"].map((p) => ({ url: `${SITE}/${l}${p}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 }))),
    ...allPosts().map((p) => ({ url: `${SITE}/blog/${p.slug}`, lastModified: new Date(p.date), changeFrequency: "weekly" as const, priority: 0.7 })),
  ];

  const c = db();
  if (!c) return n === 0 ? core : [];

  if (n === 0) {
    try {
      const [themes, tasks, agents, comparos, best] = await Promise.all([
        c.from("v_theme_overview").select("theme_slug"),
        c.from("v_tasks").select("slug"),
        c.from("v_agent_cards").select("slug,last_verified_at").limit(1000),
        featuredPairsByTheme(6).catch(() => []),
        c.from("v_capability_overview").select("capability_slug").gte("tools", MIN_TOOLS_FOR_INDEX),
      ]);
      const comparePaths = Array.from(new Set((comparos ?? []).flatMap((g) => g.pairs).map((p) => pairSlug(p.a, p.b))));
      return [
        ...core,
        ...comparePaths.map((slug) => ({ url: `${SITE}/compare/${slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
        ...((themes.data as { theme_slug: string }[] | null) ?? []).map((t) => ({ url: `${SITE}/themes/${t.theme_slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 })),
        ...((tasks.data as { slug: string }[] | null) ?? []).map((t) => ({ url: `${SITE}/tasks/${t.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 })),
        ...((agents.data as { slug: string; last_verified_at: string | null }[] | null) ?? []).map((a) => ({ url: `${SITE}/agents/${a.slug}`, lastModified: a.last_verified_at ? new Date(a.last_verified_at) : now, changeFrequency: "weekly" as const, priority: 0.8 })),
        ...((agents.data as { slug: string }[] | null) ?? []).map((a) => ({ url: `${SITE}/agents/${a.slug}/alternatives`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
        ...(PUBLIC_LANGS.includes("fr") ? await frUrls(c, now) : []),
        ...(best.error ? [] : [{ url: `${SITE}/mcp/best`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 }]),
        ...((best.data as { capability_slug: string }[] | null) ?? []).map((b) => ({ url: `${SITE}/mcp/best/${b.capability_slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 })),
      ];
    } catch {
      return core; // on any DB error, still serve a valid sitemap
    }
  }

  // tools: read the chunk in pages of 1,000 (API row limit), keep only pages with a real description
  try {
    const from = (n - 1) * SITEMAP_CHUNK;
    const out: MetadataRoute.Sitemap = [];
    for (let off = from; off < from + SITEMAP_CHUNK; off += 1000) {
      const { data } = await c.from("v_mcp_servers").select("slug,short_description,last_seen_at").order("slug").range(off, off + 999);
      const rows = (data as { slug: string; short_description: string | null; last_seen_at: string }[] | null) ?? [];
      for (const r of rows) {
        if ((r.short_description ?? "").trim().length >= MIN_DESC) out.push({ url: `${SITE}/mcp/${r.slug}`, lastModified: new Date(r.last_seen_at), changeFrequency: "weekly", priority: 0.5 });
      }
      if (rows.length < 1000) break;
    }
    return out;
  } catch {
    return [];
  }
}
