import type { Metadata } from "next";
import Link from "next/link";
import { Analytics } from "@/components/analytics";
import { SITE } from "@/lib/site";
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-500.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-700.css";
import "@fontsource/archivo/latin-800.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";

// pages are cached and refreshed at most once an hour (fast for visitors and for Google)
export const revalidate = 3600;

export const metadata: Metadata = {
  metadataBase: new URL("https://electraindex.com"),
  title: { default: "Electra Index — The trust layer for the agent economy", template: "%s · Electra Index" },
  description: "Know your agent. Trust your transaction. Electra Index ranks AI agents and the tools they use on quality, price and trust. Every fact sourced and dated.",
  openGraph: { siteName: "Electra Index", type: "website", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  // Google Search Console: paste the verification code into the Netlify env var
  // NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION (or verify by DNS TXT at OVH — recommended).
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

// Site-wide structured data: lets Google show the brand as an entity and, over time,
// a search box for the site in results (sitelinks searchbox).
const LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "Electra Index",
      url: SITE,
      description: "The trust layer for the agent economy — ranking AI agents and the tools they use on quality, price and trust.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE}/#site`,
      url: SITE,
      name: "Electra Index",
      publisher: { "@id": `${SITE}/#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE}/search?q={query}` },
        "query-input": "required name=query",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD) }} />
        <Analytics />
        <header className="header">
          <div className="wrap">
            <Link href="/" className="logo" aria-label="Electra Index — home">
              ELECTRA<span className="sub">INDEX</span>
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Agents</Link>
              <Link href="/tasks">Tasks</Link>
              <Link href="/mcp">Tools</Link>
              <Link href="/compare">Compare</Link>
              <Link href="/payments">Payments</Link>
              <Link href="/new">New</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/sources">Methodology</Link>
            </nav>
            <span className="spacer" />
            <Link href="/submit" className="btn dark">List your agent</Link>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site">
          <div className="wrap">
            <span><b style={{ color: "var(--ink)" }}>Electra Index</b> · the trust layer for the agent economy</span>
            <span>Every fact has a source and a date · no source → no claim</span>
            <span className="spacer" />
            <span>Scores measure observable public data, not performance</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
