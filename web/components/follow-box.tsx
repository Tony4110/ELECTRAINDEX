"use client";
import { useActionState, useState } from "react";
import { followPage, type FollowState } from "@/app/actions/follow";

const MSG: Record<string, string> = {
  ok: "Done. We will email you when our robots detect a change on this page.",
  ok_program: "Done. You will get alerts for this page, and you are in the free Publisher Program.",
  rate_limited: "Too many requests from your connection right now. Please try again later.",
  invalid: "Please enter a valid email address.",
  error: "Something went wrong. Please try again later.",
};

/** The free Publisher Program: what a publisher gets by accepting our emails. Shared with the submit form. */
export function ProgramBenefits({ type }: { type: "agent" | "mcp" }) {
  return (
    <ul className="program-list">
      <li><b>Monthly report</b>: how many visitors clicked from Electra Index to your site.</li>
      <li><b>Founding pilot</b>: free live testing of your {type === "mcp" ? "server" : "agent"} for the first 10 publishers, results published on your page.</li>
      <li><b>First access</b> to sponsored placements, always labelled and outside every ranking.</li>
    </ul>
  );
}

/** Follow a tool or agent page by email (no account). Alerts never depend on accepting offers. */
export function FollowBox({ type, slug, name }: { type: "agent" | "mcp"; slug: string; name: string }) {
  const [state, action, pending] = useActionState<FollowState, FormData>(followPage, { status: "idle" });
  const [publisher, setPublisher] = useState(false);
  const [program, setProgram] = useState(false);
  const what = type === "mcp" ? "stops responding, changes version or how to connect" : "changes its price or plans";
  return (
    <div className="card follow-box" style={{ marginTop: 24 }} id="follow">
      <div className="card-head"><h2>{type === "mcp" ? `Is ${name} still online?` : `Follow ${name}`}</h2><span className="small muted">Free alerts · no account</span></div>
      <div className="card-body">
        {state.status === "ok" ? <p className="report-ok">{program ? MSG.ok_program : MSG.ok}</p> : (
          <form action={action} className="follow-form">
            <p className="small" style={{ marginTop: 0 }}>Get an email when {name} {what}. Our robots check it for you.</p>
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="slug" value={slug} />
            <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <div className="follow-row">
              <label className="sr-only" htmlFor={`follow-${slug}`}>Your email</label>
              <input id={`follow-${slug}`} name="email" type="email" required maxLength={200} placeholder="you@company.com" autoComplete="email" />
              <button type="submit" className="btn primary" disabled={pending}>{pending ? "Sending…" : "Get alerts"}</button>
            </div>
            <label className="check"><input type="checkbox" name="role" value="publisher" checked={publisher} onChange={(e) => { setPublisher(e.target.checked); if (!e.target.checked) setProgram(false); }} /> I built {name} (I&apos;m the publisher)</label>
            {publisher ? (
              <div className="program-box">
                <p className="program-title">Join the free Publisher Program</p>
                <ProgramBenefits type={type} />
                <label className="check strong-check"><input type="checkbox" name="offers" checked={program} onChange={(e) => setProgram(e.target.checked)} /> Yes, add me. At most two emails a month, unsubscribe in one click.</label>
                <p className="small muted" style={{ margin: "4px 0 0" }}>Alerts work either way. The program never changes a score.</p>
              </div>
            ) : null}
            {state.status !== "idle" ? <p className="form-error" role="alert">{MSG[state.status]}</p> : null}
            <p className="small muted" style={{ marginBottom: 0 }}>Your email is never published or shared. <a href="/privacy">Privacy</a></p>
          </form>
        )}
      </div>
    </div>
  );
}
