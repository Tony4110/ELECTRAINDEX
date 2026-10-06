import { db, getThemes } from "@/lib/db";

/** Canonical pair slug: the two agent slugs, always alphabetical, joined by -vs-.
 *  Guarantees one URL per pair (a-vs-b === b-vs-a). */
export function pairSlug(a: string, b: string): string {
  return [a, b].sort().join("-vs-");
}

/** Split a pair slug back into its two agent slugs. */
export function parsePair(pair: string): [string, string] | null {
  const i = pair.indexOf("-vs-");
  if (i <= 0) return null;
  const a = pair.slice(0, i);
  const b = pair.slice(i + 4);
  if (!a || !b || a === b) return null;
  return [a, b];
}

export type FeaturedPair = { a: string; b: string; aName: string; bName: string };
export type ThemePairs = { theme: string; themeSlug: string; pairs: FeaturedPair[] };

/** The curated comparisons: within each theme, every pair among its top-scored
 *  agents. Same-theme only + both scored → meaningful pages, not an explosion. */
export async function featuredPairsByTheme(perTheme = 6): Promise<ThemePairs[]> {
  const c = db();
  if (!c) return [];
  const themes = await getThemes();
  const out: ThemePairs[] = [];
  for (const t of themes) {
    const { data } = await c
      .from("v_theme_rankings")
      .select("provider_slug,provider_name,quality_score")
      .eq("theme_slug", t.theme_slug)
      .eq("provider_type", "agent")
      .eq("listed_in_theme", true)
      .not("quality_score", "is", null)
      .order("quality_score", { ascending: false, nullsFirst: false })
      .limit(perTheme);
    const rows = (data as { provider_slug: string; provider_name: string }[] | null) ?? [];
    const pairs: FeaturedPair[] = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        pairs.push({ a: rows[i].provider_slug, b: rows[j].provider_slug, aName: rows[i].provider_name, bName: rows[j].provider_name });
      }
    }
    if (pairs.length) out.push({ theme: t.theme, themeSlug: t.theme_slug, pairs });
  }
  return out;
}
