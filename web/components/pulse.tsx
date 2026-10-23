import Link from "next/link";
import { num, shortDate, show } from "@/lib/format";
import type { PulseEdition, PulsePrice } from "@/lib/pulse";
import { weekLabel, rangeLabel } from "@/lib/pulse";

const PRICE_LABEL: Record<string, string> = {
  price_increase: "Price up", price_decrease: "Price down", plan_added: "New plan", plan_removed: "Plan removed", discontinued: "Plan discontinued",
};
const cut = (s: string | null | undefined, n = 150) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "…";
};
const priceText = (p: PulsePrice) => {
  const o = p.old == null ? "" : show(p.old), n = p.new == null ? "" : show(p.new);
  return o && n ? `${o} → ${n}` : n || o;
};

export function PulseView({ e, editions }: { e: PulseEdition; editions: { week: string; week_start: string }[] }) {
  const d = e.data;
  const L = d.live;
  return (
    <>
      <div className="eyebrow">MCP &amp; Agent Pulse</div>
      <h1>{weekLabel(d.week)}: what changed in the agent economy</h1>
      <p className="lede">{rangeLabel(d.from, d.to)} · Every figure is counted from the Electra Index database and frozen on {shortDate(d.collected_at)}. Nothing is estimated.</p>

      <div className="stats-line" aria-label="This week in numbers" style={{ marginTop: 20 }}>
        <span><b>{num(d.totals.new_servers)}</b> new MCP servers</span>
        <span><b>{num(d.totals.new_versions)}</b> new versions</span>
        <span><b>{num(d.totals.new_agents)}</b> new AI agents</span>
        <span><b>{num(d.totals.price_changes)}</b> price updates</span>
        <span><b>{num(d.totals.servers_listed)}</b> servers listed in total</span>
      </div>

      {d.new_servers.length ? (
        <section className="pulse-section">
          <div className="section-title"><h2>New MCP servers worth a look</h2><span className="spacer" /><Link href="/new?tab=tools" className="strong">All new tools →</Link></div>
          <p className="small muted">{num(d.totals.new_servers)} servers were first seen this week, {num(d.totals.new_hosted)} of them hosted. Shown first: those that answered our live check, with the most tools.</p>
          <div className="launches">
            {d.new_servers.map((s) => (
              <Link key={s.slug} href={`/mcp/${s.slug}`} className="launch">
                <span className="body">
                  <span className="strong ink">{s.name}</span>{" "}
                  {s.live === "online" ? <span className="badge live-ok">ONLINE{s.tools ? ` · ${s.tools} TOOLS` : ""}</span> : s.live === "auth_required" ? <span className="badge trust">KEY REQUIRED</span> : s.remote ? <span className="badge">HOSTED</span> : <span className="badge">LOCAL</span>}
                  <span className="desc2">{cut(s.description)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="pulse-section">
        <div className="section-title"><h2>Live check</h2><span className="spacer" /><Link href="/sources#live-check" className="strong">How we test →</Link></div>
        {L.tested ? (
          <>
            <p>Our robot has connected to <b>{num(L.tested)}</b> hosted MCP servers so far: <b>{num(L.online)}</b> answered (online), <b>{num(L.auth_required)}</b> ask for a key or a sign-in, <b>{num(L.down)}</b> did not answer two checks in a row. &quot;Online&quot; only means the server answered at the time of the check.</p>
            <div className="grid cols-3" style={{ marginTop: 12 }}>
              <div className="card"><div className="card-head"><h3>Most tools offered</h3></div><div className="card-body">{L.most_tools.length ? <ul className="plain">{L.most_tools.map((s) => <li key={s.slug}><Link href={`/mcp/${s.slug}`}>{s.name}</Link> <span className="small muted">· {s.tools}{s.more ? "+" : ""} tools</span></li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>No tool list yet.</p>}</div></div>
              <div className="card"><div className="card-head"><h3>Stopped answering</h3></div><div className="card-body">{L.stopped_answering.length ? <ul className="plain">{L.stopped_answering.map((s) => <li key={s.slug}><Link href={`/mcp/${s.slug}`}>{s.name}</Link>{s.last_online_at ? <span className="small muted"> · last answer {shortDate(s.last_online_at)}</span> : null}</li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>None confirmed this week.</p>}</div></div>
              <div className="card"><div className="card-head"><h3>Back online</h3></div><div className="card-body">{L.back_online.length ? <ul className="plain">{L.back_online.map((s) => <li key={s.slug}><Link href={`/mcp/${s.slug}`}>{s.name}</Link></li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>None this week.</p>}</div></div>
            </div>
          </>
        ) : <p className="muted">The live check started after this week. Results appear in the next edition.</p>}
      </section>

      <section className="pulse-section">
        <div className="section-title"><h2>Price updates on Electra Index</h2><span className="spacer" /><Link href="/new?tab=changes" className="strong">All changes →</Link></div>
        {d.prices.length ? (
          <div className="card"><ul className="signals">{d.prices.map((p, i) => (
            <li key={p.slug + p.at + i}><span className="badge attn">{(PRICE_LABEL[p.event] ?? p.event).toUpperCase()}</span> <Link href={`/agents/${p.slug}`} className="strong">{p.name}</Link> <span className="small muted">{priceText(p)} · {shortDate(p.at)}</span></li>
          ))}</ul></div>
        ) : <p className="muted">No price update this week.</p>}
        <p className="small muted">Every update was checked on the vendor&apos;s official pricing page. It can be a change by the vendor or a correction of our data after a review: the agent page keeps the full price history.</p>
      </section>

      {d.new_agents.length ? (
        <section className="pulse-section">
          <div className="section-title"><h2>New AI agents listed</h2><span className="spacer" /><Link href="/new" className="strong">All new agents →</Link></div>
          <div className="launches">{d.new_agents.map((a) => (
            <Link key={a.slug} href={`/agents/${a.slug}`} className="launch"><span className="body"><span className="strong ink">{a.name}</span><span className="desc2">{cut(a.description)}</span></span></Link>
          ))}</div>
        </section>
      ) : null}

      {d.use_cases.length ? (
        <section className="pulse-section">
          <div className="section-title"><h2>Use cases that grew the most</h2><span className="spacer" /><Link href="/mcp/best" className="strong">All use cases →</Link></div>
          <div className="chips">{d.use_cases.map((u) => <Link key={u.slug} href={`/mcp/best/${u.slug}`} className="chip">{u.name} <span className="mono small">+{u.new_servers}</span></Link>)}</div>
        </section>
      ) : null}

      {d.sponsors?.length ? (
        <section className="pulse-section">
          <div className="section-title"><h2>Launch Spotlight</h2><span className="badge">SPONSORED</span><span className="spacer" /><Link href="/spotlight" className="small faint">What is this?</Link></div>
          <div className="launches">{d.sponsors.map((a) => (
            <Link key={`${a.type}-${a.slug}`} href={a.type === "agent" ? `/agents/${a.slug}` : `/mcp/${a.slug}`} className="launch"><span className="body"><span className="strong ink">{a.name}</span><span className="desc2">{cut(a.description)}</span></span></Link>
          ))}</div>
          <p className="small muted">Paid placements, listed separately. They never change a score or a rank.</p>
        </section>
      ) : null}

      <p className="note" style={{ marginTop: 32 }}>Method: weeks run Monday to Sunday (UTC). &quot;New&quot; means first seen by Electra Index in the Official MCP Registry. Use cases are matched automatically from each publisher&apos;s description. Prices come from official pricing pages. <Link href="/sources">Methodology</Link></p>

      {editions.length > 1 ? (
        <section className="pulse-section">
          <h2 style={{ fontSize: 18 }}>Past editions</h2>
          <div className="chips">{editions.map((x) => <Link key={x.week} href={`/pulse/${x.week}`} className={`chip ${x.week === d.week ? "on" : ""}`}>{weekLabel(x.week)}</Link>)}</div>
        </section>
      ) : null}
    </>
  );
}
