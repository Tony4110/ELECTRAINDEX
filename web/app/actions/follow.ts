"use server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export type FollowState = { status: "idle" | "ok" | "rate_limited" | "invalid" | "error" };

/** "Follow this page": email kept private, client address only used hashed per day for rate limits. */
export async function followPage(_prev: FollowState, form: FormData): Promise<FollowState> {
  if (String(form.get("website") ?? "")) return { status: "ok" }; // honeypot
  const c = db();
  if (!c) return { status: "error" };
  const h = await headers();
  const client = (h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const { data, error } = await c.rpc("follow_page", {
    p_type: String(form.get("type") ?? ""),
    p_slug: String(form.get("slug") ?? ""),
    p_email: String(form.get("email") ?? "").slice(0, 200),
    p_role: form.get("role") === "publisher" ? "publisher" : "user",
    p_offers: form.get("offers") === "on",
    p_client: client || null,
  });
  if (error) return { status: "error" };
  const s = String(data);
  return { status: (["ok", "rate_limited", "invalid"].includes(s) ? s : "error") as FollowState["status"] };
}
