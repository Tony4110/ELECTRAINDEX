/**
 * Stripe webhook (one endpoint for both products):
 *   - "Developer pack" one-off checkout (mode "payment")  -> issues an API key by email
 *   - "Monitoring Pro" subscription checkout (mode "subscription") -> starts monitoring the buyer's server
 *     (server given by client_reference_id = Electra Index slug, set by /monitor, or a custom text field)
 *   - "Monitoring Pro" launch offer, paid once (mode "payment", amount = MONITOR_LIFETIME_CENTS, default 3999)
 *     -> starts lifetime monitoring of the buyer's server
 *   - customer.subscription.deleted -> ends Monitoring Pro
 *   STRIPE_WEBHOOK_SECRET  whsec_… (Netlify, secret)    MCP_API_SECRET  same value as Vault 'mcp_api_secret'
 *   PACK_PRICE_CENTS (default 500) · PACK_CALLS (default 600) · PACK_DAYS (default 183)
 * The signature is checked by hand (HMAC-SHA256), so no Stripe SDK is needed.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type Obj = Record<string, unknown>;

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

const str = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "id" in (v as Obj) ? String((v as Obj).id) : "");

/** The server the buyer wants monitored: our slug first, else the first filled text field of the checkout. */
function serverRef(s: Obj) {
  if (str(s.client_reference_id)) return str(s.client_reference_id);
  const fields = Array.isArray(s.custom_fields) ? (s.custom_fields as Obj[]) : [];
  for (const f of fields) {
    const v = (f.text as Obj | undefined)?.value ?? (f.dropdown as Obj | undefined)?.value;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const payload = await req.text();
  if (!secret || !validSignature(payload, req.headers.get("stripe-signature") ?? "", secret)) {
    return new Response("invalid signature", { status: 400 });
  }
  let evt: { type?: string; data?: { object?: Obj } };
  try { evt = JSON.parse(payload); } catch { return new Response("bad json", { status: 400 }); }
  const s = evt.data?.object ?? {};
  const c = db();
  const apiSecret = process.env.MCP_API_SECRET ?? "";

  // Monitoring Pro ended (cancelled, or unpaid after Stripe's retries)
  if (evt.type === "customer.subscription.deleted") {
    if (!c) return new Response("db unavailable", { status: 500 });
    const { data, error } = await c.rpc("monitor_cancel", { p_secret: apiSecret, p_subscription: str(s.id) });
    if (error) return new Response("cancel failed", { status: 500 });
    return new Response(String(data), { status: 200 });
  }

  if (evt.type !== "checkout.session.completed") return new Response("ignored", { status: 200 });
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return new Response("not paid", { status: 200 });
  const email = String((s.customer_details as Obj | undefined)?.email ?? s.customer_email ?? "");
  if (!c || !email) return new Response("cannot process", { status: 500 });      // Stripe retries

  // Monitoring Pro started: monthly subscription, or the launch offer paid once ("lifetime")
  const lifetime = s.mode === "payment" && Number(s.amount_subtotal ?? s.amount_total) === Number(process.env.MONITOR_LIFETIME_CENTS ?? 3999);
  if (s.mode === "subscription" || lifetime) {
    const { data, error } = await c.rpc("monitor_subscribe", {
      p_secret: apiSecret, p_email: email, p_ref: serverRef(s),
      p_subscription: str(s.subscription) || null, p_customer: str(s.customer) || null, p_session: str(s.id) || null,
      ...(lifetime ? { p_plan: "lifetime" } : {}),
    });
    if (error) return new Response("subscribe failed", { status: 500 });      // Stripe retries; idempotent on session id
    return new Response(String(data), { status: 200 });
  }

  // Developer pack (one-off payment)
  const unit = Number(process.env.PACK_PRICE_CENTS ?? 500);
  const packs = Math.max(1, Math.floor(Number(s.amount_subtotal ?? s.amount_total ?? unit) / unit));   // quantity bought
  const { data, error } = await c.rpc("dev_pack_issue", {
    p_secret: apiSecret, p_email: email,
    p_credits: packs * Number(process.env.PACK_CALLS ?? 600), p_days: Number(process.env.PACK_DAYS ?? 183),
    p_source: "stripe", p_ref: String(s.id ?? ""),
  });
  if (error) return new Response("issue failed", { status: 500 });             // Stripe retries; idempotent on session id
  return new Response(String(data), { status: 200 });
}
