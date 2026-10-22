import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { timeAgo, shortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Monitoring Pro report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Hist = {
  checks: number; answered: number; answer_rate: number | null; first_check: string | null; last_check: string | null; last_online: string | null;
  transitions: { at: string; from: string; to: string }[];
  timeline?: { at: string; status: string; http: number | null; tools: number | null; protocol: string | null }[];
  versions: { at: string; from: unknown; to: unknown }[];
};
type Report = {
  subscription: "active" | "pending" | "canceled"; since: string; canceled_at: string | null;
  name: string | null; slug: string | null; url: string | null; server_ref: string | null;
  live: { status: string; last_result: string; checked_at: string; last_online_at: string | null; tool_count: number | null; server_version: string | null; protocol_version: string | null } | null;
  d30: Hist | null; d90: Hist | null;
};

const UP = new Set(["online", "auth_required"]);
const LABEL: Record<string, string> = {
  online: "online", auth_required: "reachable (key required)", not_found: "nothing at the address", not_mcp: "not an MCP answer",
  error: "server error", timeout: "no answer in 15 s", unreachable: "unreachable", lost: "no result",
};
const plain = (v: unknown) => (v == null ? "" : typeof v === "string" ? v : JSON.stringify(v).replace(/^"|"$/g, ""));

/** Outages: from a failed check to the next answered one. */
function outages(tl: NonNullable<Hist["timeline"]>) {
  const asc = [...tl].reverse(); const out: { from: string; to: string | null; checks: number }[] = [];
  let cur: { from: string; to: string | null; checks: number } | null = null;
  for (const t of asc) {
    if (!UP.has(t.status)) { if (!cur) cur = { from: t.at, to: null, checks: 0 }; cur.checks++; }
    else if (cur) { cur.to = t.at; out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.filter((o) => o.checks >= 2).reverse();
}

export default async function MonitorReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const c = db();
  if (!c) notFound();
  const { data } = await c.rpc("monitor_report", { p_token: token });
  const r = data as Report | null;
  if (!r) notFound();

  if (r.subscription === "pending") {
    return (
      <div style={{ maxWidth: 760 }}>
        <div className="eyebrow">Monitoring Pro · private report</div>
        <h1>Almost ready</h1>
        <p className="lede">We still need the hosted endpoint of your server ({r.server_ref || "nothing given"}). Reply to the welcome email with its https address and we switch monitoring on within one business day.</p>
      </div>
    );
  }

  const tl = r.d90?.timeline ?? [];
  const bar = [...tl].slice(0, 96).reverse();   // last 96 checks, oldest first (about 2 days at 30 min)
  const outs = outages(tl);
  const now = r.live?.status;
  const badge = r.slug ? `[![Electra Index status](https://electraindex.com/api/badge/${r.slug})](https://electraindex.com/mcp/${r.slug})` : "";

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="eyebrow">Monitoring Pro · private report</div>
      <h1>{r.name}</h1>
      <p className="lede">
        {now === "online" ? <span className="badge live-ok"><span className="dot live" />ONLINE</span>
          : now === "auth_required" ? <span className="badge trust">REACHABLE · KEY REQUIRED</span>
          : now === "down" ? <span className="badge attn">NOT RESPONDING</span>
          : <span className="badge">CHECKING</span>}{" "}
        <code>{r.url}</code>{r.live ? <> · last check {timeAgo(r.live.checked_at)}</> : <> · first check within 30 minutes</>}
      </p>
      {r.subscription === "canceled" ? <p className="form-error">This subscription ended on {shortDate(r.canceled_at)}. The history below is kept for reference.</p> : null}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Answer rate</h2><span className="small muted">Checked every 30 minutes since {shortDate(r.since)}</span></div>
        <div className="card-body">
          <dl className="mon-stats">
            <div><dt>Last 30 days</dt><dd>{r.d30?.answer_rate != null ? `${r.d30.answer_rate}%` : "–"}</dd></div>
            <div><dt>Last 90 days</dt><dd>{r.d90?.answer_rate != null ? `${r.d90.answer_rate}%` : "–"}</dd></div>
            <div><dt>Checks (90 days)</dt><dd>{r.d90?.checks ?? 0}</dd></div>
            <div><dt>Outages (90 days)</dt><dd>{outs.length}</dd></div>
          </dl>
          {bar.length ? (
            <>
              <div className="mon-bar" aria-label="Last checks, oldest on the left">{bar.map((t) => <span key={t.at} className={UP.has(t.status) ? "up" : "down"} title={`${shortDate(t.at)} ${new Date(t.at).toISOString().slice(11, 16)} UTC · ${LABEL[t.status] ?? t.status}`} />)}</div>
              <p className="small muted" style={{ margin: 0 }}>Last {bar.length} checks, oldest on the left. Green: answered. Red: no answer.</p>
            </>
          ) : <p className="small muted" style={{ marginBottom: 0 }}>The first checks appear here within 30 minutes.</p>}
          {r.live?.server_version || r.live?.tool_count != null ? <p className="small" style={{ marginBottom: 0 }}>Last answer: {r.live?.server_version ? <>version <code>{r.live.server_version}</code></> : null}{r.live?.tool_count != null ? <> · {r.live.tool_count} tools listed</> : null}{r.live?.protocol_version ? <> · MCP {r.live.protocol_version}</> : null}</p> : null}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Outages</h2><span className="small muted">2 failed checks in a row or more · last 90 days</span></div>
        <div className="card-body">
          {outs.length ? (
            <table className="mon-table"><thead><tr><th>Started (UTC)</th><th>Ended (UTC)</th><th>Failed checks</th></tr></thead>
              <tbody>{outs.map((o) => <tr key={o.from}><td>{new Date(o.from).toISOString().slice(0, 16).replace("T", " ")}</td><td>{o.to ? new Date(o.to).toISOString().slice(0, 16).replace("T", " ") : "still ongoing"}</td><td>{o.checks}</td></tr>)}</tbody></table>
          ) : <p style={{ margin: 0 }}>No outage recorded.</p>}
        </div>
      </div>

      {r.d90?.versions?.length ? (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-head"><h2>Versions</h2></div>
          <div className="card-body"><ul className="plain">{r.d90.versions.map((v) => <li key={v.at}>{shortDate(v.at)}: {plain(v.from) || "?"} → <b>{plain(v.to)}</b></li>)}</ul></div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Your status badge</h2></div>
        <div className="card-body prose">
          {r.slug ? <p style={{ marginTop: 0 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/badge/${r.slug}`} alt="Electra Index status" height={20} /></p> : null}
          <p className="small strong">Markdown (README)</p>
          <pre className="code" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{badge}</pre>
          <p className="small strong">HTML</p>
          <pre className="code" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{`<a href="https://electraindex.com/mcp/${r.slug}"><img src="https://electraindex.com/api/badge/${r.slug}" alt="Electra Index status"></a>`}</pre>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-head"><h2>Every check</h2><span className="small muted">Last {Math.min(tl.length, 200)}</span></div>
        <div className="card-body" style={{ maxHeight: 420, overflow: "auto" }}>
          {tl.length ? (
            <table className="mon-table"><thead><tr><th>Time (UTC)</th><th>Result</th><th>HTTP</th><th>Tools</th></tr></thead>
              <tbody>{tl.map((t) => <tr key={t.at}><td>{new Date(t.at).toISOString().slice(0, 16).replace("T", " ")}</td><td>{LABEL[t.status] ?? t.status}</td><td>{t.http ?? "–"}</td><td>{t.tools ?? "–"}</td></tr>)}</tbody></table>
          ) : <p style={{ margin: 0 }} className="muted">No check yet.</p>}
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 24 }}>Keep this link private. How we check: we open an MCP session and list the tools, as an AI assistant would; we never run a tool and never send a key. Not a guarantee of security, quality or uptime. Cancel anytime: write to contact@electraindex.com. {r.slug ? <Link href={`/mcp/${r.slug}`}>Public page</Link> : null}</p>
    </div>
  );
}
