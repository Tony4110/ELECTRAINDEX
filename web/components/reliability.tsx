/**
 * Reliability Intelligence (livraison 1): observed availability over 30 days, one mark per check,
 * and confirmed tool changes. Everything comes from mcp_public_reliability(), which uses the same
 * calculation as get_mcp_server_history (paid), the tool search and Monitoring Pro.
 * If the database function is missing or fails, nothing is shown (the page stays as before).
 */
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shortDate, timeAgo } from "@/lib/format";

type Cls = "open" | "protected" | "failure" | "excluded";
type Obs = {
  days: number; checks: number; conclusive: number; answers: number; open: number; protected: number;
  failures: number; excluded: number; rate: number | null; availability: number | null; min_checks: number;
  access: "open" | "protected" | null; first_check: string | null; last_check: string | null;
};
type ToolChanges =
  | { tracked: false }
  | { tracked: true; since: string; partial: true; tools: number }
  | { tracked: true; since: string; partial: false; last_list: string; tools: number; added_count: number; removed_count: number;
      added: { name: string; at: string }[]; removed: { name: string; last_seen: string }[] };
export type Reliability = {
  d30: Obs; history_since: string | null; frequency: "standard" | "30min";
  checks: { at: string; c: Cls }[]; tool_changes: ToolChanges;
};

export async function loadReliability(c: SupabaseClient, slug: string): Promise<Reliability | null> {
  try {
    const { data, error } = await c.rpc("mcp_public_reliability", { p_slug: slug });
    if (error || !data) return null;
    const r = data as Reliability;
    return r.d30 && Array.isArray(r.checks) ? r : null;
  } catch { return null; }
}

const LABEL: Record<Cls, string> = { open: "Answered", protected: "Answered, key or sign-in required", failure: "No valid answer", excluded: "Inconclusive, not counted" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

export function ReliabilityCard({ r, name }: { r: Reliability; name: string }) {
  const o = r.d30;
  if (!o.checks) return null;
  const freq = r.frequency === "30min" ? "Checked every 30 minutes (Monitoring Pro)" : "Re-tested about every 3 days";
  const marks = r.checks;
  return (
    <div className="card rel-card" style={{ marginTop: 24 }} id="reliability">
      <div className="card-head"><h2>Reliability</h2><span className="small muted">{freq} · last check {timeAgo(o.last_check)}</span></div>
      <div className="card-body">
        <div className="rel-kpis">
          <div className="rel-kpi">
            {o.availability != null
              ? <><b>{o.availability}%</b><span>Observed availability, 30 days · {o.conclusive} checks</span></>
              : <><b className="rel-insuff">Insufficient observations</b><span>{o.conclusive} conclusive check{o.conclusive === 1 ? "" : "s"} in 30 days; a figure is shown from {o.min_checks}</span></>}
          </div>
          <div className="rel-kpi"><b>{o.answers} / {o.failures}</b><span>Answers / failures, 30 days{o.excluded ? ` · ${o.excluded} not counted` : ""}</span></div>
          <div className="rel-kpi"><b className="rel-access">{o.access === "open" ? "No key needed" : o.access === "protected" ? "Key or sign-in required" : "No answer in 30 days"}</b><span>Access status (latest answer)</span></div>
        </div>
        <div className="rel-hist">
          <span className="small muted">Observed test history · one mark = one check{marks.length >= 60 ? " (latest 60)" : ""}</span>
          <div className="rel-bars" role="img" aria-label={`${name}: ${o.answers} answers and ${o.failures} failures in ${o.conclusive} conclusive checks over 30 days`}>
            {marks.map((k) => <i key={k.at} className={`rel-${k.c}`} title={`${shortDate(k.at)} · ${LABEL[k.c]}`} />)}
          </div>
          {marks.length ? <div className="rel-axis mono"><span>{day(marks[0].at)}</span><span>{day(marks[marks.length - 1].at)}</span></div> : null}
          <div className="rel-legend small">
            <span><i className="rel-open" />Answered</span><span><i className="rel-protected" />Answered, key required</span>
            <span><i className="rel-failure" />No valid answer</span>{o.excluded ? <span><i className="rel-excluded" />Not counted</span> : null}
          </div>
        </div>
        <p className="small muted rel-method">
          Observed endpoint availability: the share of our conclusive checks that got an answer. A request for a key or sign-in counts as an answer (the server is up, its access is protected). Timeouts, unreachable endpoints, server errors and invalid MCP replies count as failures; rate-limited checks and checks during our own incidents are not counted. This is what we observed at each check, not continuous uptime: an outage between two checks may go unseen. The 90-day figure will appear once 90 days of checks exist{r.history_since ? ` (checks since ${shortDate(r.history_since)})` : ""}. <Link href="/sources#reliability">How we measure</Link>
        </p>
      </div>
    </div>
  );
}

export function ToolChangesCard({ r }: { r: Reliability }) {
  const t = r.tool_changes;
  if (!t || !t.tracked) return null;
  const rows = t.partial ? [] : [
    ...t.added.map((a) => ({ at: a.at, kind: "added" as const, name: a.name })),
    ...t.removed.map((d) => ({ at: d.last_seen, kind: "removed" as const, name: d.name })),
  ].sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name));
  return (
    <div className="card rel-card" style={{ marginTop: 24 }} id="tool-changes">
      <div className="card-head"><h2>Tool changes</h2><span className="small muted">Tool tracking since {shortDate(t.since)}{r.history_since ? ` · test history since ${shortDate(r.history_since)}` : ""}</span></div>
      <div className="card-body">
        {t.partial ? (
          <p className="small" style={{ margin: 0 }}><span className="badge">PARTIAL TOOL COVERAGE</span> This server lists more than 100 tools and we read the first 100, so we cannot confirm additions or removals and report none.</p>
        ) : rows.length === 0 ? (
          <p className="small" style={{ margin: 0 }}>No tool added or removed since tracking started. {t.tools} tool{t.tools === 1 ? "" : "s"} in the latest list.</p>
        ) : (
          <>
            <p className="small" style={{ marginTop: 0 }}>{t.added_count ? <><b>+{t.added_count}</b> added</> : null}{t.added_count && t.removed_count ? " · " : null}{t.removed_count ? <><b>−{t.removed_count}</b> removed</> : null} · {t.tools} tool{t.tools === 1 ? "" : "s"} in the latest list</p>
            <ul className="rel-changes">
              {rows.map((x) => (
                <li key={x.kind + x.name}>
                  <span className="mono small muted">{shortDate(x.at)}</span>
                  <span className={`rel-pill ${x.kind}`}>{x.kind === "added" ? "+ added" : "− removed"}</span>
                  <code>{x.name}</code>
                  {x.kind === "removed" ? <span className="small muted">last listed</span> : <span className="small muted">first listed</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="small muted rel-method">Changes are confirmed by comparing complete tool lists only, read about every 3 days, and dated by the day we saw them. A renamed tool appears as one removal and one addition.</p>
      </div>
    </div>
  );
}
