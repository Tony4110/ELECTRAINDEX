"use client";
import { useActionState, useState } from "react";
import { submitReview, type ReviewState } from "@/app/actions/review";

const MSG: Record<ReviewState["status"], string> = {
  idle: "",
  ok: "Thank you! Your review will appear here once checked by our team.",
  invalid: "Please choose a rating and write at least 20 characters, with your first name and a valid e-mail.",
  duplicate: "You have already reviewed this product with this e-mail.",
  rate_limited: "Too many reviews from your connection today. Please try again later.",
  error: "Something went wrong. Please try again.",
};

export function ReviewForm({ type, slug, name }: { type: "agent" | "mcp" | "app"; slug: string; name: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview, { status: "idle" });
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  if (state.status === "ok") return <p className="rv-msg ok">{MSG.ok}</p>;
  if (!open) return <button type="button" className="btn primary" onClick={() => setOpen(true)}>Write a review</button>;
  return (
    <form action={action} className="rv-form">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="rating" value={rating} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="sr-only" aria-hidden="true" />
      <fieldset className="rv-stars">
        <legend className="small strong">Your rating of {name}</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} aria-pressed={rating === n} className={n <= rating ? "on" : ""} onClick={() => setRating(n)}>★</button>
        ))}
      </fieldset>
      <label className="small strong" htmlFor="rv-body">Your experience</label>
      <textarea id="rv-body" name="body" required minLength={20} maxLength={1200} rows={4} placeholder="What did you use it for, what worked, what did not?" />
      <div className="rv-row">
        <span><label className="small strong" htmlFor="rv-name">First name</label><input id="rv-name" name="name" required minLength={2} maxLength={60} /></span>
        <span><label className="small strong" htmlFor="rv-used">Used it for (optional)</label><input id="rv-used" name="used_for" maxLength={120} placeholder="e.g. SEO audits for clients" /></span>
      </div>
      <label className="small strong" htmlFor="rv-email">E-mail <span className="muted">(private, never shown)</span></label>
      <input id="rv-email" name="email" type="email" required maxLength={200} />
      {state.status !== "idle" ? <p className="rv-msg">{MSG[state.status]}</p> : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="btn primary" disabled={pending || rating === 0}>{pending ? "Sending…" : "Send my review"}</button>
        <span className="small muted">Reviews are checked before they appear. No payment can buy or remove one.</span>
      </div>
    </form>
  );
}
