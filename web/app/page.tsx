import Link from "next/link";
import { db, getSignals, getTasks, type McpServer } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { Tri, SignalItem, Empty, SetupNotice } from "@/components/ui";

const EXAMPLES = [
  ["Find leads", "find-leads"],
  ["Research competitors", "research-competitors"],
  ["Write SEO articles", "write-seo-articles"],
  ["Automate customer support", "automate-customer-support"],
  ["Extract website data", "extract-website-data"],
];

export default async function Home() {
  const c = db();
  const [signals, tasks, newest] = await Promise.all([
    getSignals(8),
    getTasks(),
    c
      ? c.from("v_mcp_servers").select("*").order("first_seen_at", { ascending: false }).limit(12).then((r) => (r.data as McpServer[]) ?? [])
      : Promise.resolve([] as McpServer[]),
  ]);
  const featured = ["find-leads", "research-competitors", "write-seo-articles", "automate-customer-support", "extract-website-data",
    "review-pull-requests", "automate-bookkeeping", "find-influencers", "take-meeting-notes", "recruit-developers"];
  const taskTiles = featured.map((s) => tasks.find((t) => t.slug === s)).filter(Boolean);

  return (
    <>
      <section style={{ paddingBottom: 32 }}>
        <div className="eyebrow">Electra Index · the agent economy, made readable</div>
        <h1 style={{ maxWidth: 1000 }}>Discover, compare and track the AI agents powering the new economy.</h1>
        <p className="lede">Every agent, MCP server and price, sourced and dated. Scores come from observable data, never from opinion.</p>
        <form action="/search" method="get" className="search" role="search">
          <label htmlFor="q" className="sr-only">What do you need an AI agent to do?</label>
          <input id="q" name="q" type="search" placeholder="What do you need an AI agent to do?" autoComplete="off" />
          <button type="submit">Search →</button>
        </form>
        <div className="chips">
          <span className="small muted">Try:</span>
          {EXAMPLES.map(([label, slug]) => <Link key={slug} href={`/tasks/${slug}`} className="chip">{label}</Link>)}
        </div>
      </section>

      {!c ? <SetupNotice /> : (
        <section className="grid cols-3">
          <div className="card span-2">
            <div className="card-head">
              <h2>Newest MCP servers</h2>
              <span className="spacer" />
              <Link href="/mcp" className="strong">Full index →</Link>
            </div>
            {newest.length === 0 ? <div className="card-body"><Empty title="No published servers yet">The robots are still collecting. Come back in a few minutes.</Empty></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Server</th><th>Version</th><th>Access</th><th>Seen</th></tr></thead>
                  <tbody>
                    {newest.map((m) => (
                      <tr key={m.id}>
                        <td><Link href={`/mcp/${m.slug}`} className="strong ink">{m.name}</Link><div className="desc">{m.short_description}</div></td>
                        <td className="mono">{m.version ?? "—"}</td>
                        <td><span className="pills"><Tri label="REMOTE" value={m.remote} /><Tri label="LOCAL" value={m.local} /></span></td>
                        <td className="mono small muted">{timeAgo(m.first_seen_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h2>Signals</h2><span className="badge pos">LIVE</span><span className="spacer" /><Link href="/signals" className="strong">All →</Link></div>
            {signals.length === 0 ? <div className="card-body"><Empty title="No signals yet">Changes appear here as soon as a robot detects them.</Empty></div> : (
              <ul className="signals">{signals.map((s) => <SignalItem key={s.id} s={s} />)}</ul>
            )}
          </div>
        </section>
      )}

      <section style={{ marginTop: 40 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>Browse by task</h2>
          <span className="muted small">{tasks.length} tasks mapped to capabilities</span>
          <span className="spacer" style={{ flexGrow: 1 }} />
          <Link href="/tasks" className="strong">All tasks →</Link>
        </div>
        <div className="tiles">
          {taskTiles.map((t) => t && (
            <Link key={t.slug} href={`/tasks/${t.slug}`} className="tile">
              <span className="cat">{t.category}</span>
              <span className="name">{t.name}</span>
              <span className="small muted">{t.capabilities.map((x) => x.name).join(" · ")}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
