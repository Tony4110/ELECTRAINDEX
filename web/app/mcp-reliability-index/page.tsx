import type { Metadata } from "next";
import Link from "next/link";
import { loadIndex, type IndexDay } from "@/lib/reliability-index";
import { SITE } from "@/lib/site";

export const revalidate = 3600;

const TITLE = "Electra MCP Reliability Index";
export const metadata: Metadata = {
  title: `${TITLE} — daily reliability of hosted MCP servers`,
  description: "A daily, independent measure of how often hosted MCP servers answer: published every day by Electra Index from tens of thousands of live tests, with a 7-day stability figure, full history and open data (CC BY 4.0).",
  alternates: { canonical: "/mcp-reliability-index" },
};

const f = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);
const n = (v: number) => v.toLocaleString("en-US");
const dl = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Chart({ rows }: { rows: IndexDay[] }) {
  const pts = rows.slice().reverse().filter((r) => r.d_global != null);
  if (pts.length < 2) return null;
  const W = 760, H = 240, L = 44, R = 12, T = 12, B = 28;
  const vals = pts.flatMap((p) => [p.d_global!, p.w_global ?? p.d_global!]);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 2) / 5) * 5), hi = Math.min(100, Math.ceil((Math.max(...vals) + 2) / 5) * 5);
  const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / Math.max(1, hi - lo);
  const line = (k: "d_global" | "w_global") => pts.map((p, i) => (p[k] == null ? "" : `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]!).toFixed(1)}`)).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${TITLE}: daily and 7-day global success rate`} style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="currentColor" opacity={0.12} /><text x={L - 6} y={y(t) + 4} fontSize="11" textAnchor="end" fill="currentColor" opacity={0.6}>{t}%</text></g>)}
      <path d={line("w_global")} fill="none" stroke="#1F3FD1" strokeWidth={2.5} />
      <path d={line("d_global")} fill="none" stroke="#E9A916" strokeWidth={1.5} opacity={0.9} />
      <text x={L} y={H - 8} fontSize="11" fill="currentColor" opacity={0.6}>{dl(pts[0].day)}</text>
      <text x={W - R} y={H - 8} fontSize="11" textAnchor="end" fill="currentColor" opacity={0.6}>{dl(pts[pts.length - 1].day)}</text>
    </svg>
  );
}

export default async function ReliabilityIndexPage() {
  const rows = await loadIndex(400);
  const t = rows[0];
  const prev = rows.find((r) => t && r.day < t.day && r.w_global != null);
  const delta = t && prev && t.w_global != null && prev.w_global != null ? Math.round((t.w_global - prev.w_global) * 10) / 10 : null;
  const cite = t ? `Electra Index, "${TITLE}", ${dl(t.day)}. ${SITE}/mcp-reliability-index` : `Electra Index, "${TITLE}". ${SITE}/mcp-reliability-index`;
  return (
    <article className="research">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/research">Research</Link><span>/</span><span className="ink">{TITLE}</span></nav>
      <div className="eyebrow">Independent data · updated every day at 00:30 UTC</div>
      <h1>{TITLE}</h1>
      <p className="rs-lede">How often do hosted MCP servers answer? Every day, Electra Index tests tens of thousands of them the way an AI assistant would, and publishes the result here. Same calculation for every server, full history, open data.</p>

      {!t ? <p className="muted">The first values are being published.</p> : (
        <>
          <div className="rs-kpis">
            <div className="rs-kpi"><b>{f(t.d_global)}</b><span>Daily · global test success rate · {dl(t.day)}</span></div>
            <div className="rs-kpi"><b>{f(t.w_global)}</b><span>Stability · 7 days{delta != null ? ` · ${delta >= 0 ? "+" : ""}${delta} pt vs previous day` : ""}</span></div>
            <div className="rs-kpi"><b>{f(t.d_server_avg)}</b><span>Daily · server reliability average (each server weighs the same)</span></div>
            <div className="rs-kpi"><b>{n(t.d_checks)}</b><span>conclusive tests of {n(t.d_servers)} servers that day</span></div>
          </div>
          {t.insufficient ? <p className="small"><span className="badge">INSUFFICIENT SAMPLE</span> Fewer than 1,000 conclusive tests or 500 servers that day: read with care.</p> : null}

          <div className="card rs-chart">
            <div className="small muted" style={{ marginBottom: 8 }}><span style={{ color: "#1F3FD1", fontWeight: 700 }}>━ 7-day stability</span> · <span style={{ color: "#B7791F", fontWeight: 700 }}>━ daily</span> · global test success rate</div>
            <Chart rows={rows} />
            <div className="small muted" style={{ marginTop: 8 }}>Source: Electra Index · updated daily · <a href="#method">Methodology</a> · free to reuse with a link to this page (CC BY 4.0).</div>
          </div>

          <h2>Last 14 days</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Day (UTC)</th><th>Daily global</th><th>Daily server avg</th><th>Tests</th><th>Answers</th><th>Failures</th><th>Servers</th><th>7-day global</th><th>7-day server avg</th></tr></thead>
              <tbody>{rows.slice(0, 14).map((r) => (
                <tr key={r.day}><td className="mono">{r.day}</td><td><b>{f(r.d_global)}</b></td><td>{f(r.d_server_avg)}</td><td>{n(r.d_checks)}</td><td>{n(r.d_answers)}</td><td>{n(r.d_failures)}</td><td>{n(r.d_servers)}</td><td>{f(r.w_global)}</td><td>{f(r.w_server_avg)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      <h2 id="method">Method</h2>
      <ul>
        <li><b>What is tested:</b> every hosted MCP server of the Official MCP Registry that declares an endpoint. Our robot opens an MCP session and asks for the tool list, as an AI assistant would. About every 2 days per server, more often for servers under Electra Verified or Monitoring Pro.</li>
        <li><b>Answer or failure:</b> a server that answers, or asks for a key or sign-in, counts as an answer. Timeouts (15 s), unreachable endpoints, server errors, missing addresses and invalid MCP replies count as failures. Rate-limited tests (429), other inconclusive replies and tests made during an incident on our side are not counted, and their number is published.</li>
        <li><b>Daily:</b> the UTC day from 00:00 to 24:00. <b>Stability:</b> the 7 UTC days ending that day.</li>
        <li><b>Two measures:</b> the <i>global test success rate</i> counts every test the same; the <i>server reliability average</i> counts every server the same, so servers tested more often do not weigh more.</li>
        <li><b>Archive:</b> one value per day, computed at 00:30 UTC and never rewritten. A correction is published as a separate, dated entry. Days before 25 Nov 2026 were computed from our kept history at the first publication.</li>
        <li><b>Limits:</b> these are our observations at each test, not continuous uptime nor a guarantee of future availability. The index measures availability, not quality or security. Same method as on each <Link href="/sources#reliability">server page</Link>.</li>
      </ul>

      <h2>Use these figures</h2>
      <p>Free to reuse, including commercially, with a link to this page (CC BY 4.0).</p>
      <p className="small"><b>Cite:</b> <code>{cite}</code></p>
      <div className="chips"><a className="btn primary" href="/data/reliability-index-daily.csv">Download the daily data (CSV)</a><Link className="btn" href="/press">Press</Link><Link className="btn" href="/research">All research</Link></div>
    </article>
  );
}
