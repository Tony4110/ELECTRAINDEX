import Link from "next/link";
import { SpotlightBox } from "@/components/spotlight";
import { db, providerHref, type Task, type TaskRanking } from "@/lib/db";
import { num, timeAgo, lowerFirst } from "@/lib/format";
import { pairSlug } from "@/lib/compare";
import { taskIntro, taskIntroFr } from "@/lib/taskcopy";
import { Tri, Empty, SetupNotice } from "@/components/ui";
import { Trust, Coverage, ProviderCell, Quality, Price, Value, KindTabs } from "@/components/rank";
import { lhref, themeName, type Lang } from "@/lib/i18n";
import { capName, capNameEn } from "@/lib/i18n-agent";
import { taskNameFr } from "@/lib/i18n-paths";
import { loadAgentTexts } from "@/components/views/agent";
import { themeStyle } from "@/lib/theme-style";
import { Logo } from "@/components/rank";

export type TaskSP = Promise<{ page?: string; full?: string; kind?: string }>;
const PAGE = 50;

export async function loadTask(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_tasks").select("*").eq("slug", slug).maybeSingle();
  return data as Task | null;
}

export function taskTitle(t: Task, lang: Lang) {
  return lang === "fr" ? `Meilleurs agents IA pour ${lowerFirst(taskNameFr(t.name, t.slug))}` : `Best AI agents to ${lowerFirst(t.name)}`;
}

