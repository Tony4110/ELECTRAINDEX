import Link from "next/link";
import { SpotlightBox } from "@/components/spotlight";
import { db, getTasks, type ThemeRanking, type Theme } from "@/lib/db";
import { num, timeAgo } from "@/lib/format";
import { Tri, SetupNotice, Empty } from "@/components/ui";
import { Trust, ProviderCell, Quality, Price, Value, KindTabs } from "@/components/rank";
import { lhref, themeName, type Lang } from "@/lib/i18n";
import { taskNameFr } from "@/lib/i18n-paths";
import { loadAgentTexts } from "@/components/views/agent";

export type ThemeSP = Promise<{ page?: string; kind?: string; sort?: string }>;
const PAGE = 50;

export async function loadTheme(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_theme_overview").select("*").eq("theme_slug", slug).maybeSingle();
  return data as Theme | null;
}

export function themeTitle(t: Theme, lang: Lang) {
  return lang === "fr" ? `Meilleurs agents IA : ${themeName("fr", t.theme_slug, t.theme)}` : `Best AI agents & tools for ${t.theme}`;
}

/** Theme ranking page. In French only the AI agents tab is translated; the tools tab links to the English page. */
export async function ThemeView({ t, searchParams, lang = "en" }: { t: Theme; searchParams: ThemeSP; lang?: Lang }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const fr = lang === "fr";
  const L = (p: string) => lhref(lang, p);
  const slug = t.theme_slug;
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const kind = !fr && sp.kind === "tools" ? "tools" : "agents";
  const sort = sp.sort === "price" || sp.sort === "coverage" ? sp.sort : "quality";

  let q = c.from("v_theme_rankings").select("*", { count: "exact" }).eq("theme_slug", slug);
  if (kind === "agents") {
    q = q.eq("provider_type", "agent").eq("listed_in_theme", true);
    if (sort === "price") q = q.order("has_free", { ascending: false }).order("from_usd_month", { ascending: true, nullsFirst: false });
    else if (sort === "coverage") q = q.order("coverage_score", { ascending: false });
    q = q.order("quality_score", { ascending: false, nullsFirst: false }).order("coverage_score", { ascending: false });
  } else {
    q = q.neq("provider_type", "agent").order("coverage_score", { ascending: false }).order("tasks_fully_covered", { ascending: false }).order("last_seen_at", { ascending: false });
  }
  const [{ data, count }, tasks, { count: nAgents }, { count: nTools }, texts] = await Promise.all([
    q.range((page - 1) * PAGE, page * PAGE - 1),
    getTasks(),
    c.from("v_theme_rankings").select("provider_id", { count: "exact", head: true }).eq("theme_slug", slug).eq("provider_type", "agent").eq("listed_in_theme", true),
    c.from("v_theme_rankings").select("provider_id", { count: "exact", head: true }).eq("theme_slug", slug).neq("provider_type", "agent"),
    loadAgentTexts(lang),
  ]);
  const rows = (data as ThemeRanking[] | null) ?? [];
  const themeTasks = tasks.filter((x) => x.category_slug === slug);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const self = L(`/themes/${slug}`);
  const qs = (o: Record<string, string | number | undefined>) => {
    const m: Record<string, string> = {};
    const all = { kind: kind === "tools" ? "tools" : undefined, sort: kind === "agents" && sort !== "quality" ? sort : undefined, ...o };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "" && !(k === "page" && Number(v) === 1)) m[k] = String(v);
    const s = new URLSearchParams(m).toString();
    return `${self}${s ? "?" + s : ""}`;
  };
  const name = themeName(lang, slug, t.theme);
  const tn = (n: string) => (fr ? taskNameFr(n) : n);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href={L("/themes")}>{fr ? "Thèmes" : "Themes"}</Link><span>/</span><span className="ink">{name}</span></nav>
      <div className="eyebrow">{fr ? "Classement" : "Ranking"} · {name}</div>
      <h1>{fr ? <>Meilleurs agents IA : {name}</> : <>Best AI agents &amp; tools for {t.theme}</>}</h1>
      <p className="lede">{fr
        ? <>{num(nAgents ?? 0)} agents IA conçus pour ce thème ({name.toLowerCase()}), classés par qualité, avec leur prix d&apos;entrée et leur rapport qualité-prix. Les prix viennent de la page tarifs de chaque éditeur.</>
        : kind === "agents"
          ? <>{num(nAgents ?? 0)} AI agents built for {t.theme.toLowerCase()}, ranked by quality, with their entry price and value for money. Prices come from each vendor&apos;s own pricing page.</>
          : <>{num(nTools ?? 0)} tools cover at least one of the {t.tasks} {t.theme.toLowerCase()} tasks, ranked by coverage score: how much of the theme&apos;s tasks each one covers.</>}</p>
      <div className="chips">
        <span className="small muted">{fr ? "Tâches de ce thème :" : "Tasks in this theme:"}</span>
        {themeTasks.map((x) => <Link key={x.slug} href={L(`/tasks/${x.slug}`)} className="chip">{fr ? taskNameFr(x.name, x.slug) : x.name}</Link>)}
      </div>

      <SpotlightBox path={`/themes/${slug}`} lang={lang} texts={texts} />

      <KindTabs base={self} kind={kind} counts={{ agents: nAgents ?? 0, tools: nTools ?? 0 }} lang={lang} toolsBase={fr ? `/themes/${slug}` : undefined} />
      {kind === "agents" ? (
        <div className="filters">
          <span className="small muted">{fr ? "Trier par" : "Sort by"}</span>
          <Link href={qs({ sort: undefined })} className={`chip ${sort === "quality" ? "on" : ""}`}>{fr ? "Qualité" : "Quality"}</Link>
          <Link href={qs({ sort: "price" })} className={`chip ${sort === "price" ? "on" : ""}`}>{fr ? "Prix le plus bas" : "Lowest price"}</Link>
          <Link href={qs({ sort: "coverage" })} className={`chip ${sort === "coverage" ? "on" : ""}`}>{fr ? "Couverture des tâches" : "Task coverage"}</Link>
        </div>
      ) : <div style={{ height: 16 }} />}

      <div className="card table-wrap">
        {rows.length === 0 ? <div className="card-body">{fr
          ? <Empty title="Classement en cours">Nos robots classent encore les agents et les outils de ce thème.</Empty>
          : <Empty title="Ranking in progress">Our robots are still classifying agents and tools for this theme.</Empty>}</div> : kind === "agents" ? (
          <table>
            <thead>{fr
              ? <tr><th>#</th><th>Agent</th><th>Qualité</th><th>À partir de</th><th>Rapport qualité-prix</th><th>Tâches couvertes</th><th>Points forts</th><th>Confiance</th></tr>
              : <tr><th>#</th><th>Agent</th><th>Quality</th><th>From</th><th>Value</th><th>Tasks covered</th><th>Best at</th><th>Trust</th></tr>}</thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.provider_id}>
                  <td className="rank-num">{(page - 1) * PAGE + i + 1}</td>
                  <ProviderCell type={r.provider_type} slug={r.provider_slug} name={r.provider_name} desc={fr ? texts.get(r.provider_slug) ?? null : r.short_description} lang={lang} />
                  <td><Quality score={r.quality_score} lang={lang} /></td>
                  <td><Price from={r.from_usd_month} free={r.has_free} hasPricing={r.has_pricing} lang={lang} /></td>
                  <td><Value label={r.value_label} lang={lang} /></td>
                  <td className="mono">{r.tasks_touched} / {t.tasks}</td>
                  <td className="small">{(r.top_tasks ?? []).map(tn).join(" · ")}</td>
                  <td><Trust level={r.trust_level} lang={lang} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table>
            <thead><tr><th>#</th><th>Tool</th><th>Coverage score</th><th>Tasks covered</th><th>Best at</th><th>Access</th><th>Trust</th><th>Seen</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.provider_id}>
                  <td className="rank-num">{(page - 1) * PAGE + i + 1}</td>
                  <ProviderCell type={r.provider_type} slug={r.provider_slug} name={r.provider_name} desc={r.short_description} />
                  <td className="mono" title="Sum of task coverage across the theme">{Number(r.coverage_score).toFixed(1)}</td>
                  <td className="mono">{r.tasks_touched} / {t.tasks}</td>
                  <td className="small">{(r.top_tasks ?? []).join(" · ")}</td>
                  <td><span className="pills"><Tri label="REMOTE" value={r.remote} /><Tri label="LOCAL" value={r.local} /></span></td>
                  <td><Trust level={r.trust_level} /></td>
                  <td className="mono small muted">{timeAgo(r.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="pager">
        {page > 1 ? <Link className="btn" href={qs({ page: page - 1 })}>{fr ? "← Précédent" : "← Previous"}</Link> : null}
        <span className="mono small muted">Page {page} / {pages}</span>
        {page < pages ? <Link className="btn" href={qs({ page: page + 1 })}>{fr ? "Suivant →" : "Next →"}</Link> : null}
      </div>
      <p className="note">{fr
        ? <>Qualité = Score Agent (0–100, méthodologie 1.0). Rapport qualité-prix : <b>Meilleur rapport</b> = score ≥ 60 et prix d&apos;entrée ≤ 50 $/mois (ou gratuit) ; <b>Premium</b> = score ≥ 70 au-delà de 50 $/mois. ✓ Vérifié = prix relevé par nous sur la page tarifs de l&apos;éditeur ; Déclaré = indiqué par l&apos;éditeur, pas encore vérifié.</>
        : kind === "agents"
          ? <>Quality = Agent Score (0–100, methodology 1.0). Value: <b>Best value</b> = score ≥ 60 and entry price ≤ $50/month (or free); <b>Premium</b> = score ≥ 70 above $50/month. ✓ Verified = price read on the vendor&apos;s pricing page by us; Declared = stated by the vendor, not yet checked.</>
          : <>Capabilities are matched automatically from each publisher&apos;s own description (keyword method, low confidence) and will be refined.</>}</p>
    </>
  );
}
