import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Launch Spotlight report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Report = {
  status: "active" | "pending" | "ended"; name: string | null; slug: string | null; type: "agent" | "mcp" | null; server_ref: string | null;
  starts_at: string | null; ends_at: string | null; pages: string[]; purchases: number; free_extension_used: boolean;
  clicks: { sponsored: number; total: number; by_page: { page: string; clicks: number }[] } | null;
};

export default async function SpotlightReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const c = db();
  if (!c) notFound();
  const { data } = await c.rpc("spotlight_report", { p_token: token });
  const r = data as Report | null;
  if (!r) notFound();

  if (r.status === "pending") {
    return (
      <div style={{ maxWidth: 760 }}>
        <div className="eyebrow">Launch Spotlight · private report</div>
        <h1>Almost ready</h1>
        <p className="lede">We still need to know which product to feature ({r.server_ref || "nothing given"}). Reply to our email with its Electra Index page or its website, and your 60 days start within one business day.</p>
      </div>
    );
  }
  const page = r.type === "agent" ? `/agents/${r.slug}` : `/mcp/${r.slug}`;
  return (
    <div style={{ maxWidth: 860 }}>
      <div className="eyebrow">Launch Spotlight · private report</div>
      <h1>{r.name}</h1>
      <p className="lede">
        {r.status === "active" ? <span className="badge live-ok">RUNNING</span> : <span className="badge">ENDED</span>}{" "}
        {shortDate(r.starts_at)} → {shortDate(r.ends_at)}{r.purchases > 1 ? ` · ${r.purchases} purchases` : ""}{r.free_extension_used ? " · includes 60 free days" : ""}
      </p>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Real visitor clicks to your site</h2><span className="small muted">Robots excluded · one per visitor per day</span></div>
        <div className="card-body">
          <dl className="mon-stats">
            <div><dt>On your Sponsored card</dt><dd>{r.clicks?.sponsored ?? 0}</dd></div>
            <div><dt>From all Electra Index pages</dt><dd>{r.clicks?.total ?? 0}</dd></div>
            <div><dt>Pages with your card</dt><dd>{r.pages.length}</dd></div>
            <div><dt>Status</dt><dd style={{ fontSize: 18 }}>{r.status === "active" ? "Running" : "Ended"}</dd></div>
          </dl>
          {r.clicks?.by_page?.length ? (
            <table className="mon-table" style={{ marginTop: 16 }}><thead><tr><th>Page</th><th>Clicks</th></tr></thead>
              <tbody>{r.clicks.by_page.map((p) => <tr key={p.page}><td><Link href={p.page}>{p.page}</Link></td><td>{p.clicks}</td></tr>)}</tbody></table>
          ) : <p className="small muted" style={{ marginBottom: 0 }}>No click yet. If your Sponsored card gets no click in 60 days, the next 60 days are free.</p>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Where your Sponsored card appears</h2></div>
        <div className="card-body"><ul className="plain">{r.pages.map((p) => <li key={p}><Link href={p}>electraindex.com{p}</Link></li>)}</ul>
          <p className="small muted" style={{ marginBottom: 0 }}>Also in the weekly <Link href="/pulse">MCP &amp; Agent Pulse</Link> while it runs.</p></div>
      </div>

      <p className="small muted" style={{ marginTop: 24 }}>Keep this link private. Want 60 more days at the same launch price? <Link href="/spotlight">Buy again</Link>. Your public page: <Link href={page}>{r.name}</Link>. Questions: contact@electraindex.com</p>
    </div>
  );
}
