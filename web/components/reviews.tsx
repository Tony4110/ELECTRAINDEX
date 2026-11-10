import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { ReviewForm } from "@/components/review-form";

type Review = { id: string; rating: number; body: string; author_name: string; used_for: string | null; created_at: string };
const DB_TYPE = { agent: "agent", mcp: "mcp_server", app: "app" } as const;

/** Reviews block: approved reviews only (moderated), plus the form. Shows nothing invented when empty. */
export async function Reviews({ type, slug, name }: { type: "agent" | "mcp" | "app"; slug: string; name: string }) {
  const c = db();
  let reviews: Review[] = [];
  if (c) {
    const { data } = await c.from("v_reviews").select("id,rating,body,author_name,used_for,created_at")
      .eq("type", DB_TYPE[type]).eq("slug", slug).order("created_at", { ascending: false }).limit(20);
    reviews = (data as Review[] | null) ?? [];
  }
  const avg = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0;
  return (
    <section id="reviews" className="rv">
      <div className="tp-h" style={{ marginBottom: 12 }}>
        <h2>Reviews</h2>
        {reviews.length ? <span className="rv-avg"><b>★ {avg.toFixed(1)}</b> <span className="small muted">· {reviews.length} review{reviews.length > 1 ? "s" : ""}, checked before publication</span></span>
          : <span className="small muted">No review yet. Used {name}? Be the first to help others choose.</span>}
      </div>
      {reviews.length ? (
        <div className="rv-list">
          {reviews.map((r) => (
            <article key={r.id} className="rv-item">
              <div className="small"><b>{r.author_name}</b> <span className="rv-stars-ro" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}<span>{"★".repeat(5 - r.rating)}</span></span> <span className="muted">· {shortDate(r.created_at)}{r.used_for ? ` · used it for ${r.used_for}` : ""}</span></div>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 14 }}><ReviewForm type={type} slug={slug} name={name} /></div>
    </section>
  );
}
