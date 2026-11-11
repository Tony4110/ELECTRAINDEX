import type { Metadata } from "next";
import Link from "next/link";
import { MCP_NOV_2026 as R, pct, n } from "@/lib/research";

export const metadata: Metadata = {
  title: "Press kit",
  description: "Electra Index press kit: what it is, key figures, methodology, independence rules, logos and contact.",
  alternates: { canonical: "/press" },
};

export default function Press() {
  return (
    <div className="research">
      <div className="eyebrow">Press kit</div>
      <h1>Electra Index in one page</h1>
      <p className="rs-lede">Electra Index is an independent index of AI agents, MCP servers and AI apps. It tests hosted MCP servers live, reads agent prices on their official pages and ranks agents on quality, price and trust. Rankings are never for sale.</p>

      <h2>Key figures <span className="small muted">· {R.dateLabel}</span></h2>
      <div className="rs-kpis">
        <div className="rs-kpi"><b>{n(R.servers)}</b><span>MCP servers indexed</span></div>
        <div className="rs-kpi"><b>{n(R.tested)}</b><span>hosted MCP servers tested live</span></div>
        <div className="rs-kpi"><b>{pct(R.onlineTools, R.tested)}</b><span>answered and listed their tools</span></div>
        <div className="rs-kpi"><b>{n(R.agents)}</b><span>AI agents ranked</span></div>
        <div className="rs-kpi"><b>${R.medianEntryUsd}/mo</b><span>median entry price of a paid agent</span></div>
        <div className="rs-kpi"><b>{n(R.tasks)}</b><span>everyday tasks mapped to agents</span></div>
      </div>
      <p className="small muted">Source and method: <Link href={`/research/${R.slug}`}>{R.title}</Link> (<a href={R.csv} download>CSV</a>).</p>

      <h2>What makes it different</h2>
      <ul className="rs-list">
        <li><b>Checked, not declared.</b> Hosted MCP servers are tested by a robot that connects like an AI assistant; agent prices are read on official pricing pages and dated.</li>
        <li><b>Independent.</b> No one can pay for a better score or rank. Sponsored slots are labelled; an optional paid express review buys speed only and is refunded if the product is not listed.</li>
        <li><b>Open.</b> Figures are free to reuse under CC BY 4.0; agents can query the index through its own <Link href="/mcp-server">MCP server</Link>.</li>
      </ul>

      <h2>About</h2>
      <p>Electra Index is published by <a href="https://dreamotion.io" rel="noopener">Dreamotion OÜ</a> (Estonia &amp; Switzerland), founded by Tony Nelson. Live since October 2026, in English and French.</p>

      <h2>Logos</h2>
      <p className="rs-logos">
        <span className="rs-logo"><span className="logo" style={{ fontSize: 28 }}>ELECTRA<span className="sub">INDEX</span></span></span>
      </p>
      <p className="small muted">Please write the name as &quot;Electra Index&quot;. Logo files on request.</p>

      <h2>Contact</h2>
      <p><a href="mailto:contact@electraindex.com">contact@electraindex.com</a> — data requests, interviews and corrections.</p>
    </div>
  );
}
