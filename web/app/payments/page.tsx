import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { SetupNotice, Empty } from "@/components/ui";
import { Logo } from "@/components/rank";

export const metadata: Metadata = {
  title: "Payment Index — how AI agents pay, compared",
  description: "x402, MPP, AP2, ACP, UCP and the providers behind them: what each protocol does, who supports it and what it costs. Sourced and dated.",
  alternates: { canonical: "/payments" },
};
type SP = Promise<{ tab?: string; protocol?: string }>;

type Protocol = {
  slug: string; name: string; full_name: string | null; one_liner: string | null; website: string | null; role: string | null; best_for: string | null;
  money: string[] | null; stewards: string[] | null; governance: string | null; status: string | null; launched: string | null;
  spec_url: string | null; repository_url: string | null; networks: string[] | null; last_verified_at: string | null;
  providers: number; tools_mentioning: number; agents_mentioning: number;
};
type Fee = { label: string; percent: number | null; fixed: number | null; currency: string | null; region: string | null; description: string | null; evidence: string; checked: string };
type Provider = {
  slug: string; name: string; one_liner: string | null; website: string | null; kind: string | null; agentic_product: string | null;
  rails: string[] | null; pricing_url: string | null; pricing_public: boolean | null; last_verified_at: string | null;
  protocols: { slug: string; name: string; url: string | null }[]; fees: Fee[];
};

const ROLE: Record<string, { label: string; order: number; explain: string }> = {
  pay_per_request: { label: "PAY PER REQUEST", order: 1, explain: "The agent pays a small amount inside the web request and gets the answer." },
  checkout: { label: "CHECKOUT", order: 2, explain: "The agent buys a product or books a service for a person." },
  authorization: { label: "AUTHORISATION", order: 3, explain: "Proof that a person allowed the agent to spend, and within which limits." },
  identity: { label: "AGENT IDENTITY", order: 4, explain: "Proves who the agent is and who it acts for." },
  card_network_framework: { label: "CARD NETWORK", order: 5, explain: "How Visa and Mastercard let agents use cards safely." },
  tool_access: { label: "TOOLS", order: 6, explain: "How agents connect to tools; payments often travel through it." },
  agent_communication: { label: "AGENT TO AGENT", order: 7, explain: "How agents talk to each other and hand over tasks." },
};
const STATUS: Record<string, { label: string; tone: string }> = {
  production: { label: "LIVE", tone: "pos" }, spec_published: { label: "SPEC PUBLISHED", tone: "accent" }, draft: { label: "DRAFT", tone: "" }, announced: { label: "ANNOUNCED", tone: "" },
};
const MONEY: Record<string, string> = { card: "Card", stablecoin: "Stablecoins", bank_transfer: "Bank transfer", lightning: "Lightning", any: "Any", none: "—" };
const KIND: Record<string, string> = {
  payment_processor: "Payment processor", card_network: "Card network", stablecoin_issuer: "Stablecoin issuer", wallet_infrastructure: "Wallets",
  x402_facilitator: "x402 facilitator", agent_payment_platform: "Agent payments", commerce_platform: "Commerce platform", blockchain: "Blockchain",
};

