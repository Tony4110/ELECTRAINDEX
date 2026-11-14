import type { Metadata } from "next";
import Link from "next/link";
import { MCP_NOV_2026 as R, pct, n } from "@/lib/research";
import { SITE } from "@/lib/site";

const URL = `/research/${R.slug}`;
const DESC = `Of ${n(R.tested)} hosted MCP servers from the Official MCP Registry tested live by Electra Index, ${pct(R.onlineTools, R.tested)} answered and listed their tools, ${pct(R.auth, R.tested)} required a key and ${pct(R.noAnswer, R.tested)} did not answer.`;

export const metadata: Metadata = {
  title: R.title,
  description: DESC,
  alternates: { canonical: URL },
  openGraph: { title: `${R.title} · Electra Index Research`, description: DESC, type: "article", url: URL },
};

const BARS = [
  { k: "Answered and listed tools", v: R.onlineTools, c: "#16A34A" },
  { k: "Reachable, key or sign-in required", v: R.auth, c: "#E9A916" },
  { k: "Did not answer", v: R.noAnswer, c: "#DC2626" },
  { k: "Answered, no tool listed", v: R.onlineNoTools, c: "#8A8F8C" },
];

function StatusChart() {
  const W = 760, H = 210, left = 250, barH = 30, gap = 18;
  const max = Math.max(...BARS.map((b) => b.v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Live-check result of hosted MCP servers" style={{ width: "100%", height: "auto", display: "block" }}>
      {BARS.map((b, i) => {
        const y = 14 + i * (barH + gap);
        const w = Math.max(3, ((W - left - 150) * b.v) / max);
        return (
          <g key={b.k}>
            <text x={left - 12} y={y + barH / 2 + 5} textAnchor="end" fontSize="14" fill="currentColor">{b.k}</text>
            <rect x={left} y={y} width={w} height={barH} rx={6} fill={b.c} />
            <text x={left + w + 10} y={y + barH / 2 + 5} fontSize="14" fontWeight={700} fill="currentColor">{n(b.v)} · {pct(b.v, R.tested)}</text>
          </g>
        );
      })}
    </svg>
  );
}

const CITE = `Electra Index, "${R.title}", ${R.dateLabel}. ${SITE}${URL}`;

export default function StateOfMcpNov2026() {
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Article", headline: R.title, datePublished: R.date, dateModified: R.date, description: DESC,
      author: { "@type": "Organization", name: "Electra Index" }, publisher: { "@type": "Organization", name: "Dreamotion OÜ", url: "https://dreamotion.io" }, mainEntityOfPage: `${SITE}${URL}` },
    { "@context": "https://schema.org", "@type": "Dataset", name: `${R.title} — headline figures`, description: DESC, url: `${SITE}${URL}`, temporalCoverage: R.date,
      license: "https://creativecommons.org/licenses/by/4.0/", creator: { "@type": "Organization", name: "Electra Index" },
      distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}${R.csv}` }] },
  ];
  return (
    <article className="research">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/research">Research</Link><span>/</span><span className="ink">{R.title}</span></nav>
      <div className="eyebrow">Electra Index Research · Snapshot of {R.dateLabel}</div>
      <h1>{R.title}</h1>
      <p className="rs-lede">We connected to every hosted MCP server listed in the Official MCP Registry, the way an AI assistant would, and asked each one for its tools. <b>Only {pct(R.onlineTools, R.tested)} answered and listed them without credentials.</b></p>

      <div className="rs-kpis">
        <div className="rs-kpi"><b>{n(R.servers)}</b><span>MCP servers indexed</span></div>
        <div className="rs-kpi"><b>{pct(R.remote, R.servers)}</b><span>declare a hosted endpoint ({n(R.remote)})</span></div>
        <div className="rs-kpi"><b>{n(R.tested)}</b><span>hosted servers tested live</span></div>
        <div className="rs-kpi"><b>{n(R.tools)}</b><span>tools exposed by online servers</span></div>
      </div>

      <h2>Key findings</h2>
      <ol className="rs-findings">
        <li><b>{pct(R.onlineTools, R.tested)} of hosted MCP servers are usable on first contact.</b> {n(R.onlineTools)} of the {n(R.tested)} hosted servers we tested answered an anonymous MCP session and listed at least one tool.</li>
        <li><b>Almost one in three asks for a key.</b> {n(R.auth)} servers ({pct(R.auth, R.tested)}) are reachable but require an API key or a sign-in before showing anything. This is often by design (paid or private services), not a failure.</li>
        <li><b>{pct(R.noAnswer, R.tested)} did not answer at all.</b> {n(R.noAnswer)} declared endpoints returned nothing usable: address not found, not an MCP response, server error, timeout or connection failure.</li>
        <li><b>A typical server offers {R.medianTools} tools; a few offer hundreds.</b> Online servers expose {n(R.tools)} tools in total, an average of {(Math.round((R.tools / R.onlineTools) * 10) / 10).toLocaleString("en-US")} per server against a median of {R.medianTools}: a small number of very large servers pull the average up.</li>
        <li><b>Two thirds of registry servers are now hosted.</b> {pct(R.remote, R.servers)} of the servers in the registry declare a remote endpoint, which an assistant can use without installing anything locally.</li>
      </ol>

      <div className="card rs-chart">
        <div className="small muted" style={{ marginBottom: 8 }}>Live-check result of {n(R.tested)} hosted MCP servers · {R.dateLabel}</div>
        <StatusChart />
        <div className="small muted" style={{ marginTop: 8 }}>Source: Electra Index live check. Free to reuse with a link to this page (CC BY 4.0).</div>
      </div>

      <h2>AI agents: what the published prices say</h2>
      <p>Electra Index lists {n(R.agents)} AI agents and reads their prices on their official pricing pages.</p>
      <ul className="rs-list">
        <li><b>{pct(R.agentsFree, R.agents)}</b> offer a free plan ({n(R.agentsFree)} of {n(R.agents)}).</li>
        <li><b>{pct(R.agentsPaidPrice, R.agents)}</b> publish a monthly or yearly paid price in US dollars ({n(R.agentsPaidPrice)}). The others are free only, priced on request, or priced by usage or in another currency.</li>
        <li>The <b>median entry price is ${R.medianEntryUsd} a month</b> (cheapest paid plan; yearly plans divided by 12).</li>
      </ul>
      <p className="small muted">Price history: Electra Index started recording prices in October 2026. We will publish price changes once several months of observations exist, never before.</p>

      <h2>Method</h2>
      <ul className="rs-list">
        <li><b>Scope.</b> All published MCP servers from the <a href="https://registry.modelcontextprotocol.io" target="_blank" rel="noopener noreferrer">Official MCP Registry</a> indexed by Electra Index on {R.dateLabel}. Servers that only run locally cannot be tested remotely and are counted in the total only.</li>
        <li><b>Live check.</b> For each declared hosted endpoint (https only), our robot <code>ElectraIndexBot</code> sends the MCP <code>initialize</code> request, then <code>tools/list</code>. It never calls a tool and never sends a key or token. Each server is re-checked every few days, with a few requests per host at most.</li>
        <li><b>States.</b> <i>Answered and listed tools</i>: valid MCP answer and at least one tool. <i>Key or sign-in required</i>: HTTP 401 or 403. <i>Did not answer</i>: not found (404/405/410), not an MCP response, server error or rate limit (5xx/429), no answer within 15 seconds, or DNS/TLS/connection failure, at the last check.</li>
        <li><b>Tools.</b> Counted from the first page of <code>tools/list</code> (up to 100 per server), so very large servers are slightly under-counted.</li>
      </ul>

      <h2>Limits</h2>
      <ul className="rs-list">
        <li>&quot;Did not answer&quot; describes one moment. A server can be down temporarily, block automated clients or have moved. On the site, a server is marked as not responding only after two failed checks in a row.</li>
        <li>&quot;Key required&quot; is not a defect: many professional servers are private or paid on purpose.</li>
        <li>Online means the server answered. It says nothing about security, quality or continuous uptime.</li>
        <li>The registry contains duplicates and test entries; we publish what it lists, without manual cleaning.</li>
      </ul>

      <h2>Use these figures</h2>
      <div className="card rs-cite">
        <p className="small" style={{ margin: "0 0 8px" }}>Free to quote and reuse under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, with a link to this page. Suggested citation:</p>
        <pre className="rs-pre">{CITE}</pre>
        <p style={{ margin: "12px 0 0" }}><a className="btn primary" href={R.csv} download>Download the data (CSV)</a> <Link className="btn" href="/press">Press kit</Link></p>
      </div>
      <p className="small muted">Questions, corrections or data requests: <a href="mailto:contact@electraindex.com">contact@electraindex.com</a>. Browse the servers: <Link href="/mcp">MCP Tools</Link> · <Link href="/sources#live-check">full methodology</Link>.</p>
    </article>
  );
}