/** Task ranking page. In French only the AI agents tab is translated; the tools tab links to the English page. */
export async function TaskView({ t, searchParams, lang = "en" }: { t: Task; searchParams: TaskSP; lang?: Lang }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const fr = lang === "fr";
  const L = (p: string) => lhref(lang, p);
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const onlyFull = sp.full === "1";

  const kind = !fr && sp.kind === "tools" ? "tools" : "agents";
  const op = kind === "agents" ? "eq" : "neq";

  let q = c.from("v_task_rankings").select("*", { count: "exact" }).eq("task_slug", t.slug).filter("provider_type", op, "agent");
  if (onlyFull) q = q.eq("coverage_pct", 100);
  q = kind === "agents"
    ? q.order("coverage_pct", { ascending: false }).order("quality_score", { ascending: false, nullsFirst: false })
    : q.order("coverage_pct", { ascending: false }).order("matched", { ascending: false }).order("last_seen_at", { ascending: false });
  const [{ data, count }, { count: fullCount }, { data: related }, { count: nAgents }, { count: nTools }, texts] = await Promise.all([
    q.range((page - 1) * PAGE, page * PAGE - 1),
    c.from("v_task_rankings").select("provider_id", { count: "exact", head: true }).eq("task_slug", t.slug).eq("coverage_pct", 100).filter("provider_type", op, "agent"),
    c.from("v_tasks").select("slug,name").eq("category_slug", t.category_slug ?? "").neq("slug", t.slug).limit(6),
    c.from("v_task_rankings").select("provider_id", { count: "exact", head: true }).eq("task_slug", t.slug).eq("provider_type", "agent"),
    c.from("v_task_rankings").select("provider_id", { count: "exact", head: true }).eq("task_slug", t.slug).neq("provider_type", "agent"),
    loadAgentTexts(lang),
  ]);
  const rows = (data as TaskRanking[] | null) ?? [];
  // Display tie-break: at equal coverage, a well-verified (high-confidence) match
  // ranks above a keyword-guessed (medium/low) one, then by Agent Score.
  // Scores and the ranking formula are unchanged; this only orders the display.
  // Agent details (theme, website) for the rows shown: used for relevance and logos.
  const cardsBySlug = new Map<string, { theme_slugs: string[] | null; website: string | null }>();
  if (kind === "agents" && rows.length) {
    const { data: cd } = await c.from("v_agent_cards").select("slug,theme_slugs,website").in("slug", rows.map((r) => r.provider_slug));
    for (const x of (cd as { slug: string; theme_slugs: string[] | null; website: string | null }[] | null) ?? []) cardsBySlug.set(x.slug, x);
  }
  // At equal coverage, an agent whose own theme is the task's theme (a website builder for "build a website")
  // ranks above one that only shares a side capability; then the better-verified match, then Agent Score.
  // Scores and the ranking formula are unchanged; this only orders the display.
  const inTheme = (slug: string) => (t.category_slug && cardsBySlug.get(slug)?.theme_slugs?.includes(t.category_slug) ? 1 : 0);
  if (kind === "agents") {
    const CONF: Record<string, number> = { high: 3, medium: 2, low: 1 };
    rows.sort((a, b) =>
      b.coverage_pct - a.coverage_pct
      || inTheme(b.provider_slug) - inTheme(a.provider_slug)
      || (CONF[b.match_confidence] ?? 0) - (CONF[a.match_confidence] ?? 0)
      || (b.quality_score ?? -1) - (a.quality_score ?? -1));
  }
  const self = L(`/tasks/${t.slug}`);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number, full = onlyFull) => `${self}?${new URLSearchParams({ ...(kind === "tools" ? { kind } : {}), ...(p > 1 ? { page: String(p) } : {}), ...(full ? { full: "1" } : {}) })}`;
  const what = kind === "agents" ? "AI agents" : "tools";
  const fullRows = page === 1 ? rows.filter((r) => r.coverage_pct === 100) : [];
  const leaders = fullRows.slice(0, 2).map((r) => r.provider_name);
  const cmp = kind === "agents" ? fullRows.filter((r) => r.quality_score != null).slice(0, 2) : [];
  const comparePair = cmp.length === 2
    ? { href: `/compare/${pairSlug(cmp[0].provider_slug, cmp[1].provider_slug)}`, a: cmp[0].provider_name, b: cmp[1].provider_name }
    : null;
  const name = fr ? taskNameFr(t.name, t.slug) : t.name;
  const st = themeStyle(t.category_slug);
  const picks = kind === "agents" && page === 1 ? rows.filter((r) => r.coverage_pct === 100).slice(0, 3) : [];
  const tableRows = rows.filter((r) => !picks.includes(r));
  const partial = (count ?? 0) - (fullCount ?? 0);
  const cat = t.category_slug ? themeName(lang, t.category_slug, t.category ?? "") : t.category;
  const capNames = t.capabilities.map((x) => capName(lang, x.slug, x.name));
  const conf: Record<string, string> = fr ? { medium: "correspondance moyenne", low: "correspondance faible" } : { medium: "medium match", low: "low match" };

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={L("/tasks")}>{fr ? "Tâches" : "Tasks"}</Link><span>/</span>
        {t.category_slug ? <Link href={L(`/themes/${t.category_slug}`)}>{cat}</Link> : <span>{cat}</span>}<span>/</span><span className="ink">{name}</span></nav>
      <section className="tk-hero" style={{ ["--c" as string]: st.color, ["--s" as string]: st.soft }}>
      <div className="eyebrow">{fr ? "Tâche" : "Task"} · {cat}</div>
      <h1>{taskTitle(t, lang)}</h1>
      {kind === "agents" ? (
        <div className="tk-kpis">
          <span className="tk-kpi main"><b>{num(fullCount ?? 0)}</b> {fr ? ((fullCount ?? 0) > 1 ? "agents font tout le travail" : "agent fait tout le travail") : ((fullCount ?? 0) === 1 ? "agent does the whole job" : "agents do the whole job")}</span>
          {partial > 0 && !onlyFull ? <span className="tk-kpi"><b>{num(partial)}</b> {fr ? "en font une partie" : "do part of it"}</span> : null}
        </div>
      ) : null}
      <p className="lede tk-lede">{fr
        ? taskIntroFr(name, capNames, fullCount ?? 0, leaders)
        : kind === "agents"
          ? taskIntro(t.name, t.capabilities, fullCount ?? 0, leaders)
          : `This task needs ${t.capabilities.length} capabilities. ${num(fullCount ?? 0)} ${what} cover all of them; ${num(count ?? 0)} ${onlyFull ? "shown" : "cover at least one"}.`}</p>
      <div className="chips">
        <span className="small muted">{fr ? "Ce qu'il faut savoir faire :" : "What it takes:"}</span>
        {t.capabilities.map((x, i) => <Link key={x.slug} href={`/capabilities#${x.slug}`} className="chip tk-cap">{capNames[i]}</Link>)}
      </div>
      </section>
      {picks.length ? (
        <section className="tk-picks" style={{ ["--c" as string]: st.color, ["--s" as string]: st.soft }}>
          <h2>{fr ? "Les meilleurs choix" : "Top picks"}<span className="small muted"> · {fr ? "font tout le travail" : "do the whole job"}</span></h2>
          <div className="tk-pick-grid">
            {picks.map((r, i) => (
              <Link key={r.provider_id} href={L(providerHref("agent", r.provider_slug))} className={`tk-pick ${i === 0 ? "first" : ""}`}>
                <span className="tk-rank">{i === 0 ? (fr ? "N° 1" : "#1") : `#${i + 1}`}</span>
                <span className="tk-pick-head"><Logo name={r.provider_name} website={cardsBySlug.get(r.provider_slug)?.website} size={40} /><span className="tk-pick-name">{r.provider_name}</span></span>
                <span className="tk-pick-desc">{fr ? texts.get(r.provider_slug) ?? r.short_description : r.short_description}</span>
                <span className="tk-pick-facts">
                  <span><Quality score={r.quality_score} lang={lang} /></span>
                  <span><Price from={r.from_usd_month} free={r.has_free} hasPricing={r.has_pricing} lang={lang} /></span>
                  {r.value_label && r.value_label !== "free" ? <span><Value label={r.value_label} lang={lang} /></span> : null}
                </span>
                <span className="tk-pick-cta">{fr ? "Voir l'agent →" : "See the agent →"}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {comparePair ? <p className="small"><Link href={comparePair.href}>{fr ? "Comparer les deux premiers :" : "Compare the top two:"} {comparePair.a} vs {comparePair.b} →</Link></p> : null}
      <KindTabs base={self} kind={kind} counts={{ agents: nAgents ?? 0, tools: nTools ?? 0 }} lang={lang} toolsBase={fr ? `/tasks/${t.slug}` : undefined} />
      <div className="filters">
        <Link href={link(1, false)} className={`chip ${!onlyFull ? "on" : ""}`}>{fr ? "Toutes les correspondances" : "All matches"}</Link>
        <Link href={link(1, true)} className={`chip ${onlyFull ? "on" : ""}`}>{fr ? "Couverture complète uniquement" : "Full coverage only"}</Link>
      </div>

      <SpotlightBox path={`/tasks/${t.slug}`} lang={lang} texts={texts} />

      {picks.length && tableRows.length ? <h2 className="tk-more">{fr ? "Les autres agents" : "Other agents"}<span className="small muted"> · {fr ? "classés par part du travail couverte" : "ranked by how much of the job they cover"}</span></h2> : null}
      <section className="grid cols-3">
        <div className="card span-2 table-wrap">
          {tableRows.length === 0 && picks.length > 0 ? (
            <div className="card-body small muted">{fr ? "Aucun autre agent ne couvre cette tâche pour l'instant." : "No other agent covers this task yet."}</div>
          ) : tableRows.length === 0 ? (
            <div className="card-body">
              {fr
                ? <Empty title="Aucune correspondance pour l'instant">Nos robots classent encore les agents et les outils par fonctionnalité. Rien n&apos;est listé sur une supposition.</Empty>
                : <Empty title="No match yet">Our robots are still classifying agents and tools by capability. Nothing is listed on guesswork.</Empty>}
            </div>
          ) : (
            <table>
              <thead>{kind === "agents"
                ? fr
                  ? <tr><th>#</th><th>Agent</th><th>Couverture</th><th>Qualité</th><th>À partir de</th><th>Rapport qualité-prix</th><th>Confiance</th></tr>
                  : <tr><th>#</th><th>Agent</th><th>Coverage</th><th>Quality</th><th>From</th><th>Value</th><th>Trust</th></tr>
                : <tr><th>#</th><th>Tool</th><th>Coverage</th><th>Access</th><th>Trust</th><th>Seen</th></tr>}</thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={r.provider_id}>
                    <td className="rank-num">{(page - 1) * PAGE + picks.length + i + 1}</td>
                    <ProviderCell type={r.provider_type} slug={r.provider_slug} name={r.provider_name} desc={fr ? texts.get(r.provider_slug) ?? null : r.short_description} lang={lang} />
                    <td>
                      <Coverage pct={r.coverage_pct} />
                      {(r.matched_capabilities?.length ?? 0) > 0
                        ? <div className="small muted">{r.matched_capabilities.map((m) => capNameEn(lang, m)).join(" · ")}{r.match_confidence && r.match_confidence !== "high" ? ` · ${conf[r.match_confidence] ?? r.match_confidence}` : ""}</div>
                        : null}
                    </td>
                    {kind === "agents" ? <>
                      <td><Quality score={r.quality_score} lang={lang} /></td>
                      <td><Price from={r.from_usd_month} free={r.has_free} hasPricing={r.has_pricing} lang={lang} /></td>
                      <td><Value label={r.value_label} lang={lang} /></td>
                    </> : <>
                      <td><span className="pills"><Tri label="REMOTE" value={r.remote} /><Tri label="LOCAL" value={r.local} /></span></td>
                    </>}
                    <td><Trust level={r.trust_level} lang={lang} />{kind === "agents" ? <> <Link className="small faint" href={L(providerHref("agent", r.provider_slug))}>{fr ? "pourquoi →" : "why →"}</Link></> : null}</td>
                    {kind === "tools" ? <td className="mono small muted">{timeAgo(r.last_seen_at)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>{fr ? "Tâches similaires" : "Related tasks"}</h2></div>
          <ul className="signals">
            {((related as { slug: string; name: string }[] | null) ?? []).map((r) => (
              <li className="signal" key={r.slug}><Link href={L(`/tasks/${r.slug}`)}>{fr ? taskNameFr(r.name, r.slug) : r.name}</Link></li>
            ))}
          </ul>
        </div>
      </section>
      <div className="pager">
        {page > 1 ? <Link className="btn" href={link(page - 1)}>{fr ? "← Précédent" : "← Previous"}</Link> : null}
        <span className="mono small muted">Page {page} / {pages}</span>
        {page < pages ? <Link className="btn" href={link(page + 1)}>{fr ? "Suivant →" : "Next →"}</Link> : null}
      </div>
      {fr
        ? <p className="note">Couverture = part des fonctionnalités requises par cette tâche qu&apos;un agent documente. Les agents sont classés par couverture ; à couverture égale, ceux dont le thème principal est celui de la tâche passent devant, puis la correspondance la plus fiable, puis le Score Agent. Les fonctionnalités des agents IA sont celles indiquées sur le site de l&apos;éditeur. Les fonctionnalités, le niveau de confiance, les sources et les dates de vérification de chaque agent figurent sur sa fiche.</p>
        : <p className="note">Coverage = share of this task&apos;s required capabilities that an agent or tool documents. Agents are ranked by coverage; at equal coverage, agents whose main theme is this task's theme come first, then the better-verified match, then Agent Score. For AI agents, capabilities are those stated on the vendor&apos;s website; for tools, they are matched automatically from the publisher&apos;s description (keyword method, low confidence). Each agent&apos;s capabilities, trust level, sources and verification dates are shown on its own page.</p>}
    </>
  );
}
