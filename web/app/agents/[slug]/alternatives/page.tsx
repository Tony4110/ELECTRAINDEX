import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, type AgentCard } from "@/lib/db";
import { SITE } from "@/lib/site";
import { pairSlug } from "@/lib/compare";
import { Empty, SetupNotice } from "@/components/ui";
import { Quality, Price } from "@/components/rank";

export const revalidate = 3600;
export async function generateStaticParams() { return []; }

type P = Promise<{ slug: string }>;
type Card = Pick<AgentCard, "slug" | "name" | "short_description" | "quality_score" | "from_usd_month" | "has_free" | "theme_slugs">;
type Alt = Card & { shared: string[] };
const MIN_ALTS = 3;
const list = (n: string[]) => n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
const usd = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

async function build(slug: string) {
  const c = db();
  if (!c) return null;
  const { data: a } = await c.from("v_agent_cards").select("slug,name,short_description,quality_score,from_usd_month,has_free,theme_slugs").eq("slug", slug).maybeSingle();
  if (!a) return null;
  const agent = a as Card;
  const { data: mine } = await c.from("v_provider_capabilities").select("capability_slug,capability").eq("provider_type", "agent").eq("provider_slug", slug);
  // one row per capability (a capability can have several evidence rows)
  const caps = Array.from(new Map(((mine as { capability_slug: string; capability: string }[] | null) ?? []).map((x) => [x.capability_slug, x])).values());
  const capName = new Map(caps.map((x) => [x.capability_slug, x.capability]));
  const sharedSet = new Map<string, Set<string>>();
  if (caps.length) {
    const { data: others } = await c.from("v_provider_capabilities").select("provider_slug,capability_slug").eq("provider_type", "agent").in("capability_slug", caps.map((x) => x.capability_slug)).neq("provider_slug", slug).limit(5000);
    for (const r of (others as { provider_slug: string; capability_slug: string }[] | null) ?? []) {
      if (!sharedSet.has(r.provider_slug)) sharedSet.set(r.provider_slug, new Set());
      sharedSet.get(r.provider_slug)!.add(capName.get(r.capability_slug) ?? r.capability_slug);
    }
  }
  const shared = new Map(Array.from(sharedSet.entries()).map(([k, v]) => [k, Array.from(v)]));
  // closest first: most shared capabilities, then same theme
  const theme = agent.theme_slugs?.[0];
  const minShared = caps.length >= 3 ? 2 : 1; // one shared capability out of many is not an alternative
  const candidates = Array.from(shared.entries()).filter(([, v]) => v.length >= minShared).sort((x, y) => y[1].length - x[1].length).slice(0, 60).map(([s]) => s);
  const { data: cards } = candidates.length
    ? await c.from("v_agent_cards").select("slug,name,short_description,quality_score,from_usd_month,has_free,theme_slugs").in("slug", candidates)
    : { data: [] };
  const alts: Alt[] = ((cards as Card[] | null) ?? []).map((x) => ({ ...x, shared: shared.get(x.slug) ?? [] }))
    .sort((x, y) => y.shared.length - x.shared.length
      || Number(!!theme && !!y.theme_slugs?.includes(theme)) - Number(!!theme && !!x.theme_slugs?.includes(theme))
      || (y.quality_score ?? -1) - (x.quality_score ?? -1))
    .slice(0, 15);
  return { agent, caps, alts };
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const r = await build((await params).slug);
  if (!r) return { title: "Not found" };
  const { agent, alts } = r;
  return {
    title: `${agent.name} alternatives (${new Date().getFullYear()}): ${alts.length} similar AI agents compared`,
    description: `The closest alternatives to ${agent.name}${alts.length ? `: ${list(alts.slice(0, 3).map((x) => x.name))}` : ""}. Shared capabilities, Agent Score and starting price, from sourced data.`,
    alternates: { canonical: `/agents/${agent.slug}/alternatives` },
    robots: alts.length < MIN_ALTS ? { index: false, follow: true } : undefined,
  };
}

