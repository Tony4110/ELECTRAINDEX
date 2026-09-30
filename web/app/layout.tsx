import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL("https://electraindex.com"),
  title: { default: "Electra — The agent economy, made readable", template: "%s · Electra" },
  description: "Electra Index: discover, compare and track AI agents and MCP servers. Every fact sourced and dated.",
  openGraph: { siteName: "Electra Index", type: "website" },
};

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
        <header className="header">
          <div className="wrap">
            <Link href="/" className="logo" aria-label="Electra Index — home">
              ELECTRA<span className="sub">INDEX</span>
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/themes">Themes</Link>
              <Link href="/tasks">Tasks</Link>
              <Link href="/mcp">Agents &amp; tools</Link>
              <Link href="/signals">Signals</Link>
              <Link href="/sources">Methodology</Link>
            </nav>
            <span className="spacer" />
            <span className="mono small muted">API · soon</span>
            <Link href="/search" className="btn dark">Search</Link>
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
