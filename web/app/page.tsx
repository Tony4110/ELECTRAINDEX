import Link from "next/link";
import type { Metadata } from "next";
import { db, getSignals, getStats, getThemes, getTasks, type AgentCard } from "@/lib/db";
import { num } from "@/lib/format";
import { SignalItem, Empty, SetupNotice } from "@/components/ui";
import { Quality, Price, Value, Trust, Logo, valueOf } from "@/components/rank";

// Themes in order of market interest (most searched first)
const ORDER = ["coding", "research", "customer-support", "sales", "marketing", "productivity", "data", "finance", "browser-computer-use", "business-operations"];
const VALUE_RANK: Record<string, number> = { best: 0, premium: 1, free: 2, fair: 3 };
type SP = Promise<{ theme?: string; sort?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  return sp.theme || sp.sort ? { alternates: { canonical: sp.theme ? `/themes/${sp.theme}` : "/" } } : { alternates: { canonical: "/" } };
}

export default async function Home({ searchParams }: { searchParams: SP }) {
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
    return `/${q ? "?" + q : ""}`;
  };

  return (
    <>
      <section className="hero">
        <div className="eyebrow">Electra Index · the agent economy, made readable</div>
        <h1>What do you need done?</h1>
        <form action="/search" method="get" className="search" role="search">
          <label htmlFor="q" className="sr-only">What do you need an AI agent to do?</label>
          <input id="q" name="q" type="search" placeholder="e.g. find leads, write SEO articles, query my database" autoComplete="off" />
          <button type="submit">Search →</button>
        </form>
        <div className="stats-line" aria-label="Index at a glance">
          <span><b>{num(cards.length)}</b> AI agents ranked</span>
          <span><b>{num(stats?.mcp_servers)}</b> tools tracked</span>
          <span><b>{num(stats?.tasks)}</b> tasks</span>
          <span><b>{num(week)}</b> changes this week</span>
        </div>
      </section>

      <nav className="theme-bar" aria-label="Themes" id="ranking">
        <Link href={href({ theme: null })} scroll={false} className={`theme-tab ${!current ? "on" : ""}`} aria-current={!current ? "true" : undefined}>
          <span className="name">All themes</span><span className="meta">{cards.length} agents<br />{num(stats?.tasks)} tasks</span>
        </Link>
        {themes.map((t) => (
          <Link key={t.theme_slug} href={href({ theme: t.theme_slug })} scroll={false} className={`theme-tab ${current?.theme_slug === t.theme_slug ? "on" : ""}`} aria-current={current?.theme_slug === t.theme_slug ? "true" : undefined}>
            <span className="name">{t.theme}</span><span className="meta">{agentsIn(t.theme_slug)} agents<br />{t.tasks} tasks</span>
          </Link>
        ))}
      </nav>

      <div className="rank-head">
        <h2>{current ? `Best AI agents for ${current.theme}` : "Top AI agents"}</h2>
        <span className="spacer" />
        <span className="small muted">Sort by</span>
        <Link href={href({ sort: "quality" })} scroll={false} className={`chip ${sort === "quality" ? "on" : ""}`}>Quality</Link>
        <Link href={href({ sort: "value" })} scroll={false} className={`chip ${sort === "value" ? "on" : ""}`}>Best value</Link>
        <Link href={href({ sort: "price" })} scroll={false} className={`chip ${sort === "price" ? "on" : ""}`}>Lowest price</Link>
      </div>
      {current && themeTasks.length > 0 ? (
        <div className="task-strip">
          <span className="small muted">Tasks:</span>
          {themeTasks.map((x) => <Link key={x.slug} href={`/tasks/${x.slug}`} className="chip">{x.name}</Link>)}
        </div>
      ) : null}

      <div className="card table-wrap">
        {rows.length === 0 ? <div className="card-body"><Empty title="No agent yet">Agents appear here once their vendor page has been read.</Empty></div> : (
          <table className="rank-table">
            <thead><tr><th>#</th><th>Agent</th>{!current ? <th>Theme</th> : null}<th>Quality</th><th>From</th><th className="hide-sm">Value</th><th className="hide-sm">Trust</th></tr></thead>
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
                  {!current ? <td className="small muted">{(a.themes ?? []).join(" · ")}</td> : null}
                  <td><Quality score={a.quality_score} /></td>
                  <td className="nowrap-sm"><Price from={a.from_usd_month} free={a.has_free} hasPricing /></td>
                  <td className="hide-sm"><Value label={a.value} /></td>
                  <td className="hide-sm"><Trust level={a.pricing_verified ? "verified" : "declared"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="note">
        {current ? <><Link href={`/themes/${current.theme_slug}`} className="strong">Full {current.theme} ranking with task coverage and tools →</Link><br /></> : null}
        Quality = Agent Score (0–100). Prices are read on each vendor&apos;s pricing page and dated. No paid placement: a commercial partnership never changes a score. <Link href="/sources">Methodology</Link>
      </p>

      <div className="section-title"><h2>This week in the agent economy</h2><span className="spacer" /><Link href="/new" className="strong">New listings →</Link></div>
      <div className="card">
        {signals.length === 0 ? <div className="card-body"><Empty title="No signals yet">Changes appear here as soon as a robot detects them.</Empty></div>
          : <ul className="signals">{signals.map((s) => <SignalItem key={s.id} s={s} />)}</ul>}
      </div>
    </>
  );
}
