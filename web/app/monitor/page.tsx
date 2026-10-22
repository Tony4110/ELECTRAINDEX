import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Monitoring Pro — know within the hour when your MCP server stops answering",
  description: "For publishers of hosted MCP servers: a check every 30 minutes, an email when it stops answering and when it is back, a private 90-day report and a status badge. USD 9.99/month, cancel anytime.",
  alternates: { canonical: "/monitor" },
};
export const dynamic = "force-dynamic";

const MONITOR_URL = process.env.NEXT_PUBLIC_STRIPE_MONITOR_URL ?? "";

type Check = { found: boolean; slug?: string; name?: string; url?: string | null; hosted?: boolean; active?: boolean };

function checkoutLink(slug: string) {
  const u = new URL(MONITOR_URL);
  u.searchParams.set("client_reference_id", slug);
  return u.toString();
}

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ server?: string }> }) {
  const q = ((await searchParams).server ?? "").trim().slice(0, 300);
  const on = !!MONITOR_URL && !!(process.env.MCP_API_SECRET ?? "");
  const c = db();
  let check: Check | null = null;
  let suggestions: { slug: string; name: string }[] = [];
  if (q && c) {
    const { data } = await c.rpc("monitor_check_server", { p_ref: q });
    check = (data as Check | null) ?? { found: false };
    if (!check.found && q.length >= 3 && !/^https?:\/\//i.test(q)) {
      const { data: s } = await c.from("v_mcp_servers").select("slug,name").ilike("name", `%${q.replace(/[%_,()]/g, " ")}%`).eq("remote", true).limit(6);
      suggestions = (s as { slug: string; name: string }[] | null) ?? [];
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">For MCP server publishers</div>
      <h1>Monitoring Pro</h1>
      <p className="lede">Know within the hour when your hosted MCP server stops answering, before your users tell you. <b>USD 9.99/month</b>, cancel anytime.</p>

      <div className="grid cols-2" style={{ marginTop: 24 }}>
        <div className="card"><div className="card-body">
          <p className="price-name">What you get</p>
          <ul className="price-list">
            <li>Your endpoint checked <b>every 30 minutes</b> (public pages: every few days)</li>
            <li>An <b>email when it stops answering</b> (2 failed checks in a row, so within about an hour) and when it is back</li>
            <li>A <b>private report</b>: answer rate over 30 and 90 days, every outage, every check</li>
            <li>A <b>status badge</b> for your README or website, with your 30-day answer rate</li>
          </ul>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="price-name">How we check</p>
          <ul className="price-list">
            <li>We connect like an AI assistant: open an MCP session and list the tools</li>
            <li>We never run a tool and never send a key (a server that asks for a key counts as answering)</li>
            <li>Monitoring never changes your score or rank on Electra Index</li>
            <li>For hosted servers (an https endpoint). A server that runs only on the user&apos;s computer cannot be checked from outside</li>
          </ul>
        </div></div>
      </div>

      <div className="card follow-box" style={{ marginTop: 24 }} id="start">
        <div className="card-head"><h2>Start with your server</h2><span className="small muted">Step 1 of 2 · then pay by card with Stripe</span></div>
        <div className="card-body">
          <form method="get" action="/monitor#start" className="follow-form">
            <label className="small" htmlFor="server">Your server&apos;s name, its Electra Index page, or its endpoint URL</label>
            <div className="follow-row">
              <input id="server" name="server" defaultValue={q} required maxLength={300} placeholder="e.g. https://mcp.example.com/mcp" />
              <button type="submit" className="btn dark">Find my server</button>
            </div>
          </form>

          {check ? (
            check.found && check.hosted ? (
              check.active ? (
                <p className="ok-box">{check.name} is already monitored. Look for the report link in the welcome email, or write to contact@electraindex.com.</p>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <p style={{ marginTop: 0 }}><span className="badge live-ok">FOUND</span> <b>{check.name}</b> · we will check <code>{check.url}</code></p>
                  {on ? <a className="btn primary" href={checkoutLink(check.slug!)} rel="noopener">Subscribe for {check.name} · $9.99/month</a>
                      : <p className="small muted">Subscriptions open very soon.</p>}
                  <p className="small muted" style={{ marginBottom: 0 }}>Your welcome email arrives within a minute, with your private report link and your badge. Not your endpoint? <Link href={`/mcp/${check.slug}`}>See its page</Link>.</p>
                </div>
              )
            ) : check.found ? (
              <p className="form-error" style={{ marginTop: 16 }}><b>{check.name}</b> has no hosted endpoint in the Official MCP Registry: it seems to run only on the user&apos;s computer, so it cannot be checked from outside. If you host it, publish its URL in the registry, or write to contact@electraindex.com.</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                <p className="form-error" style={{ marginTop: 0 }}>We did not find &quot;{q}&quot; among the hosted servers we index. Try its exact endpoint URL (https://…).</p>
                {suggestions.length ? <p className="small">Did you mean: {suggestions.map((s, i) => <span key={s.slug}>{i ? ", " : ""}<Link href={`/monitor?server=${s.slug}#start`}>{s.name}</Link></span>)}?</p> : null}
                <p className="small muted" style={{ marginBottom: 0 }}>We index every server of the Official MCP Registry. Not there yet? Write to contact@electraindex.com and we add it by hand.</p>
              </div>
            )
          ) : null}
        </div>
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Questions</h2></div>
        <div className="card-body">
          <details><summary>How do I cancel?</summary><p>Reply to any Monitoring Pro email or write to contact@electraindex.com. No further payment is taken after cancellation.</p></details>
          <details><summary>Does it make my server rank higher?</summary><p>No. We sell monitoring and data, never a score, a rank or the removal of a fact. <Link href="/sources#what-we-sell">What we sell</Link></p></details>
          <details><summary>What if my server asks for a key or a sign-in?</summary><p>It counts as answering: we check that the endpoint is up and speaks MCP. We never send credentials.</p></details>
          <details><summary>Is the badge free?</summary><p>Every listed server can show its live status with the badge <code>https://electraindex.com/api/badge/your-slug</code>. With Monitoring Pro the badge also shows your 30-day answer rate.</p></details>
        </div>
      </div>
    </div>
  );
}
