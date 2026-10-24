import Link from "next/link";
import { providerHref } from "@/lib/db";
import { Favicon } from "@/components/favicon";
import { dict, lhref, type Lang } from "@/lib/i18n";

export function Trust({ level, lang = "en" }: { level: string; lang?: Lang }) {
  const t = dict(lang).rank;
  if (level === "proven") return <span className="badge pos" title={t.provenTitle}>{t.proven}</span>;
  if (level === "verified") return <span className="badge accent" title={t.verifiedTitle}>{t.verified}</span>;
  return <span className="badge" title={t.declaredTitle}>{t.declared}</span>;
}

export function Coverage({ pct }: { pct: number }) {
  return (
    <span className="cov">
      <span className="cov-bar"><span style={{ width: `${pct}%` }} className={pct === 100 ? "full" : ""} /></span>
      <span className="mono small">{pct}%</span>
    </span>
  );
}

export function ProviderCell({ type, slug, name, desc, lang = "en" }: { type: string; slug: string; name: string; desc: string | null; lang?: Lang }) {
  return (
    <td>
      <Link href={lhref(lang, providerHref(type, slug))} className="strong ink">{name}</Link>
      <span className="mono faint small" style={{ marginLeft: 8 }}>{type === "agent" ? "AGENT" : "MCP"}</span>
      {desc ? <div className="desc">{desc}</div> : null}
    </td>
  );
}

export function Quality({ score, lang = "en" }: { score: number | null | undefined; lang?: Lang }) {
  if (score == null) return <span className="mono faint">—</span>;
  const n = Math.round(Number(score));
  return (
    <span className="q" title={lang === "fr" ? "Score Agent (0–100) : fonctionnalités, intégrations, documentation, clarté des prix, transparence, fraîcheur" : "Agent Score (0–100): capability, integration, documentation, pricing clarity, transparency, freshness"}>
      <b className="mono">{n}</b><span className="q-bar"><span style={{ width: `${n}%` }} /></span>
    </span>
  );
}

export function Price({ from, free, hasPricing, lang = "en" }: { from: number | null | undefined; free?: boolean; hasPricing?: boolean; lang?: Lang }) {
  const t = dict(lang).rank;
  if (from != null) return <span className="mono">${Number(from) % 1 === 0 ? Number(from).toFixed(0) : Number(from).toFixed(2)}<span className="faint small">{t.perMonth}</span>{free ? <span className="small pos-ink"> · {t.freePlanShort}</span> : null}</span>;
  if (free) return <span className="small pos-ink strong">{t.freePlan}</span>;
  if (hasPricing) return <span className="small muted">{t.onQuote}</span>;
  return <span className="small faint" title={t.noPrice}>—</span>;
}

const VALUE: Record<string, { label: string; tone: string; title: string }> = {
  best: { label: "BEST VALUE", tone: "pos", title: "Agent Score ≥ 60 and entry price ≤ $50/month (or free)" },
  premium: { label: "PREMIUM", tone: "accent", title: "Agent Score ≥ 70 and entry price above $50/month" },
  free: { label: "FREE PLAN", tone: "plain", title: "A free plan exists" },
  fair: { label: "FAIR", tone: "plain", title: "Price published, below the best-value bar" },
};
export function Value({ label, lang = "en" }: { label: string | null | undefined; lang?: Lang }) {
  if (!label) return <span className="faint small">—</span>;
  const v = VALUE[label];
  const name = (dict(lang).rank.value as Record<string, string>)[label] ?? v.label;
  return <span className={`badge ${v.tone}`} title={v.title}>{name}</span>;
}

export function KindTabs({ base, kind, counts, extra = {}, lang = "en", toolsBase }: { base: string; kind: string; counts: { agents: number; tools: number }; extra?: Record<string, string>; lang?: Lang; toolsBase?: string }) {
  const href = (k: string) => `${k === "tools" && toolsBase ? toolsBase : base}?${new URLSearchParams({ ...extra, ...(k === "agents" ? {} : { kind: k }) })}`;
  const fr = lang === "fr";
  return (
    <div className="tabs" role="tablist">
      <Link role="tab" aria-selected={kind === "agents"} href={href("agents")} className={kind === "agents" ? "on" : ""}>{fr ? "Agents IA" : "AI agents"} <span className="mono faint">{counts.agents}</span></Link>
      <Link role="tab" aria-selected={kind === "tools"} href={href("tools")} className={kind === "tools" ? "on" : ""}>{fr ? "Outils" : "Tools"} <span className="mono faint">{counts.tools.toLocaleString(fr ? "fr-FR" : "en-US")}</span></Link>
    </div>
  );
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

/** Vendor logo from its website favicon, with a letter tile underneath as fallback. */
export function Logo({ name, website, size = 32 }: { name: string; website?: string | null; size?: number }) {
  const d = domainOf(website);
  return (
    <span className="logo-tile" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
      {d ? <Favicon domain={d} size={size} /> : null}
    </span>
  );
}

export function valueOf(q: number | null, from: number | null, free: boolean): "best" | "premium" | "free" | "fair" | null {
  const s = q == null ? null : Number(q);
  const f = from == null ? null : Number(from);
  if (s != null && s >= 60 && ((f != null && f <= 50) || (f == null && free))) return "best";
  if (s != null && s >= 70 && f != null && f > 50) return "premium";
  if (free) return "free";
  if (f != null) return "fair";
  return null;
}
