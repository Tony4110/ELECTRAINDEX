import Link from "next/link";
import type { Metadata } from "next";
import { db, getSignals, type AgentCard, type McpServer } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { SignalItem, Empty, SetupNotice, Tri } from "@/components/ui";
import { Quality, Price, Logo } from "@/components/rank";

export const metadata: Metadata = {
  title: "New listings — latest AI agents and tools",
  description: "The newest AI agents and tools listed on Electra Index, day by day. List your agent for free.",
  alternates: { canonical: "/new" },
};
type SP = Promise<{ tab?: string }>;

function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const days = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
function byDay<T>(rows: T[], when: (r: T) => string) {
  const out: { label: string; rows: T[] }[] = [];
  for (const r of rows) {
    const label = dayLabel(when(r));
    const last = out[out.length - 1];
    if (last && last.label === label) last.rows.push(r); else out.push({ label, rows: [r] });
  }
  return out;
}

export default async function NewPage({ searchParams }: { searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const sp = await searchParams;
  const tab = sp.tab === "tools" || sp.tab === "changes" ? sp.tab : "agents";

  const [agents, tools, changes] = await Promise.all([
    tab === "agents" ? c.from("v_agent_cards").select("*").order("first_seen_at", { ascending: false }).order("quality_score", { ascending: false, nullsFirst: false }).limit(60).then((r) => (r.data as AgentCard[] | null) ?? []) : Promise.resolve([] as AgentCard[]),
    tab === "tools" ? c.from("v_mcp_servers").select("*").order("first_seen_at", { ascending: false }).limit(100).then((r) => (r.data as McpServer[] | null) ?? []) : Promise.resolve([] as McpServer[]),
    tab === "changes" ? getSignals(100) : Promise.resolve([]),
  ]);

  return (
    <>
      <div className="eyebrow">New on Electra Index</div>
      <h1>New listings</h1>
      <p className="lede">The latest AI agents and tools added to the index, day by day. Built an agent? Listing is free and never changes a score.</p>
      <div className="chips" style={{ marginTop: 16 }}>
        <Link href="/submit" className="btn primary">List your agent →</Link>
      </div>

      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected={tab === "agents"} href="/new" className={tab === "agents" ? "on" : ""}>New agents</Link>
        <Link role="tab" aria-selected={tab === "tools"} href="/new?tab=tools" className={tab === "tools" ? "on" : ""}>New tools</Link>
        <Link role="tab" aria-selected={tab === "changes"} href="/new?tab=changes" className={tab === "changes" ? "on" : ""}>Price &amp; version changes</Link>
      </div>

      {tab === "agents" ? (
        agents.length === 0 ? <div style={{ marginTop: 16 }}><Empty title="No new agent yet">New agents appear here as soon as they are listed.</Empty></div> :
        byDay(agents, (a) => a.first_seen_at).map((g) => (
          <section key={g.label}>
            <h2 className="day">{g.label} <span className="mono faint small">{g.rows.length}</span></h2>
            <div className="launches">
              {g.rows.map((a) => (
                <Link key={a.id} href={`/agents/${a.slug}`} className="launch">
                  <Logo name={a.name} website={a.website} size={44} />
                  <span className="body">
                    <span className="strong ink">{a.name}</span> <span className="small muted">{a.company && a.company !== a.name ? `by ${a.company}` : ""}</span>
                    <span className="desc2">{a.short_description}</span>
                    <span className="tags">{(a.themes ?? []).map((t) => <span key={t} className="badge">{t.toUpperCase()}</span>)}</span>
                  </span>
                  <span className="side"><Quality score={a.quality_score} /><span className="small"><Price from={a.from_usd_month} free={a.has_free} hasPricing /></span></span>
                </Link>
              ))}
            </div>
          </section>
        ))
      ) : tab === "tools" ? (
        tools.length === 0 ? <div style={{ marginTop: 16 }}><Empty title="No new tool yet">New tools appear here as soon as our robots find them.</Empty></div> :
        byDay(tools, (m) => m.first_seen_at).map((g) => (
          <section key={g.label}>
            <h2 className="day">{g.label} <span className="mono faint small">{g.rows.length}</span></h2>
            <div className="launches">
              {g.rows.map((m) => (
                <Link key={m.id} href={`/mcp/${m.slug}`} className="launch">
                  <Logo name={m.name} website={m.website} size={44} />
                  <span className="body">
                    <span className="strong ink">{m.name}</span> <span className="mono faint small">{m.version ?? ""}</span>
                    <span className="desc2">{m.short_description}</span>
                  </span>
                  <span className="side"><span className="pills"><Tri label="REMOTE" value={m.remote} /><Tri label="LOCAL" value={m.local} /></span><span className="mono small muted">{timeAgo(m.first_seen_at)}</span></span>
                </Link>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="card" style={{ marginTop: 16 }}>
          {changes.length === 0 ? <div className="card-body"><Empty title="No change yet">A change is reported only when a robot has an earlier observation to compare with: price up or down, new version, new plan.</Empty></div>
            : <ul className="signals">{changes.map((s) => <SignalItem key={s.id} s={s} />)}</ul>}
        </div>
      )}
    </>
  );
}
