import Link from "next/link";
import { db, getSignals, getStats, getThemes, getTasks } from "@/lib/db";
import { num } from "@/lib/format";
import { SignalItem, Empty, SetupNotice } from "@/components/ui";

const POPULAR = ["find-leads", "research-competitors", "write-seo-articles", "automate-customer-support", "extract-website-data", "query-databases-in-plain-language"];

export default async function Home() {
  const c = db();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [stats, themes, tasks, signals, week, counts] = await Promise.all([
    getStats(),
    getThemes(),
    getTasks(),
    getSignals(5),
    c ? c.from("v_signals").select("id", { count: "exact", head: true }).gte("detected_at", weekAgo).then((r) => r.count ?? 0) : Promise.resolve(0),
    c ? Promise.all(POPULAR.map((s) => c.from("v_task_rankings").select("provider_id", { count: "exact", head: true }).eq("task_slug", s).then((r) => [s, r.count ?? 0] as const)))
      : Promise.resolve([] as (readonly [string, number])[]),
  ]);
  const countOf = new Map(counts);
  const popular = POPULAR.map((s) => tasks.find((t) => t.slug === s)).filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <>
      <section style={{ paddingTop: 24 }}>
        <div className="eyebrow">Electra Index · the agent economy, made readable</div>
        <h1 style={{ maxWidth: 900 }}>What do you need done?</h1>
        <p className="lede">Find the right AI agent or tool for any task, ranked on sourced, dated data. No paid rankings.</p>
        <form action="/search" method="get" className="search" role="search">
          <label htmlFor="q" className="sr-only">What do you need an AI agent to do?</label>
          <input id="q" name="q" type="search" placeholder="e.g. find leads, write SEO articles, query my database" autoComplete="off" />
          <button type="submit">Search →</button>
        </form>
        <div className="stats3" aria-label="Index at a glance">
          <div><b>{num(stats?.mcp_servers)}</b><span className="small muted">agents &amp; tools tracked</span></div>
          <div><b>{num(stats?.tasks)}</b><span className="small muted">tasks ranked</span></div>
          <div><b>{num(week)}</b><span className="small muted">changes this week</span></div>
        </div>
      </section>

      {!c ? <div style={{ marginTop: 32 }}><SetupNotice /></div> : (
        <>
          <div className="section-title"><h2>Browse by theme</h2><span className="spacer" /><Link href="/themes" className="strong">All themes →</Link></div>
          <div className="themes">
            {themes.map((t) => (
              <Link key={t.theme_slug} href={`/themes/${t.theme_slug}`} className="theme">
                <span className="name">{t.theme}</span>
                <span className="small muted">{num(t.providers)} agents &amp; tools · {t.tasks} tasks</span>
              </Link>
            ))}
          </div>

          <div className="section-title"><h2>Popular tasks</h2><span className="spacer" /><Link href="/tasks" className="strong">All tasks →</Link></div>
          <div className="tiles tiles-3">
            {popular.map((t) => (
              <Link key={t.slug} href={`/tasks/${t.slug}`} className="tile">
                <span className="cat">{t.category}</span>
                <span className="name">{t.name}</span>
                <span className="small muted">{(countOf.get(t.slug) ?? 0) === 1 ? "1 agent or tool can help" : `${num(countOf.get(t.slug) ?? 0)} agents & tools can help`}</span>
              </Link>
            ))}
          </div>

          <div className="section-title"><h2>This week in the agent economy</h2><span className="spacer" /><Link href="/signals" className="strong">All signals →</Link></div>
          <div className="card">
            {signals.length === 0 ? <div className="card-body"><Empty title="No signals yet">Changes appear here as soon as a robot detects them.</Empty></div>
              : <ul className="signals">{signals.map((s) => <SignalItem key={s.id} s={s} />)}</ul>}
          </div>
        </>
      )}
    </>
  );
}
