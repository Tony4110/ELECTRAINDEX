import Link from "next/link";
import { db, getSignals, getStats, type AgentCard } from "@/lib/db";
import { num, timeAgo } from "@/lib/format";
import { SignalItem, SetupNotice } from "@/components/ui";
import { Logo } from "@/components/rank";
import SponsorSlot from "@/components/sponsor-slot";
import { loadEcosystem } from "@/components/reliability";
import { getX402Summary, priceText } from "@/lib/x402";

type Trend = { type: "agent" | "mcp_server" | "app"; slug: string; name: string; website: string | null; stars_gain: number | null; downloads: number | null; downloads_growth: number | null };
type Launch = { type: "agent" | "mcp_server" | "app"; slug: string; name: string; short_description: string | null; website: string | null; first_seen_at: string };
const href = (x: { type: string; slug: string }) => (x.type === "agent" ? `/agents/${x.slug}` : x.type === "app" ? `/apps/${x.slug}` : `/mcp/${x.slug}`);
const LABEL: Record<string, string> = { agent: "AGENT", mcp_server: "MCP", app: "APP" };
const k = (n: number | null | undefined) => (n == null ? "—" : Number(n) >= 1000 ? `${(Number(n) / 1000).toFixed(Number(n) >= 10000 ? 0 : 1)}k` : String(Math.round(Number(n))));

