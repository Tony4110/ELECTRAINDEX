import Link from "next/link";
import { Out, AffiliateNote } from "@/components/out";
import { StatusBadges } from "@/components/status";
import { ReportBox, type ReportStatus } from "@/components/report-box";
import { FollowBox } from "@/components/follow-box";
import { ShareRow, PublisherKit } from "@/components/share";
import { timeAgo } from "@/lib/format";
import { db, type AgentCard, type AgentPrice, type Signal } from "@/lib/db";
import { shortDate, eventLabel, eventTone, describeSignal } from "@/lib/format";
import { Tri, Badge, Empty, SetupNotice } from "@/components/ui";
import { Quality, Price, Trust } from "@/components/rank";
import SponsorSlot from "@/components/sponsor-slot";
import { pairSlug } from "@/lib/compare";
import { lhref, themeName, type Lang } from "@/lib/i18n";
import { agentT, capName, type AgentDict } from "@/lib/i18n-agent";

const COMPONENT_KEYS = ["capability", "integration", "documentation", "pricing", "transparency", "freshness", "human_oversight"];

export async function loadAgent(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_agent_cards").select("*").eq("slug", slug).maybeSingle();
  return data as AgentCard | null;
}

/** Translated description, or null when this language has none yet. */
export async function loadAgentText(slug: string, lang: Lang) {
  if (lang === "en") return null;
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_agent_i18n").select("short_description").eq("slug", slug).eq("lang", lang).maybeSingle();
  return (data as { short_description: string } | null)?.short_description ?? null;
}

/** All translated agent descriptions of a language (slug -> text), for ranking tables. */
export async function loadAgentTexts(lang: Lang): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (lang === "en") return m;
  const c = db();
  if (!c) return m;
  const { data } = await c.from("v_agent_i18n").select("slug,short_description").eq("lang", lang).limit(5000);
  for (const r of (data as { slug: string; short_description: string }[] | null) ?? []) m.set(r.slug, r.short_description);
  return m;
}

function money(p: AgentPrice, t: AgentDict) {
  if (p.billing_model === "enterprise_quote" || p.amount == null) return t.onQuote;
  if (Number(p.amount) === 0) return t.free;
  const sym = p.currency === "USD" ? "$" : p.currency === "EUR" ? "€" : p.currency === "GBP" ? "£" : `${p.currency} `;
  const n = Number(p.amount);
  return `${sym}${n % 1 === 0 ? n.toFixed(0) : n < 1 ? n.toFixed(4).replace(/0+$/, "") : n.toFixed(2)}`;
}
const per = (p: AgentPrice, t: AgentDict) => p.interval === "month" ? t.month : p.interval === "year" ? t.year : p.interval === "per_unit" ? (p.unit ? ` / ${p.unit}` : t.perUnit) : p.interval === "one_time" ? t.oneTime : "";

function EvidenceStatus({ status, t }: { status: "verified" | "declared" | "no" | "unknown"; t: AgentDict }) {
  if (status === "verified") return <span className="badge pos">{t.ev.verified}</span>;
  if (status === "declared") return <span className="badge accent">{t.ev.declared}</span>;
  if (status === "no") return <span className="badge">{t.ev.no}</span>;
  return <span className="mono faint small">{t.ev.unknown}</span>;
}

