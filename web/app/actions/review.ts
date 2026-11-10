"use server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export type ReviewState = { status: "idle" | "ok" | "rate_limited" | "invalid" | "duplicate" | "error" };

/** "Write a review": stored as pending, published only after moderation. E-mail kept private. */
export async function submitReview(_prev: ReviewState, form: FormData): Promise<ReviewState> {
  if (String(form.get("website") ?? "")) return { status: "ok" }; // honeypot
  const c = db();
  if (!c) return { status: "error" };
  const h = await headers();
  const client = (h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const { data, error } = await c.rpc("submit_review", {
    p_type: String(form.get("type") ?? ""),
    p_slug: String(form.get("slug") ?? ""),
    p_rating: Number(form.get("rating") ?? 0),
    p_body: String(form.get("body") ?? "").slice(0, 1200),
    p_name: String(form.get("name") ?? "").slice(0, 60),
    p_used_for: String(form.get("used_for") ?? "").slice(0, 120),
    p_email: String(form.get("email") ?? "").slice(0, 200),
    p_client: client || null,
  });
  if (error) return { status: "error" };
  const s = String(data);
  return { status: (["ok", "rate_limited", "invalid", "duplicate"].includes(s) ? s : "error") as ReviewState["status"] };
}