/** English home: a live dashboard that opens on the three doors (MCP tools, agent payments, AI agents). */
export async function HomeDashboard() {
  const c = db();
  if (!c) return <SetupNotice />;
  const [stats, eco, pay, signals, top, trend24, launches] = await Promise.all([
    getStats(),
    loadEcosystem(c),
    getX402Summary(),
    getSignals(6),
    c.from("v_agent_cards").select("slug,name,website,quality_score").order("quality_score", { ascending: false, nullsFirst: false }).limit(3).then((r) => (r.data as Pick<AgentCard, "slug" | "name" | "website" | "quality_score">[] | null) ?? []),
    c.from("v_trending").select("type,slug,name,website,stars_gain,downloads,downloads_growth").eq("period", "24h").order("score", { ascending: false }).limit(6).then((r) => (r.data as Trend[] | null) ?? []),
    c.from("v_launches").select("type,slug,name,short_description,website,first_seen_at").order("first_seen_at", { ascending: false }).limit(6).then((r) => (r.data as Launch[] | null) ?? []),
  ]);
  const trend = trend24.length ? trend24 : ((await c.from("v_trending").select("type,slug,name,website,stars_gain,downloads,downloads_growth").eq("period", "7d").order("score", { ascending: false }).limit(6)).data as Trend[] | null) ?? [];
  const agents = stats?.agents ?? 0;

  return (
    <>
      <section className="ft-band hd-band">
        <div className="ft-live">
          <span className="dot" /><b>Live</b><span className="sep" />
          <span><b>{num(stats?.mcp_servers)}</b> MCP servers</span><span className="sep" />
          <span><b>{pay ? num(pay.services) : "—"}</b> x402 services</span><span className="sep" />
          <span><b>{num(agents)}</b> AI agents</span>
          {eco ? <><span className="sep" /><Link href="/mcp-reliability-index" className="ft-idx">Reliability Index <b>{eco.value.toFixed(1)}%</b> · 7 days →</Link></> : null}
        </div>
        <h1 className="ft-title">The trust layer for the agent economy</h1>
        <p className="hd-sub">Compare, test and verify the tools, payments and agents that power AI.</p>
        <form className="ft-search" action="/search" method="get" role="search">
          <label htmlFor="hq" className="sr-only">Search the index</label>
          <input id="hq" name="q" type="search" placeholder="e.g. send an invoice, scrape a website, pay per API call" autoComplete="off" />
          <button className="btn primary" type="submit">Search</button>
        </form>
      </section>

      <div className="hd-doors">
        <div className="hd-door d-mcp">
          <span className="hd-k"><span className="hd-dot" />LIVE · MCP TOOLS</span>
          <b className="hd-n">{num(stats?.mcp_servers)}</b>
          <span className="hd-s">MCP servers your AI assistant can connect to</span>
          {eco ? <Link href="/mcp-reliability-index" className="hd-idx">Reliability Index <b>{eco.value.toFixed(1)}%</b> · 7 days →</Link> : <span className="hd-m">Live checks every day</span>}
          <Link href="/mcp" className="hd-go hd-stretch">Find a tool →</Link>
        </div>
        <Link href="/payments" className="hd-door d-pay">
          <span className="hd-k"><span className="hd-dot" />LIVE · AGENT PAYMENTS x402</span>
          <b className="hd-n">{pay ? num(pay.services) : "—"}</b>
          <span className="hd-s">paid services AI agents can pay per call</span>
          <span className="hd-m">{pay?.passing_now_pct != null ? <><b>{Number(pay.passing_now_pct)}%</b> payable · median <b>{priceText(pay.median_price_usd)}</b> per call</> : "Tested without paying"}</span>
          <span className="hd-go">See what agents can pay →</span>
        </Link>
        <Link href="/agents" className="hd-door d-ag">
          <span className="hd-k"><span className="hd-dot" />LIVE · AI AGENTS</span>
          <b className="hd-n">{num(agents)}</b>
          <span className="hd-s">AI agents ranked on quality and price</span>
          <span className="hd-m">{top.length ? <>Top: {top.map((a) => a.name).join(" · ")}</> : "Prices read on each vendor's page"}</span>
          <span className="hd-go">Compare agents →</span>
        </Link>
      </div>

      <SponsorSlot site="electra" slot="home-sponsor" />

      <div className="hd-live">
        <section className="hd-col">
          <div className="hd-h"><h2>Trending today</h2><Link href="/trending">24h · 7d · 30d →</Link></div>
          {trend.length ? (
            <ol className="hd-list">
              {trend.map((t, i) => (
                <li key={t.type + t.slug}>
                  <span className="mono faint">{i + 1}</span>
                  <Link href={href(t)} className="hd-it"><Logo name={t.name} website={t.website} size={24} /><span className="strong ink">{t.name}</span><span className={`tr-type t-${t.type}`}>{LABEL[t.type]}</span></Link>
                  <span className="mono small">{t.stars_gain && Number(t.stars_gain) > 0 ? <span className="tr-pct pos">+{k(t.stars_gain)}★</span> : t.downloads ? <>{k(t.downloads)} dl</> : null}</span>
                </li>
              ))}
            </ol>
          ) : <p className="small muted">The first readings are being collected.</p>}
        </section>
        <section className="hd-col">
          <div className="hd-h"><h2>New this week</h2><Link href="/new">All launches →</Link></div>
          <ol className="hd-list">
            {launches.map((l) => (
              <li key={l.type + l.slug}>
                <Link href={href(l)} className="hd-it"><Logo name={l.name} website={l.website} size={24} /><span className="strong ink">{l.name}</span><span className={`tr-type t-${l.type}`}>{LABEL[l.type]}</span></Link>
                <span className="small muted">{timeAgo(l.first_seen_at)}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="hd-col">
          <div className="hd-h"><h2>What changed</h2><Link href="/pulse">Pulse →</Link></div>
          {signals.length ? <ul className="signals hd-sig">{signals.map((s) => <SignalItem key={s.id} s={s} />)}</ul> : <p className="small muted">No change detected yet today.</p>}
        </section>
      </div>

      <div className="hd-pub">
        <div>
          <b>Publish an MCP server, an x402 service or an AI agent?</b>
          <span className="muted"> Get tested free, follow your reliability and add the Electra badge to your site.</span>
        </div>
        <Link href="/submit" className="btn dark">List your product, free</Link>
      </div>

      <div className="stats-line" aria-label="Index at a glance" style={{ marginTop: 24 }}>
        <span><b>{num(stats?.mcp_servers)}</b> MCP servers</span>
        <span><b>{pay ? num(pay.services) : "—"}</b> x402 services</span>
        <span><b>{num(agents)}</b> AI agents</span>
        <span><b>{num(stats?.tasks)}</b> tasks</span>
        <span><b>{num(stats?.signals_24h)}</b> changes in 24 h</span>
        <span className="muted"><Link href="/sources">Methodology</Link></span>
      </div>
    </>
  );
}
