"use server";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export type ReportState = { status: "idle" | "ok" | "already_reported" | "links_not_allowed" | "rate_limited" | "invalid" | "error" };

/** Community report: no account. The client address is only used, hashed per day, for rate limits. */
export async function sendReport(_prev: ReportState, form: FormData): Promise<ReportState> {
  if (String(form.get("website") ?? "")) return { status: "ok" }; // honeypot: bots fill it, people never see it
  const c = db();
  if (!c) return { status: "error" };
  const h = await headers();
  const client = (h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const { data, error } = await c.rpc("submit_report", {
    p_type: String(form.get("type") ?? ""),
    p_slug: String(form.get("slug") ?? ""),
    p_kind: String(form.get("kind") ?? ""),
    p_note: String(form.get("note") ?? "").slice(0, 500) || null,
    p_client: client || null,
  });
  if (error) return { status: "error" };
  const s = String(data);
  return { status: (["ok", "already_reported", "links_not_allowed", "rate_limited", "invalid"].includes(s) ? s : "error") as ReportState["status"] };
}
