import type { Metadata } from "next";
import Link from "next/link";
import { x402Config } from "@/lib/mcp/x402";

export const metadata: Metadata = {
  title: "Pricing — Electra Index for developers, publishers and sponsors",
  description: "Free index, alerts and MCP server. Developer pack: $5 for 600 calls to the paid tools. Free Publisher Program and Monitoring Pro (launch offer: $39.99 once, for life). Sponsored placements that never change a ranking.",
  alternates: { canonical: "/pricing" },
};

const PACK_URL = process.env.NEXT_PUBLIC_STRIPE_PACK_URL ?? "";

export default function PricingPage() {
  const packOn = !!(process.env.MCP_API_SECRET ?? "") && !!PACK_URL;
  const x402On = !!x402Config();
  const lifetimeOn = !!(process.env.NEXT_PUBLIC_STRIPE_MONITOR_LIFETIME_URL ?? "") && !!(process.env.MCP_API_SECRET ?? "");
  return (
    <>
      <div className="eyebrow">Pricing</div>
      <h1>Simple pricing. Rankings are never for sale.</h1>
      <p className="lede">The index is free for everyone. You only pay for extra data or extra visibility, and neither ever changes a score or a rank.</p>

      <div className="grid cols-3 pricing-grid" style={{ marginTop: 28 }}>
        <div className="card price-card">
          <div className="card-body">
            <p className="price-name">Free</p>
            <p className="price-amount">$0</p>
            <ul className="price-list">
              <li>The full index: 210 AI agents, 40,000 MCP servers, verified prices</li>
              <li>Alerts by email when a tool or agent changes</li>
              <li>The <Link href="/mcp-server">Electra Index MCP server</Link>: search, server facts, use-case rankings, agent prices</li>
              <li>Weekly <Link href="/pulse">MCP &amp; Agent Pulse</Link></li>
            </ul>
            <div className="program-box">
              <p className="program-title">Publisher Program · free</p>
              <ul className="price-list" style={{ flex: "none" }}>
                <li>Alert when your MCP server stops responding</li>
                <li>Monthly report of clicks from Electra Index to your site</li>
                <li>Founding pilot: free live testing for the first 10 publishers</li>
              </ul>
              <p className="small" style={{ margin: "6px 0 0" }}>Join from your tool or agent page: tick <i>&quot;I built it&quot;</i> in the <b>Follow</b> box. Not listed yet? <Link href="/submit">List your agent</Link>.</p>
            </div>
            <Link href="/mcp-server" className="btn">Connect the MCP server</Link>
          </div>
        </div>

        <div className="card price-card featured" id="developer-pack">
          <div className="card-body">
            <p className="price-name">Developer pack</p>
            <p className="price-amount">$5 <span className="small muted">one-off</span></p>
            <ul className="price-list">
              <li><b>600 calls</b> to the paid tools of the MCP server, valid <b>6 months</b></li>
              <li>Availability history of any MCP server: every live check, outages, answer rate, versions</li>
              <li>Paid by card. Your key arrives <b>by email within a minute</b></li>
              <li>{x402On ? "Or pay per call ($0.01) with x402, no account" : "Pay per call ($0.01) with x402: coming soon"}</li>
            </ul>
            {packOn ? <a href={PACK_URL} className="btn primary" rel="noopener">Buy a developer pack</a> : <p className="small muted">Coming soon.</p>}
            <p className="small muted" style={{ marginBottom: 0 }}>For people who <b>choose</b> MCP servers. Then follow the <Link href="/mcp-server#setup">setup</Link> for your tool.</p>
          </div>
        </div>

        <div className="card price-card" id="monitoring">
          <div className="card-body">
            <p className="price-name">Monitoring Pro</p>
            {lifetimeOn ? (
              <>
                <p style={{ margin: 0 }}><span className="offer-tag" style={{ margin: 0 }}>Exclusive launch offer</span></p>
                <p className="price-amount">$39.99 <span className="small muted">once, for life</span></p>
                <p className="offer-instead" style={{ margin: 0 }}>Instead of <span className="offer-strike">$9.99/month</span> · <b style={{ color: "var(--ink)" }}>No subscription</b></p>
              </>
            ) : <p className="price-amount">$9.99 <span className="small muted">per month</span></p>}
            <ul className="price-list">
              <li>Your hosted MCP server checked <b>every 30 minutes</b></li>
              <li>Email <b>within the hour</b> when it stops answering, and when it is back</li>
              <li>Private 90-day report: answer rate, outages, every check</li>
              <li>Status badge for your README or website, with your answer rate</li>
            </ul>
            <Link href="/monitor" className="btn primary">Monitor my server</Link>
            <p className="small muted" style={{ marginBottom: 0 }}>For people who <b>publish</b> a hosted MCP server.{lifetimeOn ? null : " Cancel anytime."}</p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-body" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <span><b>Sponsors</b> · reach people choosing AI agents. Always labelled, never inside a ranking.</span>
          <Link href="/advertise" className="btn">Advertise</Link>
        </div>
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Questions</h2></div>
        <div className="card-body">
          <details><summary>Where do I find my developer key?</summary><p>In the email sent right after your purchase, from alerts@electraindex.com (check your spam folder). The key starts with <code>ei_</code> and is shown only once: keep it private, like a password.</p></details>
          <details><summary>Where do I enter the key?</summary><p>In your MCP client, as the header <code>Authorization: Bearer ei_…</code>. Step-by-step for Claude Code, Cursor, VS Code and others: <Link href="/mcp-server#setup">setup</Link>.</p></details>
          <details><summary>I lost my key or used all my calls.</summary><p>Write to contact@electraindex.com from the email you used to buy. We can send a new key for the calls you have left.</p></details>
          <details><summary>What is the difference between the developer pack and Monitoring Pro?</summary><p>The developer pack is for people who <b>choose</b> MCP servers: it lets your AI assistant read the availability history of any server. Monitoring Pro is for people who <b>publish</b> a server: we check yours every 30 minutes and email you when it stops answering. <Link href="/monitor">Monitoring Pro</Link></p></details>
          <details><summary>Can I pay to rank higher?</summary><p>No. We sell access to data, its history and its monitoring, and clearly labelled sponsored placements. We never sell a score, a rank or the removal of a fact. <Link href="/sources#what-we-sell">What we sell</Link></p></details>
        </div>
      </div>
    </>
  );
}
