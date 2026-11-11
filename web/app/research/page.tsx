import type { Metadata } from "next";
import Link from "next/link";
import { MCP_NOV_2026 as R, pct, n } from "@/lib/research";

export const metadata: Metadata = {
  title: "Research — data on MCP servers and AI agents",
  description: "Independent, dated and reusable data on the MCP ecosystem and AI agents, measured by Electra Index: live tests of hosted MCP servers, published agent prices.",
  alternates: { canonical: "/research" },
};

export default function Research() {
  return (
    <div className="research">
      <div className="eyebrow">Electra Index Research</div>
      <h1>Data on MCP servers and AI agents</h1>
      <p className="rs-lede">We measure what actually exists in the agent economy: which MCP servers answer, which tools they expose, what AI agents really cost. Every figure is dated, sourced and free to reuse with a link.</p>

      <h2>Reports</h2>
      <Link href={`/research/${R.slug}`} className="card rs-report">
        <span className="small muted mono">{R.dateLabel} · MCP</span>
        <span className="rs-report-t">{R.title}</span>
        <span className="muted">Only {pct(R.onlineTools, R.tested)} of {n(R.tested)} hosted MCP servers answered and listed their tools on first contact; {pct(R.auth, R.tested)} asked for a key.</span>
        <span className="rs-report-go">Read the report →</span>
      </Link>
      <div className="card rs-report rs-soon">
        <span className="small muted mono">Coming when the history is long enough</span>
        <span className="rs-report-t">AI Agent Pricing Index</span>
        <span className="muted">How the published prices of AI agents change over time. Electra Index records prices since October 2026; we will publish changes only once several months of real observations exist.</span>
      </div>

      <h2>Data and reuse</h2>
      <ul className="rs-list">
        <li><a href={R.csv} download>Headline figures of {R.title} (CSV)</a></li>
        <li>Live data for your own agent: the <Link href="/mcp-server">Electra Index MCP server</Link>.</li>
        <li>License: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>, credit &quot;Electra Index&quot; with a link to the report.</li>
        <li>How we measure: <Link href="/sources">sources &amp; methodology</Link>.</li>
      </ul>
      <p className="small muted">Journalists and researchers: <Link href="/press">press kit</Link> · <a href="mailto:contact@electraindex.com">contact@electraindex.com</a></p>
    </div>
  );
}
