/**
 * Progressive rollout of the tool page template v2.
 *   TOOLPAGE_V2        off | sample | all     (default: sample)
 *   TOOLPAGE_V2_PCT    share of tools in the sample, 0-100 (default: 5)
 *   TOOLPAGE_V2_SLUGS  extra tools always in the sample, comma separated
 * The sample is stable: a tool is in or out based on a hash of its slug.
 * Rollback = set TOOLPAGE_V2=off in Netlify and redeploy (no code change).
 */
const DEFAULT_SLUGS = ["murkuz-seo"];

function bucket(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100;
}

export function toolPageV2(slug: string): boolean {
  const mode = (process.env.TOOLPAGE_V2 ?? "sample").toLowerCase();
  if (mode === "off") return false;
  if (mode === "all") return true;
  const extra = (process.env.TOOLPAGE_V2_SLUGS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if ([...DEFAULT_SLUGS, ...extra].includes(slug)) return true;
  const pct = Math.min(100, Math.max(0, Number(process.env.TOOLPAGE_V2_PCT ?? 5) || 0));
  return bucket(slug) < pct;
}
