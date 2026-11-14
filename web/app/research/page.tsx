import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { MCP_NOV_2026 as R, pct, n } from "@/lib/research";
import { themeStyle } from "@/lib/theme-style";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Research — live data on MCP servers and AI agents",
  description: "Live, dated and reusable data measured by Electra Index: how many hosted MCP servers answer, which tools they expose, what AI agents cost today, plus monthly reports.",
  alternates: { canonical: "/research" },
};

type Theme = { theme: string; agents: number; free: number; priced: number; median_usd: number | null };
type Live = {
  day: string; computed_at: string;
  data: {
    mcp: { servers: number; remote: number; tested: number; online_tools: number; online_no_tools: number; auth: number; no_answer: number; tools: number; median_tools: number | null; checked_24h: number; last_check: string | null };
    agents: { listed: number; free: number; priced: number; median_usd: number | null; p25_usd: number | null; p75_usd: number | null; last_price_check: string | null; themes: Theme[] };
  };
};

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "—";
const usd = (x: number | null | undefined) => (x == null ? "—" : `$${Number(x).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const label = (slug: string) => (slug === "other" ? "Other" : slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ").replace("Browser Computer Use", "Browser & computer use"));

function Bar({ parts }: { parts: { v: number; c: string; k: string }[] }) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div className="rl-bar" role="img" aria-label={parts.map((p) => `${p.k}: ${p.v}`).join(", ")}>
      {parts.map((p) => <span key={p.k} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />)}
    </div>
  );
}

export default async function Research() {
  let live: Live | null = null;
  const c = db();
  if (c) {
    const { data } = await c.from("v_research_live").select("day,computed_at,data").maybeSingle();
    live = (data as Live | null) ?? null;
  }
  const m = live?.data.mcp;
  const a = live?.data.agents;
  return (
    <div className="research">
      <div className="rl-top">
        <h1 className="rl-h1">Research <span>· live data on MCP servers and AI agents</span></h1>
        <p className="small muted" style={{ margin: 0 }}>Measured every day by Electra Index. Dated, sourced, free to reuse with a link.</p>
      </div>

      {/* ---------- 1. Live data ---------- */}
      <div className="rl-head"><span className="rl-tag live">● Live data</span><span className="small muted">Recomputed every day · last update {when(live?.computed_at)}</span></div>

      <div className="rl-grid">
        <div>
      {m ? (
          <section className="card rl-card">
            <div className="rl-title"><h2>State of MCP — today</h2><span className="small muted">Base: {n(m.tested)} hosted servers tested by our robot (of {n(m.remote)} with a hosted endpoint, {n(m.servers)} in the registry)</span></div>
            <div className="rl-big"><b>{pct(m.online_tools, m.tested)}</b><span>of hosted MCP servers answered and listed their tools at their last check</span></div>
            <Bar parts={[{ k: "Answered and listed tools", v: m.online_tools, c: "#16A34A" }, { k: "Key or sign-in required", v: m.auth, c: "#E9A916" }, { k: "Did not answer", v: m.no_answer, c: "#DC2626" }, { k: "Answered, no tool", v: m.online_no_tools, c: "#8A8F8C" }]} />
            <ul className="rl-legend">
              <li><i style={{ background: "#16A34A" }} />Answered and listed tools <b>{n(m.online_tools)}</b></li>
              <li><i style={{ background: "#E9A916" }} />Key or sign-in required <b>{n(m.auth)}</b> <span className="muted">(often by design, not a failure)</span></li>
              <li><i style={{ background: "#DC2626" }} />Did not answer <b>{n(m.no_answer)}</b></li>
              <li><i style={{ background: "#8A8F8C" }} />Answered, no tool listed <b>{n(m.online_no_tools)}</b></li>
            </ul>
            <div className="rl-mini">
              <div><b>{n(m.tools)}</b><span>tools exposed by online servers</span></div>
              <div><b>{m.median_tools ?? "—"}</b><span>median tools per online server</span></div>
              <div><b>{n(m.checked_24h)}</b><span>servers re-checked in the last 24 h</span></div>
            </div>
            <p className="small muted" style={{ margin: "10px 0 0" }}>Each server is re-checked every few days; latest check {when(m.last_check)}. <Link href="/sources#live-check">How we test</Link> · <Link href="/mcp">Search MCP tools</Link></p>
          </section>
        ) : null}
        </div>
        <aside className="rl-side">
          <span className="rl-tag">Monthly report</span>
          <Link href={`/research/${R.slug}`} className="card rs-report rl-report">
            <span className="small muted mono">{R.dateLabel}</span>
            <span className="rs-report-t">{R.title}</span>
            <span className="muted small">Only {pct(R.onlineTools, R.tested)} of {n(R.tested)} hosted MCP servers answered and listed their tools on first contact; {pct(R.auth, R.tested)} asked for a key.</span>
            <span className="rs-report-go">Read the report →</span>
          </Link>
          <a className="btn" href={R.csv} download>Download the data (CSV)</a>
          <Link className="btn" href="/press">Press kit</Link>
        </aside>
      </div>

      {a ? (
        <section className="card rl-card">
          <div className="rl-title"><h2>AI agent prices — today</h2><span className="small muted">Base: {n(a.listed)} AI agents listed; prices read on official pricing pages, last read {when(a.last_price_check)}</span></div>
          <div className="rl-mini">
            <div><b>{pct(a.free, a.listed)}</b><span>offer a free plan ({n(a.free)})</span></div>
            <div><b>{usd(a.median_usd)}<small>/mo</small></b><span>median entry price of {n(a.priced)} agents with a USD price</span></div>
            <div><b>{usd(a.p25_usd)}–{usd(a.p75_usd)}</b><span>middle half of entry prices</span></div>
          </div>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead><tr><th>Theme</th><th>Agents</th><th>Free plan</th><th>Median entry price</th></tr></thead>
              <tbody>
                {a.themes.map((t) => (
                  <tr key={t.theme}>
                    <td className="strong">{t.theme === "other" ? "Other" : <Link href={`/themes/${t.theme}`} style={{ color: themeStyle(t.theme).color }}>{label(t.theme)}</Link>}</td>
                    <td>{n(t.agents)}</td>
                    <td>{pct(t.free, t.agents)}</td>
                    <td>{t.priced >= 3 ? <>{usd(t.median_usd)}<span className="muted small">/mo · {t.priced} priced</span></> : <span className="muted small">too few prices</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: "10px 0 0" }}>Entry price = cheapest paid monthly plan in USD (yearly plans divided by 12). This is today&apos;s picture, not a trend: price changes will be published as the AI Agent Pricing Index once a few months of history exist.</p>
        </section>
      ) : null}

      {!live ? <p className="muted">Live figures are being prepared. Meanwhile, read the monthly report below.</p> : null}

      <div className="rl-head"><span className="rl-tag">Coming next</span></div>
      <div className="card rs-report rs-soon">
        <span className="small muted mono">Planned · early 2027</span>
        <span className="rs-report-t">AI Agent Pricing Index</span>
        <span className="muted">How the published prices of AI agents change over time. Electra Index records prices since October 2026; we will publish changes only once several months of real observations exist.</span>
      </div>

      {/* ---------- 3. Reuse ---------- */}
      <div className="rl-head"><span className="rl-tag">Data &amp; reuse</span></div>
      <ul className="rs-list">
        <li><a href={R.csv} download>Headline figures of {R.title} (CSV)</a></li>
        <li>Live data for your own agent: the <Link href="/mcp-server">Electra Index MCP server</Link>.</li>
        <li>License: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, credit &quot;Electra Index&quot; with a link.</li>
        <li>New products as they appear: <Link href="/new">Launches</Link>.</li>
      </ul>
      <p className="small muted">Journalists and researchers: <Link href="/press">press kit</Link> · <a href="mailto:contact@electraindex.com">contact@electraindex.com</a></p>
    </div>
  );
}
