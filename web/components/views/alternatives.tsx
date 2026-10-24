import Link from "next/link";
import type { Metadata } from "next";
import { db, type AgentCard } from "@/lib/db";
import { SITE } from "@/lib/site";
import { pairSlug } from "@/lib/compare";
import { Empty, SetupNotice } from "@/components/ui";
import { Quality, Price } from "@/components/rank";
import { lhref, type Lang } from "@/lib/i18n";
import { capName } from "@/lib/i18n-agent";
import { loadAgentTexts } from "@/components/views/agent";

type Card = Pick<AgentCard, "slug" | "name" | "short_description" | "quality_score" | "from_usd_month" | "has_free" | "theme_slugs">;
type Alt = Card & { shared: string[] };
const MIN_ALTS = 3;
const listOf = (lang: Lang) => (n: string[]) => n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} ${lang === "fr" ? "et" : "and"} ${n[n.length - 1]}`;
const usdOf = (lang: Lang) => (n: number) => lang === "fr" ? `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2).replace(".", ",")} $` : `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

export async function buildAlternatives(slug: string, lang: Lang = "en") {
  const c = db();
  if (!c) return null;
  const { data: a } = await c.from("v_agent_cards").select("slug,name,short_description,quality_score,from_usd_month,has_free,theme_slugs").eq("slug", slug).maybeSingle();
  if (!a) return null;
  const agent = a as Card;
  const { data: mine } = await c.from("v_provider_capabilities").select("capability_slug,capability").eq("provider_type", "agent").eq("provider_slug", slug);
  // one row per capability (a capability can have several evidence rows)
  const caps = Array.from(new Map(((mine as { capability_slug: string; capability: string }[] | null) ?? []).map((x) => [x.capability_slug, x])).values());
  const capNames = new Map(caps.map((x) => [x.capability_slug, capName(lang, x.capability_slug, x.capability)]));
  const sharedSet = new Map<string, Set<string>>();
  if (caps.length) {
    const { data: others } = await c.from("v_provider_capabilities").select("provider_slug,capability_slug").eq("provider_type", "agent").in("capability_slug", caps.map((x) => x.capability_slug)).neq("provider_slug", slug).limit(5000);
    for (const r of (others as { provider_slug: string; capability_slug: string }[] | null) ?? []) {
      if (!sharedSet.has(r.provider_slug)) sharedSet.set(r.provider_slug, new Set());
      sharedSet.get(r.provider_slug)!.add(capNames.get(r.capability_slug) ?? r.capability_slug);
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
  if (lang !== "en") {
    const texts = await loadAgentTexts(lang);
    agent.short_description = texts.get(agent.slug) ?? null;
    for (const x of alts) x.short_description = texts.get(x.slug) ?? null;
    for (const x of caps) x.capability = capNames.get(x.capability_slug) ?? x.capability;
  }
  return { agent, caps, alts };
}

export function alternativesMeta(r: NonNullable<Awaited<ReturnType<typeof buildAlternatives>>>, lang: Lang = "en"): Metadata {
  const { agent, alts } = r;
  const list = listOf(lang);
  const fr = lang === "fr";
  return {
    title: fr ? `Alternatives à ${agent.name} (${new Date().getFullYear()}) : ${alts.length} agents IA similaires comparés` : `${agent.name} alternatives (${new Date().getFullYear()}): ${alts.length} similar AI agents compared`,
    description: fr
      ? `Les alternatives les plus proches de ${agent.name}${alts.length ? ` : ${list(alts.slice(0, 3).map((x) => x.name))}` : ""}. Fonctionnalités communes, Score Agent et prix d'entrée, à partir de données sourcées.`
      : `The closest alternatives to ${agent.name}${alts.length ? `: ${list(alts.slice(0, 3).map((x) => x.name))}` : ""}. Shared capabilities, Agent Score and starting price, from sourced data.`,
    robots: alts.length < MIN_ALTS ? { index: false, follow: true } : undefined,
  };
}

export function AlternativesView({ r, lang = "en" }: { r: NonNullable<Awaited<ReturnType<typeof buildAlternatives>>>; lang?: Lang }) {
  if (!db()) return <SetupNotice />;
  const { agent, caps, alts } = r;
  const fr = lang === "fr";
  const L = (p: string) => lhref(lang, p);
  const list = listOf(lang), usd = usdOf(lang);
  const pm = fr ? "/mois" : "/month";
  const priced = alts.filter((x) => x.from_usd_month != null).sort((x, y) => Number(x.from_usd_month) - Number(y.from_usd_month));
  const cheaper = agent.from_usd_month != null ? priced.filter((x) => Number(x.from_usd_month) < Number(agent.from_usd_month)) : [];
  const free = alts.filter((x) => x.has_free);
  const best = alts.filter((x) => x.quality_score != null).sort((x, y) => Number(y.quality_score) - Number(x.quality_score))[0];

  const faq: { q: string; a: string }[] = [];
  if (fr) {
    if (alts.length) faq.push({ q: `Quelles sont les meilleures alternatives à ${agent.name} ?`, a: `Les plus proches sont ${list(alts.slice(0, 3).map((x) => x.name))} : ce sont celles qui partagent le plus de fonctionnalités documentées avec ${agent.name}.${best ? ` Parmi les ${alts.length} alternatives, le meilleur Score Agent est celui de ${best.name} (${Math.round(Number(best.quality_score))}/100).` : ""}` });
    if (agent.from_usd_month != null) faq.push({ q: `Existe-t-il une alternative moins chère à ${agent.name} ?`, a: cheaper.length ? `Oui. ${agent.name} commence à ${usd(Number(agent.from_usd_month))}/mois ; ${list(cheaper.slice(0, 3).map((x) => `${x.name} (${usd(Number(x.from_usd_month))}/mois)`))} commence${cheaper.slice(0, 3).length > 1 ? "nt" : ""} plus bas, d'après les prix publiés.` : `Parmi les alternatives les plus proches qui publient un prix mensuel, aucune ne commence en dessous de ${agent.name} (${usd(Number(agent.from_usd_month))}/mois).` });
    faq.push({ q: `Existe-t-il une alternative gratuite à ${agent.name} ?`, a: free.length ? `${list(free.slice(0, 3).map((x) => x.name))} ${free.length === 1 ? "propose" : "proposent"} une offre gratuite ou une version gratuite, d'après ${free.length === 1 ? "sa page" : "leurs pages"} tarifs.` : `Aucune des alternatives les plus proches ne propose d'offre gratuite pour le moment.` });
  } else {
    if (alts.length) faq.push({ q: `What are the best alternatives to ${agent.name}?`, a: `The closest are ${list(alts.slice(0, 3).map((x) => x.name))}: they share the most documented capabilities with ${agent.name}.${best ? ` Across all ${alts.length} alternatives, the highest Agent Score is ${best.name} (${Math.round(Number(best.quality_score))}/100).` : ""}` });
    if (agent.from_usd_month != null) faq.push({ q: `Is there a cheaper alternative to ${agent.name}?`, a: cheaper.length ? `Yes. ${agent.name} starts at ${usd(Number(agent.from_usd_month))}/month; ${list(cheaper.slice(0, 3).map((x) => `${x.name} (${usd(Number(x.from_usd_month))}/month)`))} start lower, based on listed prices.` : `Among the closest alternatives with a listed monthly price, none starts below ${agent.name} (${usd(Number(agent.from_usd_month))}/month).` });
    faq.push({ q: `Is there a free alternative to ${agent.name}?`, a: free.length ? `${list(free.slice(0, 3).map((x) => x.name))} ${free.length === 1 ? "has" : "have"} a free plan or free tier, according to their pricing pages.` : `None of the closest alternatives lists a free plan right now.` });
  }

  const url = `${SITE}${L(`/agents/${agent.slug}/alternatives`)}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "ItemList", name: fr ? `Alternatives à ${agent.name}` : `${agent.name} alternatives`, url, numberOfItems: alts.length,
      itemListElement: alts.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${L(`/agents/${x.slug}`)}`, name: x.name })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: fr ? "Agents IA" : "Agents", item: `${SITE}${fr ? L("/") : "/agents"}` },
      { "@type": "ListItem", position: 2, name: agent.name, item: `${SITE}${L(`/agents/${agent.slug}`)}` },
      { "@type": "ListItem", position: 3, name: "Alternatives", item: url } ] },
  ];

  return (
    <>
      {ld.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={fr ? L("/") : "/agents"}>{fr ? "Agents IA" : "Agents"}</Link><span>/</span><Link href={L(`/agents/${agent.slug}`)}>{agent.name}</Link><span>/</span><span className="ink">Alternatives</span></nav>
      <div className="eyebrow">Alternatives</div>
      <h1>{fr ? `Alternatives à ${agent.name}` : `${agent.name} alternatives`}</h1>
      <p className="lede">
        {alts.length
          ? <>{fr ? `${alts.length} agents IA font une partie de ce que fait ` : `${alts.length} AI agents do some of what `}<Link href={L(`/agents/${agent.slug}`)}>{agent.name}</Link>{fr ? ". Les plus proches : " : " does. Closest: "}{alts.slice(0, 3).map((x, i) => <span key={x.slug}>{i ? (i === Math.min(3, alts.length) - 1 ? (fr ? " et " : " and ") : ", ") : ""}<Link href={L(`/agents/${x.slug}`)}>{x.name}</Link></span>)}.{priced[0] ? <> {fr ? "Prix d'entrée le plus bas :" : "Lowest listed starting price:"} {priced[0].name} {fr ? "à" : "at"} {usd(Number(priced[0].from_usd_month))}{pm}.</> : null}</>
          : <>{fr ? `Aucun autre agent de l'index ne documente encore les mêmes fonctionnalités que ${agent.name}.` : `No other agent in the index documents the same capabilities as ${agent.name} yet.`}</>}
      </p>
      <p className="small" style={{ marginTop: 10 }}>{fr ? `Votre agent est une alternative à ${agent.name} et il manque ici ? ` : `Your agent is an alternative to ${agent.name} and is missing here? `}<Link href={L("/submit")} className="strong">{fr ? "Listez-le gratuitement →" : "List it for free →"}</Link></p>
      {caps.length ? <div className="chips"><span className="small muted">{fr ? `Fonctionnalités de ${agent.name} :` : `${agent.name} capabilities:`}</span>{caps.map((x) => <Link key={x.capability_slug} href={`/capabilities#${x.capability_slug}`} className="chip acc">{x.capability}</Link>)}</div> : null}

      <div className="card table-wrap" style={{ marginTop: 16 }}>
        {alts.length === 0 ? <div className="card-body">{fr ? <Empty title="Aucune alternative pour l'instant">Les fonctionnalités viennent des sites des éditeurs. Rien n&apos;est listé sur une supposition.</Empty> : <Empty title="No alternative yet">Capabilities come from vendor websites. Nothing is listed on guesswork.</Empty>}</div> : (
          <table>
            <thead><tr><th>#</th><th>Agent</th><th>{fr ? `En commun avec ${agent.name}` : `In common with ${agent.name}`}</th><th>{fr ? "Score Agent" : "Agent Score"}</th><th>{fr ? "À partir de" : "From"}</th><th></th></tr></thead>
            <tbody>
              {alts.map((x, i) => (
                <tr key={x.slug}>
                  <td className="rank-num">{i + 1}</td>
                  <td><Link href={L(`/agents/${x.slug}`)} className="strong ink">{x.name}</Link>{x.short_description ? <div className="desc">{x.short_description}</div> : null}</td>
                  <td className="small"><b>{x.shared.length} {fr ? "sur" : "of"} {caps.length}</b><div className="muted">{x.shared.join(" · ")}</div></td>
                  <td><Quality score={x.quality_score} lang={lang} /></td>
                  <td><Price from={x.from_usd_month} free={x.has_free} hasPricing lang={lang} /></td>
                  <td><Link className="small" href={`/compare/${pairSlug(agent.slug, x.slug)}`}>{fr ? "Comparer →" : "Compare →"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>{fr ? "Questions fréquentes" : "FAQ"}</h2></div>
        <div className="card-body">{faq.map((f) => <details key={f.q} open><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
      </div>
      {fr
        ? <p className="note">Comment les alternatives sont choisies : d&apos;abord les agents qui documentent le plus de fonctionnalités en commun avec {agent.name}, puis ceux du même thème, puis par Score Agent. Les fonctionnalités et les prix viennent des sites des éditeurs, avec les sources et les dates sur la fiche de chaque agent. Aucun éditeur ne paie pour apparaître ici, et les liens d&apos;affiliation ne changent jamais cet ordre.</p>
        : <p className="note">How alternatives are chosen: agents that document the most capabilities in common with {agent.name} come first, then agents in the same theme, then by Agent Score. Capabilities and prices come from vendor websites, with sources and dates on each agent&apos;s page. No vendor pays to appear here, and affiliate links never change this order.</p>}
    </>
  );
}
