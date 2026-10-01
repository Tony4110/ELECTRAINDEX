import Link from "next/link";
import { providerHref } from "@/lib/db";
import { Favicon } from "@/components/favicon";

export function Trust({ level }: { level: string }) {
  if (level === "proven") return <span className="badge pos" title="Proven: measured over time">✓✓ PROVEN</span>;
  if (level === "verified") return <span className="badge accent" title="Verified by our robots">✓ VERIFIED</span>;
  return <span className="badge" title="Declared by the publisher, not yet verified by us">DECLARED</span>;
}

export function Coverage({ pct }: { pct: number }) {
  return (
    <span className="cov">
      <span className="cov-bar"><span style={{ width: `${pct}%` }} className={pct === 100 ? "full" : ""} /></span>
      <span className="mono small">{pct}%</span>
    </span>
  );
}

export function ProviderCell({ type, slug, name, desc }: { type: string; slug: string; name: string; desc: string | null }) {
  return (
    <td>
      <Link href={providerHref(type, slug)} className="strong ink">{name}</Link>
      <span className="mono faint small" style={{ marginLeft: 8 }}>{type === "agent" ? "AGENT" : "MCP"}</span>
      {desc ? <div className="desc">{desc}</div> : null}
    </td>
  );
}

export function Quality({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="mono faint">—</span>;
  const n = Math.round(Number(score));
  return (
    <span className="q" title="Agent Score (0–100): capability, integration, documentation, pricing clarity, transparency, freshness">
      <b className="mono">{n}</b><span className="q-bar"><span style={{ width: `${n}%` }} /></span>
    </span>
  );
}

export function Price({ from, free, hasPricing }: { from: number | null | undefined; free?: boolean; hasPricing?: boolean }) {
  if (from != null) return <span className="mono">${Number(from) % 1 === 0 ? Number(from).toFixed(0) : Number(from).toFixed(2)}<span className="faint small">/mo</span>{free ? <span className="small pos-ink"> · free plan</span> : null}</span>;
  if (free) return <span className="small pos-ink strong">Free plan</span>;
  if (hasPricing) return <span className="small muted">On quote</span>;
  return <span className="small faint" title="No price published">—</span>;
}

const VALUE: Record<string, { label: string; tone: string; title: string }> = {
  best: { label: "BEST VALUE", tone: "pos", title: "Agent Score ≥ 60 and entry price ≤ $50/month (or free)" },
  premium: { label: "PREMIUM", tone: "accent", title: "Agent Score ≥ 70 and entry price above $50/month" },
  free: { label: "FREE PLAN", tone: "plain", title: "A free plan exists" },
  fair: { label: "FAIR", tone: "plain", title: "Price published, below the best-value bar" },
};
export function Value({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="faint small">—</span>;
  const v = VALUE[label];
  return <span className={`badge ${v.tone}`} title={v.title}>{v.label}</span>;
}

export function KindTabs({ base, kind, counts, extra = {} }: { base: string; kind: string; counts: { agents: number; tools: number }; extra?: Record<string, string> }) {
  const href = (k: string) => `${base}?${new URLSearchParams({ ...extra, ...(k === "agents" ? {} : { kind: k }) })}`;
  return (
    <div className="tabs" role="tablist">
      <Link role="tab" aria-selected={kind === "agents"} href={href("agents")} className={kind === "agents" ? "on" : ""}>AI agents <span className="mono faint">{counts.agents}</span></Link>
      <Link role="tab" aria-selected={kind === "tools"} href={href("tools")} className={kind === "tools" ? "on" : ""}>Tools <span className="mono faint">{counts.tools.toLocaleString("en-US")}</span></Link>
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