export async function AgentView({ a, lang = "en", text }: { a: AgentCard; lang?: Lang; text?: string | null }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const t = agentT(lang);
  const L = (p: string) => lhref(lang, p);
  const COMPONENT_LABEL: Record<string, string> = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, t.components[k]]));
  const desc = text ?? a.short_description;
  const self = L(`/agents/${a.slug}`);
  const conf = (v: string | null | undefined) => (v ? (lang === "fr" ? ({ high: "élevée", medium: "moyenne", low: "faible" } as Record<string, string>)[v] ?? v : v) : "—");

  const [{ data: pr }, { data: caps }, { data: hist }, { data: alts }, { data: aff }, { data: rep }] = await Promise.all([
    c.from("v_agent_prices").select("*").eq("agent_slug", a.slug),
    c.from("v_provider_capabilities").select("capability_slug,capability,evidence_level,confidence").eq("provider_slug", a.slug).eq("provider_type", "agent").order("capability"),
    c.from("v_signals").select("*").eq("entity_slug", a.slug).eq("entity_type", "agent").order("detected_at", { ascending: false }).limit(20),
    a.theme_slugs?.length
      ? c.from("v_theme_rankings").select("provider_slug,provider_name,quality_score,from_usd_month,has_free,has_pricing").eq("theme_slug", a.theme_slugs[0]).eq("provider_type", "agent").eq("listed_in_theme", true).neq("provider_slug", a.slug).order("quality_score", { ascending: false, nullsFirst: false }).limit(6)
      : Promise.resolve({ data: [] }),
    c.from("v_affiliate_flags").select("slug").eq("type", "agent").eq("slug", a.slug).maybeSingle().then((r) => (r.error ? { data: null } : r)),
    c.from("v_report_status").select("open_reports,under_review,last_rechecked_ok_at").eq("entity_type", "agent").eq("slug", a.slug).maybeSingle().then((r) => (r.error ? { data: null } : r)),
  ]);
  const reportStatus = rep as ReportStatus;
  const affiliate = !!aff;
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
    a.quality_score != null ? t.whyScore(Math.round(a.quality_score)) : t.notScored,
    strengths.length ? t.strongest(strengths) : "",
    weak.length ? t.thinner(weak) : "",
    a.pricing_verified ? t.pricingRead : prices.length ? t.pricingStated : t.noPricing,
    missingLabels.length ? t.notMeasured(missingLabels.length) : "",
  ].filter(Boolean).join(" ");

  const jsonLd = {
    "@context": "https://schema.org", "@type": "SoftwareApplication", name: a.name, description: desc ?? undefined, inLanguage: lang,
    applicationCategory: "BusinessApplication", url: a.website ?? undefined,
    offers: prices.filter((p) => p.amount != null).map((p) => ({ "@type": "Offer", name: p.plan_name, price: Number(p.amount), priceCurrency: p.currency })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={lang === "en" ? "/agents" : L("/")}>{t.crumbAgents}</Link><span>/</span>
        {a.theme_slugs?.[0] ? <><Link href={L(`/themes/${a.theme_slugs[0]}`)}>{themeName(lang, a.theme_slugs[0], a.themes?.[0] ?? "")}</Link><span>/</span></> : null}
        <span className="ink">{a.name}</span></nav>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ width: 64, height: 64, borderRadius: 14, background: "var(--ink)", color: "#fff", fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{a.name.charAt(0).toUpperCase()}</span>
        <div>
          <h1 style={{ margin: 0 }}>{a.name}</h1>
          <div className="small muted">{a.company ? <>{t.by} <span className="ink strong">{a.company}</span> · </> : null}{(a.themes ?? []).map((n, i) => themeName(lang, a.theme_slugs?.[i] ?? "", n)).join(" · ")}</div>
        </div>
      </div>
      <StatusBadges verifiedAt={a.last_verified_at} sourceChecked={!!a.pricing_verified}
        changedAt={history.find((h) => /price|plan/.test(h.event_type))?.detected_at} changedLabel={t.priceChange} lang={lang} />
      <p className="lede" style={{ marginTop: 16 }}>{desc ?? t.noDesc}</p>
      <div className="chips" style={{ marginTop: 16 }}>
        {a.website ? <Out type="agent" slug={a.slug} to="website" from={self} className="btn primary" sponsored={affiliate}>{t.visit}</Out> : null}
        {a.pricing_url ? <Out type="agent" slug={a.slug} to="pricing" from={self} className="btn">{t.officialPricing}</Out> : null}
      </div>
      {affiliate && a.website ? <AffiliateNote lang={lang} /> : null}
      <ShareRow kind="agent" slug={a.slug} name={a.name} lang={lang} />

      <div className="kv" style={{ marginTop: 28 }}>
        <div><span className="small muted">{t.kv.score}</span><span><Quality score={a.quality_score} lang={lang} /></span></div>
        <div><span className="small muted">{t.kv.from}</span><b style={{ fontSize: 18 }}><Price from={a.from_usd_month} free={a.has_free} hasPricing={prices.length > 0} lang={lang} /></b></div>
        <div><span className="small muted">{t.kv.trust}</span><span><Trust level={a.pricing_verified ? "verified" : "declared"} lang={lang} /></span></div>
        <div><span className="small muted">{t.kv.api}</span><span><Tri label={a.api === true ? t.kv.yes : a.api === false ? t.kv.no : t.kv.nd} value={a.api} lang={lang} /></span></div>
        <div><span className="small muted">{t.kv.mcp}</span><span><Tri label={a.mcp === true ? t.kv.yes : a.mcp === false ? t.kv.no : t.kv.nd} value={a.mcp} lang={lang} /></span></div>
        <div><span className="small muted">{t.kv.oss}</span><span><Tri label={a.open_source === true ? t.kv.yes : a.open_source === false ? t.kv.no : t.kv.nd} value={a.open_source} lang={lang} /></span></div>
      </div>

      <div className="agent-bottom">
      <div className="agent-left">
      <div className="card">
        <div className="card-head">
          <h2>{t.why}</h2>
          <span className="small muted">{t.methodology} {a.methodology_version ?? "1.0"} · {t.confidence} {conf(a.score_confidence)}{a.last_verified_at ? ` · ${t.verifiedOn} ${shortDate(a.last_verified_at, lang)}` : ""}</span>
        </div>
        <div className="card-body">
          <p className="small" style={{ marginTop: 0 }}>{whyText}</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.thClaim}</th><th>{t.thEvidence}</th><th>{t.thStatus}</th></tr></thead>
              <tbody>
                <tr><td className="strong">{t.rowPricing}</td><td className="small muted">{t.rowPricingEv}</td><td><EvidenceStatus status={pricingStatus} t={t} /></td></tr>
                <tr><td className="strong">{t.rowCaps}</td><td className="small muted">{t.capsEv(verifiedCaps, declaredCaps)}</td><td><EvidenceStatus status={verifiedCaps > 0 ? "verified" : declaredCaps > 0 ? "declared" : "unknown"} t={t} /></td></tr>
                <tr><td className="strong">{t.rowApi}</td><td className="small muted">{t.siteDocs}</td><td><EvidenceStatus status={boolStatus(a.api)} t={t} /></td></tr>
                <tr><td className="strong">{t.rowMcp}</td><td className="small muted">{t.siteDocs}</td><td><EvidenceStatus status={boolStatus(a.mcp)} t={t} /></td></tr>
                <tr><td className="strong">{t.rowOss}</td><td className="small muted">{t.repoVendor}</td><td><EvidenceStatus status={boolStatus(a.open_source)} t={t} /></td></tr>
              </tbody>
            </table>
          </div>
          <p className="small faint" style={{ marginTop: 10 }}>{t.rule}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>{t.pricing}</h2><span className="small muted">{a.pricing_verified ? t.readOnPage : t.statedNotVerified}{lastChecked ? ` · ${t.checked} ${shortDate(lastChecked, lang)}` : ""}</span></div>
        <div className="card-body">
          {prices.length === 0 ? <span className="muted">{t.noPrice}</span> : (
            <div className="plans">
              {prices.map((p) => (
                <div className="plan" key={p.plan_name}>
                  <span className="small muted">{p.plan_name}</span>
                  <span className="amt">{money(p, t)}<span className="small muted" style={{ fontFamily: "var(--sans)" }}>{p.amount != null && Number(p.amount) > 0 ? per(p, t) : ""}</span></span>
                  <span className="small faint">{t.billing[p.billing_model] ?? p.billing_model}{p.unit && p.interval !== "per_unit" && !(p.billing_model === "seat" && /seat|user/i.test(p.unit)) && !(t.billing[p.billing_model] ?? "").toLowerCase().includes(p.unit.toLowerCase()) ? ` · ${p.unit}` : ""}{p.is_trial ? ` · ${t.trial}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

        <div className="card">
          <div className="card-head"><h2>{t.capabilities}</h2><span className="small muted">{t.asStated}</span></div>
          <div className="card-body">
            {declared.length === 0 ? <span className="muted">{t.noCap}</span> : (
              <div className="chips" style={{ marginTop: 0 }}>
                {declared.map((x) => <Link key={x.capability_slug} href={`/capabilities#${x.capability_slug}`} className="chip acc">{capName(lang, x.capability_slug, x.capability)}</Link>)}
              </div>
            )}
          </div>
          <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}><h2>{t.breakdown}</h2><span className="small muted">{t.methodology} {a.methodology_version ?? "1.0"} · {t.confidence} {conf(a.score_confidence)}</span></div>
          <div className="table-wrap">
            <table>
              <tbody>
                {Object.entries(COMPONENT_LABEL).filter(([k]) => k in comps).map(([k, label]) => (
                  <tr key={k}><td className="strong">{label}</td><td style={{ width: "60%" }}>{(a.score_missing ?? []).includes(k) ? <span className="small faint">{t.notMeasuredYet}</span> : <Quality score={comps[k]} lang={lang} />}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="agent-right">
        <div className="agent-sponsor-zone">
          <SponsorSlot site="electra" slot="agent-page" variant="halfpage" lang={lang} />
        </div>
        <div className="card">
          <div className="card-head"><h2>{t.alternatives}</h2><Link className="small" href={`/agents/${a.slug}/alternatives`}>{t.seeAll}</Link></div>
          {alternatives.length === 0 ? <div className="card-body"><span className="muted">{t.noneListed}</span></div> : (
            <ul className="signals">
              {alternatives.map((x) => (
                <li className="signal" key={x.provider_slug}>
                  <div className="signal-top"><Link href={L(`/agents/${x.provider_slug}`)} className="strong ink">{x.provider_name}</Link><span className="spacer" /><Quality score={x.quality_score} lang={lang} /></div>
                  <div className="small"><Price from={x.from_usd_month} free={x.has_free} hasPricing={x.has_pricing} lang={lang} /> · <Link href={`/compare/${pairSlug(a.slug, x.provider_slug)}`}>{t.compare}</Link></div>
                </li>
              ))}
            </ul>
          )}
          <div className="card-body list-cta">
            <p className="small" style={{ margin: 0 }}><b>{t.builtAlt(a.name)}</b>{t.listFree(a.name)}</p>
            <Link href={L("/submit")} className="btn primary" style={{ marginTop: 8 }}>{t.listBtn}</Link>
          </div>
          <div className="card-head" style={{ borderTop: "1px solid var(--line)" }}><h2>{t.history}</h2></div>
          {history.length === 0 ? <div className="card-body"><Empty title={t.baseline}>{t.baselineText}</Empty></div> : (
            <ul className="signals">
              {history.map((h) => (
                <li className="signal" key={h.id}>
                  <div className="signal-top"><Badge tone={eventTone(h.event_type)}>{eventLabel(h.event_type, lang)}</Badge><span className="mono small muted">{shortDate(h.detected_at, lang)}</span></div>
                  <div className="muted">{describeSignal(h, lang)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      </div>
      <ReportBox type="agent" slug={a.slug} status={reportStatus} lang={lang}
        recheckedAgo={reportStatus?.last_rechecked_ok_at && Date.now() - new Date(reportStatus.last_rechecked_ok_at).getTime() < 14 * 86_400_000 ? timeAgo(reportStatus.last_rechecked_ok_at, lang) : null} />
      <FollowBox type="agent" slug={a.slug} name={a.name} lang={lang} />
      <PublisherKit kind="agent" slug={a.slug} name={a.name} lang={lang} />
    </>
  );
}
