import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, type AgentCard, type AgentPrice, type Signal } from "@/lib/db";
import { shortDate, EVENT_LABEL, eventTone, describeSignal } from "@/lib/format";
import { Tri, Badge, Empty, SetupNotice } from "@/components/ui";
import { Quality, Price, Trust } from "@/components/rank";
import { pairSlug } from "@/lib/compare";

type P = Promise<{ slug: string }>;

const COMPONENT_LABEL: Record<string, string> = {
  capability: "Capabilities", integration: "Integrations", documentation: "Documentation", pricing: "Pricing clarity",
  transparency: "Transparency", freshness: "Freshness", human_oversight: "Human oversight",
};
const BILLING: Record<string, string> = {
  free: "Free", subscription: "Subscription", usage: "Pay as you go", credits: "Credits", seat: "Per seat",
  one_time: "One-time", enterprise_quote: "On quote", open_source: "Open source",
};

async function load(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_agent_cards").select("*").eq("slug", slug).maybeSingle();
  return data as AgentCard | null;
}

// rendered on first visit, then cached and refreshed hourly
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const a = await load((await params).slug);
  return a ? { title: `${a.name} — pricing, quality score and alternatives`, description: a.short_description ?? `${a.name}: price plans, Agent Score and capabilities.`, alternates: { canonical: `/agents/${a.slug}` } } : { title: "Not found" };
}

function money(p: AgentPrice) {
  if (p.billing_model === "enterprise_quote" || p.amount == null) return "On quote";
  if (Number(p.amount) === 0) return "Free";
  const sym = p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : p.currency === "GBP" ? "£" : `${p.currency} `;
  const n = Number(p.amount);
  return `${sym}${n % 1 === 0 ? n.toFixed(0) : n < 1 ? n.toFixed(4).replace(/0+$/, "") : n.toFixed(2)}`;
}
const per = (p: AgentPrice) => p.interval === "month" ? "/month" : p.interval === "year" ? "/year" : p.interval === "per_unit" ? (p.unit ? ` / ${p.unit}` : " per unit") : p.interval === "one_time" ? " one-time" : "";

function EvidenceStatus({ status }: { status: "verified" | "declared" | "no" | "unknown" }) {
  if (status === "verified") return <span className="badge pos">✓ Verified</span>;
  if (status === "declared") return <span className="badge accent">Declared</span>;
  if (status === "no") return <span className="badge">No</span>;
  return <span className="mono faint small">— Unknown</span>;
}

