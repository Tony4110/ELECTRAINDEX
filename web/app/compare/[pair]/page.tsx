import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db, type AgentCard } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { pairSlug, parsePair } from "@/lib/compare";
import { Quality, Price, Trust } from "@/components/rank";
import { SetupNotice } from "@/components/ui";

/** Clear yes/no/unknown cell for the comparison table. */
function Bool({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <span className="badge pos">✓ Yes</span>;
  if (value === false) return <span className="badge">No</span>;
  return <span className="mono faint">—</span>;
}

export const revalidate = 3600;

type P = Promise<{ pair: string }>;

const COMPONENT_LABEL: Record<string, string> = {
  capability: "Capabilities", integration: "Integrations", documentation: "Documentation",
  pricing: "Pricing clarity", transparency: "Transparency", freshness: "Freshness", human_oversight: "Human oversight",
};

async function loadAgent(slug: string): Promise<AgentCard | null> {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_agent_cards").select("*").eq("slug", slug).maybeSingle();
  return (data as AgentCard | null) ?? null;
}

async function extras(slug: string): Promise<{ trust: string | null; caps: number }> {
  const c = db();
  if (!c) return { trust: null, caps: 0 };
  const [{ data: tr }, { count }] = await Promise.all([
    c.from("v_theme_rankings").select("trust_level").eq("provider_slug", slug).eq("provider_type", "agent").limit(1).maybeSingle(),
    c.from("v_provider_capabilities").select("capability_slug", { count: "exact", head: true }).eq("provider_slug", slug).eq("provider_type", "agent"),
  ]);
  return { trust: (tr as { trust_level: string } | null)?.trust_level ?? null, caps: count ?? 0 };
}

const startPrice = (a: AgentCard) => (a.has_free ? 0 : a.from_usd_month ?? Infinity);

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const parsed = parsePair((await params).pair);
  if (!parsed) return { title: "Not found" };
  const [a, b] = await Promise.all([loadAgent(parsed[0]), loadAgent(parsed[1])]);
  if (!a || !b) return { title: "Not found" };
  const shared = (a.theme_slugs ?? []).some((t) => (b.theme_slugs ?? []).includes(t));
  return {
    title: `${a.name} vs ${b.name}: which AI agent is better? (2026)`,
    description: `${a.name} vs ${b.name}, compared side by side on Agent Score, pricing, capabilities and trust. Every fact sourced and dated.`,
    alternates: { canonical: `/compare/${pairSlug(a.slug, b.slug)}` },
    // Only same-theme comparisons are indexable; off-theme pairs still render for visitors.
    robots: shared ? undefined : { index: false, follow: true },
  };
}

function winReasons(x: AgentCard, y: AgentCard, cx: number, cy: number): string[] {
  const r: string[] = [];
  if ((x.quality_score ?? -1) > (y.quality_score ?? -1)) r.push(`a higher Agent Score (${Math.round(x.quality_score!)} vs ${y.quality_score == null ? "—" : Math.round(y.quality_score)})`);
  if (startPrice(x) < startPrice(y)) r.push(x.has_free ? "a free plan to start" : "a lower entry price");
  if (x.has_free && !y.has_free) r.push("a free plan");
  if (cx > cy) r.push(`more documented capabilities (${cx} vs ${cy})`);
  if (x.open_source && !y.open_source) r.push("an open-source option");
  if (x.api && !y.api) r.push("a public API");
  if (x.mcp && !y.mcp) r.push("MCP support");
  return r;
}

