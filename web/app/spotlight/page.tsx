import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Launch Spotlight — put your AI agent or MCP server in front of people choosing one",
  description: "60 days of sponsored visibility on the Electra Index pages where your agent or MCP server already appears, plus the weekly Pulse. Launch offer: USD 14.99 once, no subscription. No click in 60 days? The next 60 days are free.",
  alternates: { canonical: "/spotlight" },
};
export const dynamic = "force-dynamic";

const BUY_URL = process.env.NEXT_PUBLIC_STRIPE_SPOTLIGHT_URL ?? "";

type Preview = { found: boolean; type?: "agent" | "mcp"; slug?: string; name?: string; pages?: string[]; running?: boolean };

function label(p: string) {
  if (p === "/new") return "New listings";
  const [, kind, a, b] = p.split("/");
  const words = (x: string) => x.replace(/-/g, " ");
  if (kind === "tasks") return `Task: ${words(a)}`;
  if (kind === "themes") return `Theme: ${words(a)}`;
  if (kind === "mcp" && a === "best") return `Best MCP servers for ${words(b)}`;
  return p;
}

export default async function SpotlightPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const q = ((await searchParams).product ?? "").trim().slice(0, 300);
  const on = !!BUY_URL && !!(process.env.MCP_API_SECRET ?? "");
  let preview: Preview | null = null;
  const c = db();
  if (q && c) {
    const { data } = await c.rpc("spotlight_preview", { p_ref: q });
    preview = (data as Preview | null) ?? { found: false };
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">For agent and MCP server publishers</div>
      <h1>Launch Spotlight</h1>
      <p className="lede">Put your AI agent or MCP server in front of the people who are choosing one, on the pages where they compare.</p>

      <div className="offer-box" style={{ marginTop: 20 }}>
        <span className="offer-tag">Exclusive launch offer</span>
        <p className="offer-price"><b>$14.99 once</b>, 60 days of visibility</p>
        <p className="offer-was" style={{ margin: "4px 0 0" }}>Instead of <span className="offer-strike">$79</span> <span className="offer-save">No subscription</span></p>
        <p className="small" style={{ margin: "6px 0 12px" }}>Want more time? Buy another 60 days anytime, at the same launch price.</p>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {on ? <a className="btn primary" href={BUY_URL} rel="noopener">Get it for $14.99 →</a> : <span className="small muted">Opening very soon.</span>}
          <span className="small">You enter your product page or website at checkout. <a href="#preview">See where it would appear ↓</a></span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-body">
          <div className="story story-good">
            <p className="price-name">Our promise</p>
            <p style={{ margin: 0 }}><b>No click in 60 days? The next 60 days are free.</b> We count real visitors only: robots and link previews are excluded, and each visitor counts once a day. You get the numbers after 30 days and at the end.</p>
          </div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 24 }}>
        <div className="card"><div className="card-body">
          <p className="price-name">Where your product appears</p>
          <ul className="price-list">
            <li>A <b>Sponsored card</b> on the use-case pages where it already ranks: agent tasks, themes, &quot;Best MCP servers for…&quot; (up to 8 pages)</li>
            <li>The <b>New listings</b> page</li>
            <li>The <b>weekly MCP &amp; Agent Pulse</b>, in a separate Sponsored section</li>
          </ul>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="price-name">The rules</p>
          <ul className="price-list">
            <li>Always labelled <b>Sponsored</b>, never inside a ranking, never changes a score</li>
            <li>At most <b>3 sponsors per page</b>, shown side by side</li>
            <li>Your product must be listed on Electra Index (free: <Link href="/submit">list it</Link>)</li>
            <li>Paid once by card with Stripe: <b>nothing is charged again</b></li>
          </ul>
        </div></div>
      </div>

      <div className="card follow-box" style={{ marginTop: 24 }} id="preview">
        <div className="card-head"><h2>Where would my product appear?</h2><span className="small muted">Optional · free check</span></div>
        <div className="card-body">
          <form method="get" action="/spotlight#preview" className="follow-form">
            <label className="small" htmlFor="product">Your agent or MCP server: its Electra Index page, its website or its name</label>
            <div className="follow-row">
              <input id="product" name="product" defaultValue={q} required maxLength={300} placeholder="e.g. https://electraindex.com/agents/your-agent" />
              <button type="submit" className="btn dark">Check →</button>
            </div>
          </form>
          {preview ? (
            preview.found ? (
              <div style={{ marginTop: 16 }}>
                <p style={{ marginTop: 0 }}><span className="badge live-ok">FOUND</span> <b>{preview.name}</b>{preview.running ? " · already in the Spotlight (buying again adds 60 days)" : ""}</p>
                <p className="small" style={{ marginBottom: 6 }}>Your Sponsored card would appear on:</p>
                <ul className="plain small">{(preview.pages ?? []).map((p) => <li key={p}><Link href={p}>{label(p)}</Link></li>)}</ul>
                {(preview.pages ?? []).length <= 1 ? <p className="small muted">Your product does not rank on a use-case page yet, so it would appear on New listings and in the Pulse.</p> : null}
                {on ? <a className="btn primary" href={BUY_URL} rel="noopener" style={{ marginTop: 10 }}>Get it for $14.99 →</a> : null}
              </div>
            ) : (
              <p className="form-error" style={{ marginTop: 16 }}>We did not find &quot;{q}&quot; on Electra Index. Try its page link (electraindex.com/agents/… or /mcp/…), or <Link href="/submit">list it for free</Link> first.</p>
            )
          ) : null}
        </div>
      </div>

      <div className="card faq" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Questions</h2></div>
        <div className="card-body">
          <details open><summary>Is it a subscription?</summary><p>No. You pay $14.99 once for 60 days. Nothing is charged again. If you want more time, you buy another 60 days yourself, at the same launch price.</p></details>
          <details><summary>How do you count clicks?</summary><p>A click counts when a real visitor on an Electra Index page clicks through to your site. Robots, link previews and repeated clicks from the same visitor on the same day are not counted.</p></details>
          <details><summary>What if nobody clicks?</summary><p>If your Sponsored card gets no click in 60 days, we run it for another 60 days, free. Once per sponsor.</p></details>
          <details><summary>Does it improve my rank?</summary><p>No. Scores and rankings only use public, verifiable data. Sponsored cards are shown apart from rankings. <Link href="/sources#what-we-sell">What we sell</Link></p></details>
          <details><summary>When does it start?</summary><p>Within a minute of payment. You receive an email with the pages where your product appears and a link to your private report.</p></details>
        </div>
      </div>
    </div>
  );
}
