import type { Lang } from "@/lib/i18n";
import { boxT } from "@/lib/i18n-agent";

/** Outbound link through /go/ so clicks to vendor sites are counted (no personal data).
 *  `sponsored` = the destination is an affiliate link (Google requires rel="sponsored"). */
export function Out({ type, slug, to, from, className, sponsored, children }: { type: "agent" | "mcp" | "app"; slug: string; to: "website" | "pricing" | "repository"; from: string; className?: string; sponsored?: boolean; children: React.ReactNode }) {
  const href = `/go/${type}/${slug}?${new URLSearchParams({ to, from })}`;
  return <a href={href} className={className} target="_blank" rel={sponsored ? "sponsored nofollow noopener" : "nofollow noopener"}>{children}</a>;
}

/** Shown next to an affiliate link. Affiliate status is never read by the score or the ranking. */
export function AffiliateNote({ lang = "en" }: { lang?: Lang }) {
  const t = boxT(lang);
  return <p className="small muted" style={{ marginTop: 8 }}>{t.affiliate} <a href="/sources#affiliates">{t.neutral}</a></p>;
}