export default async function ComparePage({ params }: { params: P }) {
  const raw = (await params).pair;
  const parsed = parsePair(raw);
  if (!parsed) notFound();
  const c = db();
  if (!c) return <SetupNotice />;

  const [a, b] = await Promise.all([loadAgent(parsed[0]), loadAgent(parsed[1])]);
  if (!a || !b) notFound();

  // one canonical URL per pair (alphabetical order)
  const canonical = pairSlug(a.slug, b.slug);
  if (raw !== canonical) redirect(`/compare/${canonical}`);

  const [ea, eb] = await Promise.all([extras(a.slug), extras(b.slug)]);
  const sharedThemes = (a.theme_slugs ?? [])
    .map((s, i) => ({ s, name: a.themes?.[i] }))
    .filter((t) => (b.theme_slugs ?? []).includes(t.s));
  const theme = sharedThemes[0];

  const ca = a.score_components ?? {};
  const cb = b.score_components ?? {};
  const compKeys = Object.keys(COMPONENT_LABEL).filter((k) => k in ca || k in cb);

  const reasonsA = winReasons(a, b, ea.caps, eb.caps);
  const reasonsB = winReasons(b, a, eb.caps, ea.caps);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${a.name} vs ${b.name}`,
    itemListElement: [a, b].map((x, i) => ({
      "@type": "ListItem", position: i + 1,
      item: { "@type": "SoftwareApplication", name: x.name, applicationCategory: "BusinessApplication", url: `https://electraindex.com/agents/${x.slug}` },
    })),
  };

  const Col = ({ x }: { x: AgentCard }) => (
    <th style={{ textAlign: "left" }}>
      <Link href={`/agents/${x.slug}`} className="strong ink">{x.name}</Link>
      {x.company ? <div className="mono faint small">{x.company}</div> : null}
    </th>
  );
  const Row = ({ label, a: va, b: vb }: { label: string; a: React.ReactNode; b: React.ReactNode }) => (
    <tr><td className="strong">{label}</td><td>{va}</td><td>{vb}</td></tr>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/compare">Compare</Link><span>/</span><span className="ink">{a.name} vs {b.name}</span>
      </nav>
      <div className="eyebrow">Comparison{theme?.name ? ` · ${theme.name}` : ""}</div>
      <h1>{a.name} vs {b.name}: which AI agent is better?</h1>
      <p className="lede">
        A side-by-side look at <strong>{a.name}</strong> and <strong>{b.name}</strong> on quality, price, capabilities and trust.
        Scores measure observable public data; prices come from each vendor&apos;s own pricing page. Every fact is sourced and dated.
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <table className="table">
          <thead><tr><th></th><Col x={a} /><Col x={b} /></tr></thead>
          <tbody>
            <Row label="Agent Score" a={<Quality score={a.quality_score} />} b={<Quality score={b.quality_score} />} />
            <Row label="Entry price" a={<Price from={a.from_usd_month} free={a.has_free} hasPricing={a.pricing_verified} />} b={<Price from={b.from_usd_month} free={b.has_free} hasPricing={b.pricing_verified} />} />
            <Row label="Trust" a={ea.trust ? <Trust level={ea.trust} /> : <span className="mono faint">—</span>} b={eb.trust ? <Trust level={eb.trust} /> : <span className="mono faint">—</span>} />
            <Row label="Capabilities documented" a={<span className="mono">{ea.caps}</span>} b={<span className="mono">{eb.caps}</span>} />
            <Row label="Free plan" a={<Bool value={a.has_free} />} b={<Bool value={b.has_free} />} />
            <Row label="Free trial" a={<Bool value={a.free_trial} />} b={<Bool value={b.free_trial} />} />
            <Row label="Public API" a={<Bool value={a.api} />} b={<Bool value={b.api} />} />
            <Row label="MCP support" a={<Bool value={a.mcp} />} b={<Bool value={b.mcp} />} />
            <Row label="Open source" a={<Bool value={a.open_source} />} b={<Bool value={b.open_source} />} />
            <Row label="Last verified" a={<span className="mono small">{shortDate(a.last_verified_at)}</span>} b={<span className="mono small">{shortDate(b.last_verified_at)}</span>} />
          </tbody>
        </table>
      </div>

      {compKeys.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head"><h2>Score breakdown</h2></div>
          <table className="table">
            <thead><tr><th>Component</th><th>{a.name}</th><th>{b.name}</th></tr></thead>
            <tbody>
              {compKeys.map((k) => (
                <tr key={k}>
                  <td className="strong">{COMPONENT_LABEL[k]}</td>
                  <td>{(a.score_missing ?? []).includes(k) || !(k in ca) ? <span className="small faint">Not measured</span> : <Quality score={ca[k]} />}</td>
                  <td>{(b.score_missing ?? []).includes(k) || !(k in cb) ? <span className="small faint">Not measured</span> : <Quality score={cb[k]} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="grid cols-2" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card-head"><h2>Choose {a.name} if…</h2></div>
          <div className="card-body">
            {reasonsA.length ? <ul>{reasonsA.map((r, i) => <li key={i}>You want {r}.</li>)}</ul> : <span className="muted">On the measured criteria, {b.name} leads — see opposite.</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Choose {b.name} if…</h2></div>
          <div className="card-body">
            {reasonsB.length ? <ul>{reasonsB.map((r, i) => <li key={i}>You want {r}.</li>)}</ul> : <span className="muted">On the measured criteria, {a.name} leads — see opposite.</span>}
          </div>
        </div>
      </section>

      <p className="lede" style={{ marginTop: 20 }}>
        See the full picture: <Link href={`/agents/${a.slug}`}>{a.name}</Link> · <Link href={`/agents/${b.slug}`}>{b.name}</Link>
        {theme ? <> · more <Link href={`/themes/${theme.s}`}>{theme.name} agents</Link></> : null} · <Link href="/compare">all comparisons</Link>.
      </p>
    </>
  );
}
