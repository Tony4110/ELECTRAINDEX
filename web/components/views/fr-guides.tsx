/**
 * French guide pages built only from our own data (prices from vendor pages, Agent Score, themes).
 * No copy is invented: every number on these pages comes from the index at render time.
 */
import Link from "next/link";
import { db, type AgentCard } from "@/lib/db";
import { SITE } from "@/lib/site";
import { lhref, themeName } from "@/lib/i18n";
import { loadAgentTexts } from "@/components/views/agent";
import { Quality, Price, Trust, Value, valueOf } from "@/components/rank";
import { SetupNotice } from "@/components/ui";

const L = (p: string) => lhref("fr", p);
const usd = (n: number) => `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2).replace(".", ",")} $`;
const list = (n: string[]) => (n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} et ${n[n.length - 1]}`);
const today = () => new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const year = () => new Date().getFullYear();
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function loadAll() {
  const c = db();
  if (!c) return null;
  const [{ data }, texts] = await Promise.all([c.from("v_agent_cards").select("*").limit(1000), loadAgentTexts("fr")]);
  const cards = ((data as AgentCard[] | null) ?? []).map((a) => ({ ...a, desc: texts.get(a.slug) ?? null, value: valueOf(a.quality_score, a.from_usd_month, a.has_free) }));
  return cards.filter((a) => a.desc); // a French page shows only agents with a French description
}
type Row = NonNullable<Awaited<ReturnType<typeof loadAll>>>[number];

function AgentCell({ a }: { a: Row }) {
  return <td><Link href={L(`/agents/${a.slug}`)} className="strong ink">{a.name}</Link>{a.desc ? <div className="desc">{a.desc}</div> : null}</td>;
}
const themesOf = (a: Row) => (a.themes ?? []).map((n, i) => themeName("fr", a.theme_slugs?.[i] ?? "", n)).join(" · ");
const byScore = (x: Row, y: Row) => Number(y.quality_score ?? -1) - Number(x.quality_score ?? -1) || x.name.localeCompare(y.name);

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="card faq" style={{ marginTop: 24 }}>
      <div className="card-head"><h2>Questions fréquentes</h2></div>
      <div className="card-body">{items.map((f) => <details key={f.q} open><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
    </div>
  );
}
function Ld({ items }: { items: object[] }) {
  return <>{items.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}</>;
}
const faqLd = (items: { q: string; a: string }[]) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });

// ---------------------------------------------------------------------------
export const BEST_META = {
  title: () => `Meilleurs agents IA en ${year()} : le classement indépendant`,
  description: "Les meilleurs agents IA, classés par Score Agent, avec leurs prix relevés sur les pages officielles. Le top 10 et les 3 meilleurs par thème : vente, marketing, développement, support client, finance…",
};

export async function BestAgentsFr() {
  const all = await loadAll();
  if (!all) return <SetupNotice />;
  const ranked = all.filter((a) => a.quality_score != null).sort(byScore);
  const top = ranked.slice(0, 10);
  const c = db()!;
  const { data: th } = await c.from("v_theme_overview").select("theme_slug,theme");
  const themes = ((th as { theme_slug: string; theme: string }[] | null) ?? [])
    .map((t) => ({ ...t, fr: themeName("fr", t.theme_slug, t.theme), agents: ranked.filter((a) => a.theme_slugs?.includes(t.theme_slug)).slice(0, 3) }))
    .filter((t) => t.agents.length)
    .sort((a, b) => a.fr.localeCompare(b.fr, "fr"));
  const bestFree = ranked.find((a) => a.has_free);
  const bestValue = ranked.find((a) => a.value === "best");

  const faq = [
    ...(top[0] ? [{ q: "Quel est le meilleur agent IA ?", a: `D'après notre classement du ${today()}, ${top[0].name} obtient le meilleur Score Agent (${Math.round(Number(top[0].quality_score))}/100), suivi de ${list(top.slice(1, 3).map((x) => `${x.name} (${Math.round(Number(x.quality_score))}/100)`))}. Le meilleur agent dépend surtout de votre usage : consultez le classement de votre thème.` }] : []),
    ...(bestFree ? [{ q: "Quel est le meilleur agent IA gratuit ?", a: `Parmi les agents qui proposent une offre gratuite, ${bestFree.name} a le meilleur Score Agent (${Math.round(Number(bestFree.quality_score))}/100). Les limites de l'offre gratuite figurent sur sa page tarifs officielle.` }] : []),
    ...(bestValue ? [{ q: "Quel agent IA offre le meilleur rapport qualité-prix ?", a: `${bestValue.name} est l'agent le mieux noté avec la mention « Meilleur rapport » : un Score Agent d'au moins 60 et un prix d'entrée de 50 $/mois maximum (ou gratuit).` }] : []),
    { q: "Comment est calculé ce classement ?", a: "Le Score Agent (0 à 100) mesure ce que l'on peut vérifier publiquement : fonctionnalités, intégrations, documentation, clarté des prix, transparence et fraîcheur des informations. Un critère sans source vaut 0. Aucun éditeur ne paie pour être classé." },
  ];
  const url = `${SITE}/fr/meilleurs-agents-ia`;

  return (
    <>
      <Ld items={[{ "@context": "https://schema.org", "@type": "ItemList", name: BEST_META.title(), url, numberOfItems: top.length, itemListElement: top.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}${L(`/agents/${x.slug}`)}`, name: x.name })) }, faqLd(faq)]} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={L("/")}>Agents IA</Link><span>/</span><span className="ink">Meilleurs agents IA</span></nav>
      <div className="eyebrow">Guide · mis à jour le {today()}</div>
      <h1>Meilleurs agents IA en {year()}</h1>
      <p className="lede">{ranked.length} agents IA classés par Score Agent, un score fondé sur des preuves publiques, avec leur prix d&apos;entrée relevé sur la page tarifs de chaque éditeur. Voici le top 10, puis les 3 meilleurs de chaque thème.</p>

      <div className="section-title"><h2>Le top 10 des agents IA</h2></div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>#</th><th>Agent</th><th>Thème</th><th>Qualité</th><th>À partir de</th><th>Rapport qualité-prix</th></tr></thead>
          <tbody>{top.map((a, i) => (
            <tr key={a.slug}><td className="rank-num">{i + 1}</td><AgentCell a={a} /><td className="small muted">{themesOf(a)}</td>
              <td><Quality score={a.quality_score} lang="fr" /></td><td><Price from={a.from_usd_month} free={a.has_free} hasPricing lang="fr" /></td><td><Value label={a.value} lang="fr" /></td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="section-title"><h2>Les meilleurs agents IA par thème</h2></div>
      <div className="grid cols-2">
        {themes.map((t) => (
          <div className="card" key={t.theme_slug}>
            <div className="card-head"><h2>{t.fr}</h2><Link className="small" href={L(`/themes/${t.theme_slug}`)}>Classement complet →</Link></div>
            <ul className="signals">
              {t.agents.map((a, i) => (
                <li className="signal" key={a.slug}>
                  <div className="signal-top"><span className="mono small muted">{i + 1}</span> <Link href={L(`/agents/${a.slug}`)} className="strong ink">{a.name}</Link><span className="spacer" /><Quality score={a.quality_score} lang="fr" /></div>
                  <div className="small"><Price from={a.from_usd_month} free={a.has_free} hasPricing lang="fr" /> · <Link href={L(`/agents/${a.slug}/alternatives`)}>Alternatives →</Link></div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Faq items={faq} />
      <p className="note">Voir aussi : <Link href="/fr/comparer-prix-agents-ia">comparer les prix des agents IA</Link> · <Link href={L("/tasks")}>les agents IA par tâche</Link>. Chaque fiche agent indique ses sources et la date de sa dernière vérification. <Link href="/sources">Méthodologie</Link></p>
    </>
  );
}

// ---------------------------------------------------------------------------
export const PRICES_META = {
  title: () => `Comparer les prix des agents IA (${year()}) : offres gratuites et tarifs vérifiés`,
  description: "Combien coûte un agent IA ? Les prix d'entrée de tous les agents de l'index, relevés sur les pages tarifs officielles : offres gratuites, prix médian par thème, du moins cher au plus cher.",
};

export async function ComparePricesFr() {
  const all = await loadAll();
  if (!all) return <SetupNotice />;
  const paid = all.filter((a) => a.from_usd_month != null).map((a) => Number(a.from_usd_month));
  const free = all.filter((a) => a.has_free).sort(byScore);
  const med = median(paid);
  const c = db()!;
  const { data: th } = await c.from("v_theme_overview").select("theme_slug,theme");
  const themes = ((th as { theme_slug: string; theme: string }[] | null) ?? []).map((t) => {
    const in_ = all.filter((a) => a.theme_slugs?.includes(t.theme_slug));
    const p = in_.filter((a) => a.from_usd_month != null).map((a) => Number(a.from_usd_month));
    return { ...t, fr: themeName("fr", t.theme_slug, t.theme), n: in_.length, free: in_.filter((a) => a.has_free).length, min: p.length ? Math.min(...p) : null, med: median(p) };
  }).filter((t) => t.n).sort((a, b) => a.fr.localeCompare(b.fr, "fr"));
  const rows = [...all].sort((x, y) => {
    const px = x.has_free ? 0 : x.from_usd_month == null ? 1e9 : Number(x.from_usd_month);
    const py = y.has_free ? 0 : y.from_usd_month == null ? 1e9 : Number(y.from_usd_month);
    return px - py || byScore(x, y);
  });
  const verified = all.filter((a) => a.pricing_verified).length;

  const faq = [
    ...(med != null ? [{ q: "Combien coûte un agent IA ?", a: `Le prix d'entrée médian des agents IA qui publient un tarif mensuel est de ${usd(med)}/mois (${paid.length} agents, au ${today()}). Les écarts sont importants : de ${usd(Math.min(...paid))} à ${usd(Math.max(...paid))} par mois pour la première offre payante, et certains agents ne sont vendus que sur devis.` }] : []),
    { q: "Existe-t-il des agents IA gratuits ?", a: free.length ? `Oui : ${free.length} agents de l'index proposent une offre gratuite ou une version gratuite, par exemple ${list(free.slice(0, 3).map((x) => x.name))}. Les limites (nombre de tâches, de crédits ou d'utilisateurs) sont indiquées sur leur page tarifs.` : "Aucun agent de l'index ne propose d'offre gratuite pour le moment." },
    { q: "Les prix sont-ils vérifiés ?", a: `${verified} des ${all.length} agents ont des prix relevés par nos robots sur la page tarifs officielle de l'éditeur (mention « Vérifié »). Les autres sont déclarés par l'éditeur et pas encore vérifiés (mention « Déclaré »). Chaque changement de prix est daté sur la fiche de l'agent.` },
    { q: "Pourquoi les prix sont-ils en dollars ?", a: "La grande majorité des éditeurs d'agents IA publient leurs tarifs en dollars américains. Nous affichons le prix tel qu'il figure sur la page officielle, sans conversion, pour ne jamais modifier un fait." },
  ];

  return (
    <>
      <Ld items={[faqLd(faq)]} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={L("/")}>Agents IA</Link><span>/</span><span className="ink">Comparer les prix</span></nav>
      <div className="eyebrow">Guide · mis à jour le {today()}</div>
      <h1>Comparer les prix des agents IA</h1>
      <p className="lede">Les prix d&apos;entrée de {all.length} agents IA, relevés sur la page tarifs de chaque éditeur. {free.length} proposent une offre gratuite{med != null ? <> ; le prix d&apos;entrée médian est de <b>{usd(med)}/mois</b></> : null}.</p>

      <div className="section-title"><h2>Les prix par thème</h2></div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Thème</th><th>Agents</th><th>Avec offre gratuite</th><th>Prix d&apos;entrée le plus bas</th><th>Prix d&apos;entrée médian</th></tr></thead>
          <tbody>{themes.map((t) => (
            <tr key={t.theme_slug}><td><Link href={L(`/themes/${t.theme_slug}`)} className="strong ink">{t.fr}</Link></td><td className="mono">{t.n}</td><td className="mono">{t.free}</td>
              <td className="mono">{t.min != null ? `${usd(t.min)}/mois` : "—"}</td><td className="mono">{t.med != null ? `${usd(t.med)}/mois` : "—"}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="section-title"><h2>Tous les agents, du moins cher au plus cher</h2></div>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>#</th><th>Agent</th><th>Thème</th><th>À partir de</th><th>Qualité</th><th>Confiance</th></tr></thead>
          <tbody>{rows.map((a, i) => (
            <tr key={a.slug}><td className="rank-num">{i + 1}</td><AgentCell a={a} /><td className="small muted">{themesOf(a)}</td>
              <td><Price from={a.from_usd_month} free={a.has_free} hasPricing lang="fr" /></td><td><Quality score={a.quality_score} lang="fr" /></td>
              <td><Trust level={a.pricing_verified ? "verified" : "declared"} lang="fr" /></td></tr>
          ))}</tbody>
        </table>
      </div>

      <Faq items={faq} />
      <p className="note">Voir aussi : <Link href="/fr/meilleurs-agents-ia">les meilleurs agents IA</Link> · <Link href={L("/tasks")}>les agents IA par tâche</Link>. « À partir de » = le prix mensuel le plus bas d&apos;une offre payante, en dollars, tel qu&apos;affiché par l&apos;éditeur. <Link href="/sources">Méthodologie</Link></p>
    </>
  );
}
