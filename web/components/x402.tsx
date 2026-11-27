import Link from "next/link";
import { getX402ForHosts, getX402Summary, networkName, priceText, VERDICT, type X402Service } from "@/lib/x402";
import { timeAgo } from "@/lib/format";

function Verdict({ v }: { v: string | null }) {
  const x = v ? VERDICT[v] : null;
  return <span className={`x4-v ${x?.tone ?? ""}`}>{x ? (x.tone === "pos" ? "✓ " : "") + x.label : "Not tested yet"}</span>;
}

/** "Agent payments" block on a product page: x402 endpoints found on the product's own domain, tested live. */
export async function X402Section({ urls, name }: { urls: (string | null | undefined)[]; name: string }) {
  const [rows, sum] = await Promise.all([getX402ForHosts(urls), getX402Summary()]);
  if (rows == null) return null; // data unavailable: say nothing rather than guess
  if (!rows.length) {
    // only claim "not found" once the catalogue has been read
    if (!sum || Number(sum.services) < 100) return null;
    return (
      <section className="x4-slim" aria-label="Agent payments">
        <span className="x4-tag">AGENT PAYMENTS · x402</span>
        <span className="muted">No x402 endpoint for {name} in the public x402 catalogue.</span>
        <Link href="/payments#get-tested">Accept agent payments? Get tested free →</Link>
      </section>
    );
  }
  const payable = rows.filter((r) => r.last_verdict === "pass");
  const best = payable[0] ?? rows[0];
  return (
    <section id="payments" className="x4-card" aria-label="Agent payments">
      <div className="x4-head">
        <div>
          <span className="x4-tag">AGENT PAYMENTS · x402 · TESTED LIVE</span>
          <h2 style={{ margin: "6px 0 0" }}>{payable.length ? `AI agents can pay ${name}` : `${name} publishes x402 endpoints`}</h2>
        </div>
        {payable.length ? <span className="x4-badge">✓ Payable by agents · Verified by Electra</span> : null}
      </div>
      <div className="x4-stats">
        <div><span>Price per call</span><b>{priceText(best.price_usd)}</b><em>{best.price_usd != null ? "USDC" : ""}</em></div>
        <div><span>Network</span><b>{networkName(best.network)}</b></div>
        <div><span>Success · 7 days</span><b>{best.success_7d_pct != null ? `${Number(best.success_7d_pct)}%` : "—"}</b><em>{best.checks_7d ? `${best.passed_7d}/${best.checks_7d} tests` : ""}</em></div>
        <div><span>Last test</span><b>{best.last_checked_at ? timeAgo(best.last_checked_at) : "—"}</b></div>
      </div>
      <ul className="x4-list">
        {rows.slice(0, 6).map((r: X402Service) => (
          <li key={r.id}>
            <span className="mono x4-m">{r.method}</span>
            <span className="x4-u mono">{r.url.replace(/^https?:\/\//, "").slice(0, 70)}</span>
            <span className="mono">{priceText(r.price_usd)}</span>
            <Verdict v={r.last_verdict} />
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: "10px 0 0" }}>
        Our robot calls each endpoint without paying and checks it answers <b>402 Payment Required</b> with a valid price, network, token and recipient. Listed in the public x402 catalogue.{" "}
        <Link href="/payments">All tested services →</Link> · Tests run by <a href="https://electra.finance" rel="noopener">Electra Finance</a>
      </p>
    </section>
  );
}
