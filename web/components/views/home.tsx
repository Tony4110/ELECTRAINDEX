import Link from "next/link";
import { dict, lhref, themeName, type Lang } from "@/lib/i18n";
import { db, getSignals, getStats, getThemes, getTasks, type AgentCard } from "@/lib/db";
import { num } from "@/lib/format";
import { SignalItem, Empty, SetupNotice } from "@/components/ui";
import { Quality, Price, Value, Trust, Logo, valueOf } from "@/components/rank";
import SponsorSlot from "@/components/sponsor-slot";

// Themes in order of market interest (most searched first)
const ORDER = ["coding", "research", "customer-support", "sales", "marketing", "productivity", "data", "finance", "browser-computer-use", "business-operations"];
const VALUE_RANK: Record<string, number> = { best: 0, premium: 1, free: 2, fair: 3 };
export type HomeSP = Promise<{ theme?: string; sort?: string }>;
type SP = HomeSP;

export async function HomeView({ searchParams, lang = "en" }: { searchParams: SP; lang?: Lang }) {
  const t = dict(lang).home;
  const tn = (slug: string, name: string) => themeName(lang, slug, name);
  const c = db();
  if (!c) return <SetupNotice />;
  const sp = await searchParams;
  const sort = sp.sort === "price" || sp.sort === "value" ? sp.sort : "quality";
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [stats, themesRaw, tasks, signals, week, { data: cardsData }] = await Promise.all([
    getStats(), getThemes(), getTasks(), getSignals(5),
    c.from("v_signals").select("id", { count: "exact", head: true }).gte("detected_at", weekAgo).then((r) => r.count ?? 0),
    c.from("v_agent_cards").select("*"),
  ]);
  const cards = (cardsData as AgentCard[] | null) ?? [];
  const themes = [...themesRaw].sort((a, b) => (ORDER.indexOf(a.theme_slug) + 99) % 99 - (ORDER.indexOf(b.theme_slug) + 99) % 99);
  const agentsIn = (slug: string) => cards.filter((a) => a.theme_slugs?.includes(slug)).length;
  const current = themes.find((t) => t.theme_slug === sp.theme) ?? null;

  const rows = cards
    .filter((a) => !current || a.theme_slugs?.includes(current.theme_slug))
    .map((a) => ({ ...a, value: valueOf(a.quality_score, a.from_usd_month, a.has_free) }))
    .sort((x, y) => {
      if (sort === "price") {
        const px = x.has_free ? 0 : x.from_usd_month == null ? 1e9 : Number(x.from_usd_month);
        const py = y.has_free ? 0 : y.from_usd_month == null ? 1e9 : Number(y.from_usd_month);
        if (px !== py) return px - py;
      }
      if (sort === "value") {
        const vx = x.value ? VALUE_RANK[x.value] : 9, vy = y.value ? VALUE_RANK[y.value] : 9;
        if (vx !== vy) return vx - vy;
      }
      return Number(y.quality_score ?? 0) - Number(x.quality_score ?? 0) || x.name.localeCompare(y.name);
    });
  const themeTasks = current ? tasks.filter((t) => t.category_slug === current.theme_slug) : [];
  const href = (o: { theme?: string | null; sort?: string }) => {
    const t = o.theme === undefined ? sp.theme : o.theme ?? undefined;
    const s = o.sort ?? sort;
    const q = new URLSearchParams({ ...(t ? { theme: t } : {}), ...(s !== "quality" ? { sort: s } : {}) }).toString();
    return `${lhref(lang, "/")}${q ? "?" + q : ""}`;
  };

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>{t.h1}</h1>
          <p className="lede">{t.lede}</p>
        </div>
        <SponsorSlot site="electra" slot="home-sponsor" />
      </section>

      <nav className="theme-line" aria-label="Themes" id="ranking">
        <Link href={href({ theme: null })} scroll={false} className={!current ? "on" : ""} aria-current={!current ? "true" : undefined}>{t.all} <span className="n">{cards.length}</span></Link>
        {themes.map((t) => (
          <Link key={t.theme_slug} href={href({ theme: t.theme_slug })} scroll={false} className={current?.theme_slug === t.theme_slug ? "on" : ""} aria-current={current?.theme_slug === t.theme_slug ? "true" : undefined}>
            {tn(t.theme_slug, t.theme)} <span className="n">{agentsIn(t.theme_slug)}</span>
          </Link>
        ))}
      </nav>

      <div className="rank-head">
        <h2>{current ? t.bestFor(tn(current.theme_slug, current.theme)) : t.top}</h2>
        <form action="/search" method="get" className="search" role="search">
            <label htmlFor="q" className="sr-only">{t.searchLabel}</label>
            <input id="q" name="q" type="search" placeholder={t.searchPh} autoComplete="off" />
            <button type="submit" aria-label={t.searchBtn}>{t.searchBtn}</button>
        </form>
        <span className="small muted">{t.sortBy}</span>
        <Link href={href({ sort: "quality" })} scroll={false} className={`chip ${sort === "quality" ? "on" : ""}`}>{t.quality}</Link>
        <Link href={href({ sort: "value" })} scroll={false} className={`chip ${sort === "value" ? "on" : ""}`}>{t.bestValue}</Link>
        <Link href={href({ sort: "price" })} scroll={false} className={`chip ${sort === "price" ? "on" : ""}`}>{t.lowestPrice}</Link>
      </div>
      {current && themeTasks.length > 0 ? (
        <div className="task-strip">
          <span className="small muted">{t.tasksN(themeTasks.length)}</span>
          {themeTasks.map((x) => <Link key={x.slug} href={`/tasks/${x.slug}`} className="chip">{x.name}</Link>)}
        </div>
      ) : null}

      <div className="card table-wrap">
        {rows.length === 0 ? <div className="card-body"><Empty title={t.emptyTitle}>{t.emptyBody}</Empty></div> : (
          <table className="rank-table">
            <thead><tr><th>#</th><th>{t.th.agent}</th>{!current ? <th className="hide-sm">{t.th.theme}</th> : null}<th>{t.th.quality}</th><th>{t.th.from}</th><th className="hide-sm">{t.th.value}</th><th className="hide-sm">{t.th.trust}</th></tr></thead>
            <tbody>
              {rows.map((a, i) => (
                <tr key={a.id}>
                  <td className="rank-num">{i + 1}</td>
                  <td>
                    <Link href={`/agents/${a.slug}`} className="agent-cell">
                      <Logo name={a.name} website={a.website} />
                      <span><span className="strong ink">{a.name}</span><span className="small muted block">{a.company ?? ""}</span></span>
                    </Link>
                  </td>
                  {!current ? <td className="small muted hide-sm">{(a.themes ?? []).map((x, k) => tn(a.theme_slugs?.[k] ?? "", x)).join(" · ")}</td> : null}
                  <td><Quality score={a.quality_score} /></td>
                  <td className="nowrap-sm"><Price from={a.from_usd_month} free={a.has_free} hasPricing lang={lang} /></td>
                  <td className="hide-sm"><Value label={a.value} lang={lang} /></td>
                  <td className="hide-sm"><Trust level={a.pricing_verified ? "verified" : "declared"} lang={lang} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="note">
        {current ? <><Link href={`/themes/${current.theme_slug}`} className="strong">{t.fullRanking(tn(current.theme_slug, current.theme))}</Link><br /></> : null}
        {t.note} <Link href="/sources">{t.methodology}</Link>
      </p>

      <div className="section-title"><h2>{t.weekTitle}</h2><span className="spacer" /><Link href="/pulse" className="strong">{t.pulse}</Link></div>
      <div className="card">
        {lang !== "en" ? <div className="card-body"><p style={{ margin: 0 }}>{t.signalsOther} <Link href="/pulse" className="strong">{t.pulse}</Link></p></div>
          : signals.length === 0 ? <div className="card-body"><Empty title={t.signalsEmptyTitle}>{t.signalsEmpty}</Empty></div>
          : <ul className="signals">{signals.map((s) => <SignalItem key={s.id} s={s} />)}</ul>}
      </div>
      <div className="stats-line" aria-label="Index at a glance" style={{ marginTop: 28 }}>
        <span><b>{num(cards.length)}</b> {t.stats.agents}</span>
        <span><b>{num(stats?.mcp_servers)}</b> {t.stats.tools}</span>
        <span><b>{num(stats?.tasks)}</b> {t.stats.tasks}</span>
        <span><b>{num(week)}</b> {t.stats.changes}</span>
      </div>
    </>
  );
}
