import { timeAgo } from "@/lib/format";
import { hostOf, networkName, priceText } from "@/lib/x402";

export type FeedItem = { key: string; ok: boolean; name: string; tag: "MCP" | "x402"; detail: string; at: string | null; href: string };

/** Home hero: big title, search, animated background and a scrolling feed of the latest real tests. */
export function HeroLive({ feed }: { feed: FeedItem[] }) {
  const rows = feed.length >= 4 ? [...feed, ...feed] : feed; // doubled for a seamless loop
  return (
    <section className={`hx ${feed.length ? "" : "hx-solo"}`}>
      <div className="hx-bg" aria-hidden="true">
        <span className="hx-grid" />
        <span className="hx-scan" />
        <i style={{ left: "3%", top: "88%" }} /><i style={{ left: "52%", top: "6%", animationDelay: "1.2s" }} />
        <i style={{ left: "56%", top: "92%", animationDelay: ".6s" }} /><i style={{ left: "97%", top: "14%", animationDelay: "2s" }} />
        <i style={{ left: "96%", top: "90%", animationDelay: "1.6s" }} />
      </div>
      <div className="hx-in">
        <div className="hx-copy">
          <span className="hx-pill"><span className="hx-ping" />Live · testing now</span>
          <h1>The trust layer for the <span className="hx-grad">agent economy</span></h1>
          <p className="hx-sub">Compare, test and verify the tools, payments and agents that power AI.</p>
          <form className="ft-search hx-search" action="/search" method="get" role="search">
            <label htmlFor="hq" className="sr-only">Search the index</label>
            <input id="hq" name="q" type="search" placeholder="e.g. send an invoice, scrape a website, pay per API call" autoComplete="off" />
            <button className="btn primary" type="submit">Search</button>
          </form>
          <div className="hx-trust"><span>Independent</span><span>No paid ranking</span><span>Every fact sourced &amp; dated</span></div>
        </div>
        {feed.length ? (
          <div className="hx-feed" aria-label="Latest live tests">
            <div className="hx-feed-h"><span><span className="hx-ping" />LIVE TEST FEED</span><span className="mono">MCP · x402</span></div>
            <div className="hx-win">
              <ul className={rows.length > feed.length ? "hx-roll" : ""}>
                {rows.map((f, i) => (
                  <li key={f.key + i} aria-hidden={i >= feed.length ? true : undefined}>
                    <span className={`hx-st ${f.ok ? "ok" : "ko"}`}>{f.ok ? "✓" : "✕"}</span>
                    <a href={f.href} tabIndex={i >= feed.length ? -1 : undefined}>
                      <b>{f.name}</b>
                      <span className="hx-d">{f.detail}</span>
                    </a>
                    <span className={`hx-tag t-${f.tag === "MCP" ? "mcp" : "pay"}`}>{f.tag}</span>
                    <span className="hx-t">{f.at ? timeAgo(f.at) : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function x402Feed(rows: { id: string; url: string; service_name: string | null; network: string | null; price_usd: number | null; last_verdict: string | null; last_checked_at: string | null }[]): FeedItem[] {
  return rows.map((r) => ({
    key: "x" + r.id,
    ok: r.last_verdict === "pass",
    name: r.service_name ?? hostOf(r.url) ?? "x402 service",
    tag: "x402" as const,
    detail: r.last_verdict === "pass" ? `402 valid · ${priceText(r.price_usd)} · ${networkName(r.network)}` : "no valid payment terms",
    at: r.last_checked_at,
    href: "/payments",
  }));
}
