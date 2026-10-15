"use client";
import { useActionState, useState } from "react";
import { sendReport, type ReportState } from "@/app/actions/report";

export type ReportStatus = { open_reports: number; under_review: boolean | null; last_rechecked_ok_at: string | null } | null;

const KINDS: { k: string; label: string; agentOnly?: boolean }[] = [
  { k: "price_wrong", label: "Price is wrong", agentOnly: true },
  { k: "info_outdated", label: "Info is outdated" },
  { k: "not_working", label: "Doesn't work" },
  { k: "broken_link", label: "Broken link" },
  { k: "other", label: "Something else" },
];
const MSG: Record<string, string> = {
  ok: "Thank you. Your report is logged and our robot will re-check the official source. Reports never change a score.",
  already_reported: "You already reported this today. Thank you, it is in the queue.",
  links_not_allowed: "Please remove links from your note and send again.",
  rate_limited: "Too many reports from your connection right now. Please try again later.",
  invalid: "This report could not be recorded.",
  error: "Something went wrong. Please try again later.",
};

/** "Is this page accurate?" — anonymous structured reports (Community Trust Loop v1). */
export function ReportBox({ type, slug, status, recheckedAgo }: { type: "agent" | "mcp"; slug: string; status: ReportStatus; recheckedAgo?: string | null }) {
  const [kind, setKind] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ReportState, FormData>(sendReport, { status: "idle" });
  const done = state.status === "ok" || state.status === "already_reported";
  return (
    <div className="card report-box" style={{ marginTop: 24 }} id="report">
      <div className="card-head">
        <h2>Is this page accurate?</h2>
        <span className="small muted">Flag it and our robot re-checks the official source. Reports never change a score.</span>
      </div>
      <div className="card-body">
        {status && status.open_reports > 0 ? (
          <p className="small" style={{ marginTop: 0 }}><span className="dot ember" />{status.under_review
            ? "Community report received · under review"
            : `${status.open_reports} community report${status.open_reports > 1 ? "s" : ""} received · re-check scheduled`}</p>
        ) : recheckedAgo ? (
          <p className="small" style={{ marginTop: 0 }}><span className="badge trust">✓ Re-checked {recheckedAgo} after a community report: still matches the official source</span></p>
        ) : null}
        {done ? <p className="report-ok" role="status">{MSG[state.status]}</p> : (
          <form action={action}>
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="kind" value={kind ?? ""} />
            <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <div className="chips" role="group" aria-label="What is wrong?">
              {KINDS.filter((x) => type === "agent" || !x.agentOnly).map((x) => (
                <button type="button" key={x.k} className={`chip report-chip ${kind === x.k ? "on" : ""}`} aria-pressed={kind === x.k} onClick={() => setKind(x.k)}>{x.label}</button>
              ))}
            </div>
            {kind ? (
              <div style={{ marginTop: 12 }}>
                <label className="small muted" htmlFor={`note-${slug}`}>What is wrong? (optional, no links)</label>
                <textarea id={`note-${slug}`} name="note" maxLength={500} rows={2} className="report-note" placeholder={kind === "price_wrong" ? "e.g. The Pro plan is now $79/month" : "e.g. The hosted endpoint returns an error"} />
                <div className="chips"><button type="submit" className="btn primary" disabled={pending}>{pending ? "Sending…" : "Send report"}</button>
                  {state.status !== "idle" && !done ? <span className="small" role="alert" style={{ color: "var(--ember-ink)" }}>{MSG[state.status]}</span> : null}</div>
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
