"use client";
import { useActionState } from "react";
import { requestVerified, type VerifiedState } from "@/app/actions/verified";

const MSG: Record<string, string> = {
  already: "This server is already Electra Verified, or its request is being checked.",
  not_found: "We could not find this server. Use its Electra Index page (electraindex.com/mcp/…) or its endpoint URL.",
  not_hosted: "This server has no hosted endpoint we can test, so it cannot be Verified.",
  not_owner_page: "The badge page must be on your own domain (your website or your endpoint's domain) or your server's GitHub repository.",
  invalid_email: "Please enter a valid email address.",
  invalid_url: "Please enter the full address of the page that shows the badge (https://…).",
  rate_limited: "Too many requests right now. Please try again tomorrow.",
  error: "Something went wrong. Please try again later.",
};

export function VerifiedForm({ server = "" }: { server?: string }) {
  const [state, action, pending] = useActionState<VerifiedState, FormData>(requestVerified, { status: "idle" });
  if (state.status === "confirm_sent") return (
    <p className="report-ok">Check your inbox: press the button in our email to confirm. We then look for the badge{state.name ? ` of ${state.name}` : ""} on your page, usually within 15 minutes.</p>
  );
  return (
    <form action={action} className="follow-form">
      <label className="hp" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <label className="small" htmlFor="v-server">Your MCP server</label>
      <input id="v-server" name="server" defaultValue={server} required maxLength={300} placeholder="https://electraindex.com/mcp/your-server or https://mcp.example.com/mcp" />
      <label className="small" htmlFor="v-page" style={{ marginTop: 10, display: "block" }}>The page that shows the badge</label>
      <input id="v-page" name="page" type="url" required maxLength={500} placeholder="https://example.com or https://github.com/you/your-server" />
      <label className="small" htmlFor="v-email" style={{ marginTop: 10, display: "block" }}>Your email (for outage alerts)</label>
      <div className="follow-row">
        <input id="v-email" name="email" type="email" required maxLength={200} placeholder="you@company.com" autoComplete="email" />
        <button type="submit" className="btn primary" disabled={pending}>{pending ? "Sending…" : "Get Verified →"}</button>
      </div>
      {state.status !== "idle" ? <p className="form-error" role="alert">{MSG[state.status] ?? MSG.error}</p> : null}
      <p className="small muted" style={{ marginBottom: 0 }}>Free. Your email is never published or shared. <a href="/privacy">Privacy</a></p>
    </form>
  );
}
