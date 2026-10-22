/**
 * Stripe webhook: a paid "Developer pack" checkout issues an API key by email.
 *   STRIPE_WEBHOOK_SECRET  whsec_… (Netlify, secret)    MCP_API_SECRET  same value as Vault 'mcp_api_secret'
 *   PACK_PRICE_CENTS (default 500) · PACK_CALLS (default 600) · PACK_DAYS (default 183)
 * The signature is checked by hand (HMAC-SHA256), so no Stripe SDK is needed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function validSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;              // 5-minute tolerance (replay protection)
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => {
    const sig = Buffer.from(p.slice(3), "hex"), exp = Buffer.from(expected, "hex");
    return sig.length === exp.length && timingSafeEqual(sig, exp);
  });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const payload = await req.text();
  if (!secret || !validSignature(payload, req.headers.get("stripe-signature") ?? "", secret)) {
    return new Response("invalid signature", { status: 400 });
  }
  let evt: { type?: string; data?: { object?: Record<string, unknown> } };
  try { evt = JSON.parse(payload); } catch { return new Response("bad json", { status: 400 }); }
  if (evt.type !== "checkout.session.completed") return new Response("ignored", { status: 200 });

  const s = evt.data?.object ?? {};
  if (s.payment_status !== "paid") return new Response("not paid", { status: 200 });
  const email = String((s.customer_details as Record<string, unknown> | undefined)?.email ?? s.customer_email ?? "");
  const unit = Number(process.env.PACK_PRICE_CENTS ?? 500);
  const packs = Math.max(1, Math.floor(Number(s.amount_subtotal ?? s.amount_total ?? unit) / unit));   // quantity bought
  const c = db();
  if (!c || !email) return new Response("cannot issue", { status: 500 });      // Stripe retries
  const { data, error } = await c.rpc("dev_pack_issue", {
    p_secret: process.env.MCP_API_SECRET ?? "", p_email: email,
    p_credits: packs * Number(process.env.PACK_CALLS ?? 600), p_days: Number(process.env.PACK_DAYS ?? 183),
    p_source: "stripe", p_ref: String(s.id ?? ""),
  });
  if (error) return new Response("issue failed", { status: 500 });             // Stripe retries; idempotent on session id
  return new Response(String(data), { status: 200 });
}
