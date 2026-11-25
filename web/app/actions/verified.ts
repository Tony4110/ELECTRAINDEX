"use server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export type VerifiedState = { status: "idle" | "confirm_sent" | "already" | "not_found" | "not_hosted" | "not_owner_page" | "invalid_email" | "invalid_url" | "rate_limited" | "error"; name?: string; slug?: string };

/** Electra Verified request: the publisher's email is confirmed by a button before anything starts. */
export async function requestVerified(_prev: VerifiedState, form: FormData): Promise<VerifiedState> {
  if (String(form.get("website") ?? "")) return { status: "confirm_sent" }; // honeypot
  const c = db();
  if (!c) return { status: "error" };
  const h = await headers();
  const client = (h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const { data, error } = await c.rpc("verified_request", {
    p_ref: String(form.get("server") ?? "").slice(0, 300),
    p_email: String(form.get("email") ?? "").slice(0, 200),
    p_badge_url: String(form.get("page") ?? "").slice(0, 500),
    p_client: client || null,
  });
  if (error || !data) return { status: "error" };
  const d = data as VerifiedState;
  return { status: d.status ?? "error", name: d.name, slug: d.slug };
}