export default async function AgentPage({ params }: { params: P }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const a = await load((await params).slug);
  if (!a) notFound();

  const [{ data: pr }, { data: caps }, { data: hist }, { data: alts }] = await Promise.all([
    c.from("v_agent_prices").select("*").eq("agent_slug", a.slug),
    c.from("v_provider_capabilities").select("capability_slug,capability,evidence_level,confidence").eq("provider_slug", a.slug).eq("provider_type", "agent").order("capability"),
    c.from("v_signals").select("*").eq("entity_slug", a.slug).eq("entity_type", "agent").order("detected_at", { ascending: false }).limit(20),
    a.theme_slugs?.length
      ? c.from("v_theme_rankings").select("provider_slug,provider_name,quality_score,from_usd_month,has_free,has_pricing").eq("theme_slug", a.theme_slugs[0]).eq("provider_type", "agent").eq("listed_in_theme", true).neq("provider_slug", a.slug).order("quality_score", { ascending: false, nullsFirst: false }).limit(6)
      : Promise.resolve({ data: [] }),
  ]);
  const prices = ((pr as AgentPrice[] | null) ?? []).sort((x, y) => (x.amount == null ? 1e12 : Number(x.amount)) - (y.amount == null ? 1e12 : Number(y.amount)));
  const capabilities = (caps as { capability_slug: string; capability: string; evidence_level: string }[] | null) ?? [];
  const declared = capabilities.filter((x) => x.evidence_level !== "derived");
  const history = (hist as Signal[] | null) ?? [];
  const alternatives = (alts as { provider_slug: string; provider_name: string; quality_score: number | null; from_usd_month: number | null; has_free: boolean; has_pricing: boolean }[] | null) ?? [];
  const comps = a.score_components ?? {};
  const lastChecked = prices.reduce<string | null>((m, p) => (!m || p.last_confirmed_at > m ? p.last_confirmed_at : m), null);

  // "Why this score?" — a plain-English rationale + evidence, built only from data we hold.
  const verifiedCaps = capabilities.filter((x) => x.evidence_level === "verified").length;
  const declaredCaps = capabilities.filter((x) => x.evidence_level === "declared").length;
  const measured = Object.entries(COMPONENT_LABEL)
    .filter(([k]) => k in comps && !(a.score_missing ?? []).includes(k))
    .map(([k, label]) => ({ label, v: Number(comps[k]) }));
  const strengths = [...measured].sort((x, y) => y.v - x.v).filter((e) => e.v >= 65).slice(0, 2).map((e) => e.label);
  const weak = [...measured].sort((x, y) => x.v - y.v).filter((e) => e.v <= 45).slice(0, 2).map((e) => e.label);
  const missingLabels = Object.entries(COMPONENT_LABEL).filter(([k]) => (a.score_missing ?? []).includes(k)).map(([, l]) => l);
  const pricingStatus: "verified" | "declared" | "unknown" = a.pricing_verified ? "verified" : prices.length ? "declared" : "unknown";
  const boolStatus = (v: boolean | null | undefined): "declared" | "no" | "unknown" => (v === true ? "declared" : v === false ? "no" : "unknown");
  const whyText = [
    a.quality_score != null ? `Agent Score ${Math.round(a.quality_score)}/100.` : "Not scored yet.",
    strengths.length ? `Strongest on ${strengths.join(" and ")}.` : "",
    weak.length ? `Thinner on ${weak.join(" and ")}.` : "",
    a.pricing_verified ? "Pricing read on the vendor's own page." : prices.length ? "Pricing stated by the vendor, not yet verified." : "No pricing published.",
    missingLabels.length ? `${missingLabels.length} criteria not measured yet — shown as Unknown, never counted as a failure.` : "",
  ].filter(Boolean).join(" ");

  const jsonLd = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: a.name, description: a.short_description ?? undefined,
    applicationCategory: "BusinessApplication", url: a.website ?? undefined,
    offers: prices.filter((p) => p.amount != null).map((p) => ({ "@type": "Offer", name: p.plan_name, price: Number(p.amount), priceCurrency: p.currency })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/agents">AI agents</Link><span>/</span>
        {a.theme_slugs?.[0] ? <><Link href={`/themes/${a.theme_slugs[0]}`}>{a.themes?.[0]}</Link><span>/</span></> : null}
        <span className="ink">{a.name}</span></nav>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ width: 64, height: 64, borderRadius: 14, background: "var(--ink)", color: "#fff", fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{a.name.charAt(0).toUpperCase()}</span>
        <div>
          <h1 style={{ margin: 0 }}>{a.name}</h1>
          <div className="small muted">{a.company ? <>by <span className="ink strong">{a.company}</span> · </> : null}{(a.themes ?? []).join(" · ")}</div>
        </div>
      </div>
      <p className="lede" style={{ marginTop: 16 }}>{a.short_description ?? "No description published."}</p>
      <div className="chips" style={{ marginTop: 16 }}>
        {a.website ? <a className="btn primary" href={a.website} target="_blank" rel="noopener noreferrer">Visit website ↗</a> : null}
        {a.pricing_url ? <a className="btn" href={a.pricing_url} target="_blank" rel="noopener noreferrer">Official pricing ↗</a> : null}
      </div>

      <div className="kv" style={{ marginTop: 28 }}>
        <div><span className="small muted">Agent Score</span><span><Quality score={a.quality_score} /></span></div>
        <div><span className="small muted">From</span><b style={{ fontSize: 18 }}><Price from={a.from_usd_month} free={a.has_free} hasPricing={prices.length > 0} /></b></div>
        <div><span className="small muted">Trust</span><span><Trust level={a.pricing_verified ? "verified" : "declared"} /></span></div>
        <div><span className="small muted">API</span><span><Tri label={a.api === true ? "YES" : a.api === false ? "NO" : "NOT DOCUMENTED"} value={a.api} /></span></div>
        <div><span className="small muted">MCP server</span><span><Tri label={a.mcp === true ? "YES" : a.mcp === false ? "NO" : "NOT DOCUMENTED"} value={a.mcp} /></span></div>
        <div><span className="small muted">Open source</span><span><Tri label={a.open_source === true ? "YES" : a.open_source === false ? "NO" : "NOT DOCUMENTED"} value={a.open_source} /></span></div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <h2>Why this score?</h2>
          <span className="small muted">Methodology {a.methodology_version ?? "1.0"} · confidence {a.score_confidence ?? "—"}{a.last_verified_at ? ` · verified ${shortDate(a.last_verified_at)}` : ""}</span>
        </div>
        <div className="card-body">
          <p className="small" style={{ marginTop: 0 }}>{whyText}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Claim</th><th>Evidence</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td className="strong">Pricing</td><td className="small muted">Vendor pricing page</td><td><EvidenceStatus status={pricingStatus} /></td></tr>
                <tr><td className="strong">Capabilities</td><td className="small muted">{verifiedCaps} verified · {declaredCaps} declared</td><td><EvidenceStatus status={verifiedCaps > 0 ? "verified" : declaredCaps > 0 ? "declared" : "unknown"} /></td></tr>
                <tr><td className="strong">Public API</td><td className="small muted">Vendor site / docs</td><td><EvidenceStatus status={boolStatus(a.api)} /></td></tr>
                <tr><td className="strong">MCP support</td><td className="small muted">Vendor site / docs</td><td><EvidenceStatus status={boolStatus(a.mcp)} /></td></tr>
                <tr><td className="strong">Open source</td><td className="small muted">Repository / vendor</td><td><EvidenceStatus status={boolStatus(a.open_source)} /></td></tr>
              </tbody>
            </table>
          </div>
          <p className="small faint" style={{ marginTop: 10 }}>No source → no claim. Criteria we can&apos;t evidence score 0 and read &ldquo;Unknown&rdquo; — never a guess. Unknown ≠ false.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Pricing</h2><span className="small muted">{a.pricing_verified ? "Read on the vendor's pricing page" : "Stated by the vendor, not yet verified"}{lastChecked ? ` · checked ${shortDate(lastChecked)}` : ""}</span></div>
        <div className="card-body">
          {prices.length === 0 ? <span className="muted">No price published.</span> : (
            <div className="plans">
              {prices.map((p) => (
                <div className="plan" key={p.plan_name}>
                  <span className="small muted">{p.plan_name}</span>
                  <span className="amt">{money(p)}<span className="small muted" style={{ fontFamily: "var(--sans)" }}>{p.amount != null && Number(p.amount) > 0 ? per(p) : ""}</span></span>
                  <span className="small faint">{BILLING[p.billing_model] ?? p.billing_model}{p.unit && p.interval !== "per_unit" && !(BILLING[p.billing_model] ?? "").toLowerCase().includes(p.unit.toLowerCase()) ? ` · ${p.unit}` : ""}{p.is_trial ? " · trial" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="grid cols-3" style={{ marginTop: 24 }}>
        <div className="card span-2">
          <div className="card-head"><h2>Capabilities</h2><span className="small muted">As stated on the vendor&apos;s website</span></div>
          <div className="card-body">
            {declared.length === 0 ? <span className="muted">No capability documented yet.</span> : (
              <div className="chips" style={{ marginTop: 0 }}>
                {declared.map((x) => <Link key={x.capability_slug} href={`/capabilities#${x.capability_slug}`} className="chip acc">{x.capability}</Link>)}
              </div>
            )}
          </div>
          <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}><h2>Score breakdown</h2><span className="small muted">Methodology {a.methodology_version ?? "1.0"} · confidence {a.score_confidence ?? "—"}</span></div>
          <div className="table-wrap">
            <table>
              <tbody>
                {Object.entries(COMPONENT_LABEL).filter(([k]) => k in comps).map(([k, label]) => (
                  <tr key={k}><td className="strong">{label}</td><td style={{ width: "60%" }}>{(a.score_missing ?? []).includes(k) ? <span className="small faint">Not measured yet</span> : <Quality score={comps[k]} />}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Alternatives</h2></div>
          {alternatives.length === 0 ? <div className="card-body"><span className="muted">None listed yet.</span></div> : (
            <ul className="signals">
              {alternatives.map((x) => (
                <li className="signal" key={x.provider_slug}>
                  <div className="signal-top"><Link href={`/agents/${x.provider_slug}`} className="strong ink">{x.provider_name}</Link><span className="spacer" /><Quality score={x.quality_score} /></div>
                  <div className="small"><Price from={x.from_usd_month} free={x.has_free} hasPricing={x.has_pricing} /> · <Link href={`/compare/${pairSlug(a.slug, x.provider_slug)}`}>Compare →</Link></div>
                </li>
              ))}
            </ul>
          )}
          <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}><h2>Price history</h2></div>
          {history.length === 0 ? <div className="card-body"><Empty title="Baseline">No change yet. Every price change will appear here with its date.</Empty></div> : (
            <ul className="signals">
              {history.map((h) => (
                <li className="signal" key={h.id}>
                  <div className="signal-top"><Badge tone={eventTone(h.event_type)}>{EVENT_LABEL[h.event_type] ?? h.event_type}</Badge><span className="mono small muted">{shortDate(h.detected_at)}</span></div>
                  <div className="muted">{describeSignal(h)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
