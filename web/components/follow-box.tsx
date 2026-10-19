"use client";
import { useActionState } from "react";
import { followPage, type FollowState } from "@/app/actions/follow";

const MSG: Record<string, string> = {
  ok: "Done. We will email you when our robots detect a change on this page.",
  rate_limited: "Too many requests from your connection right now. Please try again later.",
  invalid: "Please enter a valid email address.",
  error: "Something went wrong. Please try again later.",
};

/** Follow a tool or agent page by email (no account). */
export function FollowBox({ type, slug, name }: { type: "agent" | "mcp"; slug: string; name: string }) {
  const [state, action, pending] = useActionState<FollowState, FormData>(followPage, { status: "idle" });
  const what = type === "mcp" ? "stops responding, changes version or how to connect" : "changes its price or plans";
  return (
    <div className="card follow-box" style={{ marginTop: 24 }} id="follow">
      <div className="card-head"><h2>Follow {name}</h2><span className="small muted">Free · no account</span></div>
      <div className="card-body">
        {state.status === "ok" ? <p className="report-ok">{MSG.ok}</p> : (
          <form action={action} className="follow-form">
            <p className="small" style={{ marginTop: 0 }}>Get an email when {name} {what}. Built it? Tick &quot;I&apos;m the publisher&quot;: you will also hear when your page changes.</p>
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="slug" value={slug} />
            <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <div className="follow-row">
              <label className="sr-only" htmlFor={`follow-${slug}`}>Your email</label>
              <input id={`follow-${slug}`} name="email" type="email" required maxLength={200} placeholder="you@company.com" autoComplete="email" />
              <button type="submit" className="btn primary" disabled={pending}>{pending ? "Sending…" : "Follow"}</button>
            </div>
            <label className="check"><input type="checkbox" name="role" value="publisher" /> I&apos;m the publisher of {name}</label>
            <label className="check"><input type="checkbox" name="offers" /> Also send me Electra Index offers for publishers (sponsored placements, live testing). At most twice a month.</label>
            {state.status !== "idle" ? <p className="form-error" role="alert">{MSG[state.status]}</p> : null}
            <p className="small muted" style={{ marginBottom: 0 }}>Your email is never published or shared. Unsubscribe in one click from any email. <a href="/privacy">Privacy</a></p>
          </form>
        )}
      </div>
    </div>
  );
}
