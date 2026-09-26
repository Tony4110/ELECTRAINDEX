import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getStats } from "@/lib/db";
import { num, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Intendex — The Agent Economy Index", template: "%s · Intendex" },
  description: "Discover, compare and track AI agents and MCP servers. Every fact sourced and dated.",
};

async function Ticker() {
  const s = await getStats();
  return (
    <div className="ticker" aria-label="Index counters">
      <div className="wrap">
        <span className="live">● LIVE</span>
        <span>MCP SERVERS <b>{num(s?.mcp_servers)}</b></span>
        <span>A2A AGENTS <b style={{ color: "#F2B35B" }}>PROBE PENDING</b></span>
        <span>TASKS <b>{num(s?.tasks)}</b></span>
        <span>CAPABILITIES <b>{num(s?.capabilities)}</b></span>
        <span>SOURCES <b>{num(s?.active_sources)}</b> ACTIVE / {num(s?.mapped_sources)} MAPPED</span>
        <span>SIGNALS 24H <b>{num(s?.signals_24h)}</b></span>
        <span className="spacer" />
        <span>LAST UPDATE <b>{timeAgo(s?.last_update)}</b></span>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <Ticker />
        <header className="header">
          <div className="wrap">
            <Link href="/" className="logo"><span className="mark">IX</span>INTENDEX</Link>
            <nav className="nav" aria-label="Main">
              <Link href="/mcp">MCP servers</Link>
              <Link href="/tasks">Tasks</Link>
              <Link href="/capabilities">Capabilities</Link>
              <Link href="/signals">Signals</Link>
              <Link href="/sources">Sources</Link>
            </nav>
            <span className="spacer" />
            <span className="mono small muted">API · soon</span>
            <Link href="/sources" className="btn dark">Methodology</Link>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site">
          <div className="wrap">
            <span>Every fact has a source and a date · no source → no claim</span>
            <span className="spacer" />
            <span>Scores measure observable public data, not performance</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