export default async function Alternatives({ params }: { params: P }) {
  if (!db()) return <SetupNotice />;
  const r = await build((await params).slug);
  if (!r) notFound();
  const { agent, caps, alts } = r;
  const priced = alts.filter((x) => x.from_usd_month != null).sort((x, y) => Number(x.from_usd_month) - Number(y.from_usd_month));
  const cheaper = agent.from_usd_month != null ? priced.filter((x) => Number(x.from_usd_month) < Number(agent.from_usd_month)) : [];
  const free = alts.filter((x) => x.has_free);
  const best = alts.filter((x) => x.quality_score != null).sort((x, y) => Number(y.quality_score) - Number(x.quality_score))[0];

  const faq: { q: string; a: string }[] = [];
  if (alts.length) faq.push({ q: `What are the best alternatives to ${agent.name}?`, a: `The closest are ${list(alts.slice(0, 3).map((x) => x.name))}: they share the most documented capabilities with ${agent.name}.${best ? ` Across all ${alts.length} alternatives, the highest Agent Score is ${best.name} (${Math.round(Number(best.quality_score))}/100).` : ""}` });
  if (agent.from_usd_month != null) faq.push({ q: `Is there a cheaper alternative to ${agent.name}?`, a: cheaper.length ? `Yes. ${agent.name} starts at ${usd(Number(agent.from_usd_month))}/month; ${list(cheaper.slice(0, 3).map((x) => `${x.name} (${usd(Number(x.from_usd_month))}/month)`))} start lower, based on listed prices.` : `Among the closest alternatives with a listed monthly price, none starts below ${agent.name} (${usd(Number(agent.from_usd_month))}/month).` });
  faq.push({ q: `Is there a free alternative to ${agent.name}?`, a: free.length ? `${list(free.slice(0, 3).map((x) => x.name))} ${free.length === 1 ? "has" : "have"} a free plan or free tier, according to their pricing pages.` : `None of the closest alternatives lists a free plan right now.` });

  const url = `${SITE}/agents/${agent.slug}/alternatives`;
  const ld = [
    { "@context": "https://schema.org", "@type": "ItemList", name: `${agent.name} alternatives`, url, numberOfItems: alts.length,
      itemListElement: alts.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/agents/${x.slug}`, name: x.name })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Agents", item: `${SITE}/agents` },
      { "@type": "ListItem", position: 2, name: agent.name, item: `${SITE}/agents/${agent.slug}` },
      { "@type": "ListItem", position: 3, name: "Alternatives", item: url } ] },
  ];

  return (
    <>
      {ld.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/agents">Agents</Link><span>/</span><Link href={`/agents/${agent.slug}`}>{agent.name}</Link><span>/</span><span className="ink">Alternatives</span></nav>
      <div className="eyebrow">Alternatives</div>
      <h1>{agent.name} alternatives</h1>
      <p className="lede">
        {alts.length
          ? <>{alts.length} AI agents do some of what <Link href={`/agents/${agent.slug}`}>{agent.name}</Link> does. Closest: {alts.slice(0, 3).map((x, i) => <span key={x.slug}>{i ? (i === Math.min(3, alts.length) - 1 ? " and " : ", ") : ""}<Link href={`/agents/${x.slug}`}>{x.name}</Link></span>)}.{priced[0] ? <> Lowest listed starting price: {priced[0].name} at {usd(Number(priced[0].from_usd_month))}/month.</> : null}</>
          : <>No other agent in the index documents the same capabilities as {agent.name} yet.</>}
      </p>
      {caps.length ? <div className="chips"><span className="small muted">{agent.name} capabilities:</span>{caps.map((x) => <Link key={x.capability_slug} href={`/capabilities#${x.capability_slug}`} className="chip acc">{x.capability}</Link>)}</div> : null}

      <div className="card table-wrap" style={{ marginTop: 16 }}>
        {alts.length === 0 ? <div className="card-body"><Empty title="No alternative yet">Capabilities come from vendor websites. Nothing is listed on guesswork.</Empty></div> : (
          <table>
            <thead><tr><th>#</th><th>Agent</th><th>In common with {agent.name}</th><th>Agent Score</th><th>From</th><th></th></tr></thead>
            <tbody>
              {alts.map((x, i) => (
                <tr key={x.slug}>
                  <td className="rank-num">{i + 1}</td>
                  <td><Link href={`/agents/${x.slug}`} className="strong ink">{x.name}</Link>{x.short_description ? <div className="desc">{x.short_description}</div> : null}</td>
                  <td className="small"><b>{x.shared.length} of {caps.length}</b><div className="muted">{x.shared.join(" · ")}</div></td>
                  <td><Quality score={x.quality_score} /></td>
                  <td><Price from={x.from_usd_month} free={x.has_free} hasPricing /></td>
                  <td><Link className="small" href={`/compare/${pairSlug(agent.slug, x.slug)}`}>Compare →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>FAQ</h2></div>
        <div className="card-body">{faq.map((f) => <details key={f.q} open><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
      <p className="note">How alternatives are chosen: agents that document the most capabilities in common with {agent.name} come first, then agents in the same theme, then by Agent Score. Capabilities and prices come from vendor websites, with sources and dates on each agent&apos;s page. No vendor pays to appear here, and affiliate links never change this order.</p>
    </>
  );
}