function feeText(f: Fee) {
  const sym = f.currency === "EUR" ? "€" : f.currency === "GBP" ? "£" : "$";
  const pct = f.percent != null ? `${Number(f.percent)}%` : "";
  const fix = f.fixed != null ? (Number(f.fixed) === 0 ? (pct ? "" : "Free") : `${sym}${Number(f.fixed) < 0.01 ? Number(f.fixed) : Number(f.fixed) < 1 ? Number(f.fixed).toFixed(2) : Number(f.fixed)}`) : "";
  return [pct, fix].filter(Boolean).join(" + ") || "—";
}

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const sp = await searchParams;
  const tab = sp.tab === "providers" ? "providers" : "protocols";
  const [{ data: pd }, { data: vd }] = await Promise.all([c.from("v_protocols").select("*"), c.from("v_payment_providers").select("*")]);
  const protocols = ((pd as Protocol[] | null) ?? []).sort((a, b) => (ROLE[a.role ?? ""]?.order ?? 9) - (ROLE[b.role ?? ""]?.order ?? 9) || b.providers - a.providers || a.name.localeCompare(b.name));
  let providers = ((vd as Provider[] | null) ?? []).sort((a, b) => b.protocols.length - a.protocols.length || b.fees.length - a.fees.length || a.name.localeCompare(b.name));
  const filter = sp.protocol ? protocols.find((p) => p.slug === sp.protocol) : null;
  if (filter) providers = providers.filter((p) => p.protocols.some((x) => x.slug === filter.slug));
  const nProviders = (vd as Provider[] | null)?.length ?? 0;

  return (
    <>
      <div className="eyebrow">Electra Payment Index</div>
      <h1 className="h1-md">How AI agents pay, compared</h1>
      <p className="lede">The protocols and providers that let an agent pay or get paid: what each one does, who supports it, and what it costs. Read on official pages and dated. Electra Index does not process payments.</p>

      <div className="tabs" role="tablist">
        <Link role="tab" aria-selected={tab === "protocols"} href="/payments" className={tab === "protocols" ? "on" : ""}>Protocols <span className="mono faint">{protocols.length}</span></Link>
        <Link role="tab" aria-selected={tab === "providers"} href="/payments?tab=providers" className={tab === "providers" ? "on" : ""}>Providers &amp; fees <span className="mono faint">{nProviders}</span></Link>
        <span className="soon">Compare routes · soon</span>
        <span className="soon">Service prices (x402) · soon</span>
      </div>

      {tab === "protocols" ? (
        protocols.length === 0 ? <div style={{ marginTop: 16 }}><Empty title="No protocol yet">Protocols appear once their official documentation has been read.</Empty></div> : (
          <>
            <div className="card table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead><tr><th>Protocol</th><th>Role</th><th>What it does</th><th>Pays with</th><th>Status</th><th>Providers</th><th>Tools</th></tr></thead>
                <tbody>
                  {protocols.map((p) => (
                    <tr key={p.slug} id={p.slug}>
                      <td>
                        <span className="strong ink">{p.name}</span>
                        <div className="small muted">{(p.stewards ?? []).slice(0, 2).map((s) => s.replace(/\s*\(.*\)$/, "")).join(" · ")}</div>
                      </td>
                      <td><span className="badge accent" title={ROLE[p.role ?? ""]?.explain}>{ROLE[p.role ?? ""]?.label ?? "—"}</span></td>
                      <td className="small" style={{ maxWidth: 420 }}>{p.one_liner}{p.best_for ? <div className="faint">Best for: {p.best_for}</div> : null}
                        <div className="links">{p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer">Official site ↗</a> : null}{p.spec_url && p.spec_url !== p.website ? <a href={p.spec_url} target="_blank" rel="noopener noreferrer">Spec ↗</a> : null}</div>
                      </td>
                      <td className="small">{(p.money ?? []).length ? (p.money ?? []).map((m) => MONEY[m] ?? m).join(" · ") : <span className="faint" title="Not documented">—</span>}</td>
                      <td>{p.status ? <span className={`badge ${STATUS[p.status]?.tone ?? ""}`}>{STATUS[p.status]?.label ?? p.status.toUpperCase()}</span> : "—"}<div className="mono small faint">{p.launched ? `since ${p.launched}` : ""}</div></td>
                      <td className="mono">{p.providers > 0 ? <Link href={`/payments?tab=providers&protocol=${p.slug}`}>{p.providers}</Link> : <span className="faint">0</span>}</td>
                      <td className="mono" title="Indexed tools and agents that mention this protocol in their own description">{p.role === "tool_access" ? <span className="faint">—</span> : p.tools_mentioning + p.agents_mentioning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note"><b>Providers</b> = payment companies that state support on their own pages. <b>Tools</b> = indexed tools and agents that mention the protocol in their own description (automatic count). Status and dates come from each protocol&apos;s official documentation, checked {shortDate(protocols[0]?.last_verified_at)}.</p>
          </>
        )
      ) : (
        <>
          {filter ? <div className="filters"><span className="small muted">Showing providers that support</span><span className="chip on">{filter.name}</span><Link href="/payments?tab=providers" className="chip">Show all</Link></div> : <div style={{ height: 16 }} />}
          <div className="card table-wrap">
            <table>
              <thead><tr><th>Provider</th><th>Type</th><th>Agent protocols supported</th><th>Public fees</th></tr></thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.slug} id={p.slug} style={{ verticalAlign: "top" }}>
                    <td style={{ minWidth: 220 }}>
                      <span className="agent-cell"><Logo name={p.name} website={p.website} />
                        <span><span className="strong ink">{p.name}</span>{p.agentic_product ? <span className="small muted block">{p.agentic_product}</span> : null}</span></span>
                    </td>
                    <td className="small">{KIND[p.kind ?? ""] ?? "—"}</td>
                    <td><span className="pills wrap">{p.protocols.length === 0 ? <span className="small faint" title="No protocol stated on the provider's own pages">Not documented</span>
                      : p.protocols.map((x) => x.url ? <a key={x.slug} className="pill on" href={x.url} target="_blank" rel="noopener noreferrer" title="Open the provider page that states this">{x.name}</a> : <span key={x.slug} className="pill on">{x.name}</span>)}</span></td>
                    <td className="small" style={{ minWidth: 320 }}>
                      {p.fees.length === 0 ? <span className="muted">No public fees found</span> : (
                        <ul className="fees">
                          {p.fees.slice(0, 4).map((f) => <li key={f.label} title={f.description ?? ""}><span className="mono strong">{feeText(f)}</span> <span className="muted">{f.label}</span></li>)}
                          {p.fees.length > 4 ? <li className="faint">+ {p.fees.length - 4} more on the pricing page</li> : null}
                        </ul>
                      )}
                      {p.pricing_url ? <div className="links"><a href={p.pricing_url} target="_blank" rel="noopener noreferrer">Pricing page ↗</a>{p.fees[0] ? <span className="faint"> · read {shortDate(p.fees[0].checked)}</span> : null}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">Fees are the public list prices on each provider&apos;s own pricing page (mostly US rates); negotiated and regional rates differ. A protocol is listed only when the provider states support on its own page: click a protocol to open that page. No ranking, no &quot;winner&quot;: partnerships never change what is shown.</p>
        </>
      )}
    </>
  );
}
