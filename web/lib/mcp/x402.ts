/**
 * x402 (HTTP 402 Payment Required) for paid MCP tools.
 * Off until X402_PAY_TO is set in Netlify. Non-custodial: the agent pays the wallet directly,
 * a facilitator verifies and settles the USDC transfer. Electra Index never holds funds or keys.
 *   X402_PAY_TO           public receiving address (0x…) — never a private key
 *   X402_NETWORK          base | base-sepolia (default base = real network; base-sepolia only on request)
 *   X402_FACILITATOR_URL  default https://x402.org/facilitator
 */
const USDC: Record<string, { asset: string; name: string }> = {
  base: { asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", name: "USD Coin" },
  "base-sepolia": { asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", name: "USDC" },
};

export function x402Config() {
  if (!(process.env.MCP_API_SECRET ?? "")) return null;   // paid data needs the server secret too
  const payTo = (process.env.X402_PAY_TO ?? "").trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo)) return null;
  const network = process.env.X402_NETWORK === "base-sepolia" ? "base-sepolia" : "base";
  const facilitator = (process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator").replace(/\/+$/, "");
  return { payTo, network, facilitator };
}

export type Requirements = Record<string, unknown>;

export function requirements(priceUsd: number, resource: string, description: string): Requirements | null {
  const cfg = x402Config();
  if (!cfg) return null;
  const u = USDC[cfg.network];
  return {
    scheme: "exact", network: cfg.network,
    maxAmountRequired: String(Math.round(priceUsd * 1e6)),   // USDC has 6 decimals
    resource, description, mimeType: "application/json",
    payTo: cfg.payTo, maxTimeoutSeconds: 120, asset: u.asset,
    extra: { name: u.name, version: "2" },
  };
}

export function paymentRequired(req: Requirements, error = "X-PAYMENT header is required") {
  return new Response(JSON.stringify({ x402Version: 1, error, accepts: [req] }), {
    status: 402, headers: { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-expose-headers": "X-PAYMENT-RESPONSE" },
  });
}

function decode(header: string): unknown {
  try { return JSON.parse(Buffer.from(header, "base64").toString("utf8")); } catch { return null; }
}

async function call(path: string, body: unknown) {
  const cfg = x402Config();
  if (!cfg) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(`${cfg.facilitator}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Verify the payment header against the requirements (before running the tool). */
export async function verify(header: string | null, req: Requirements) {
  if (!header) return { ok: false as const, error: "X-PAYMENT header is required" };
  const payload = decode(header);
  if (!payload) return { ok: false as const, error: "Invalid X-PAYMENT header" };
  const v = await call("verify", { x402Version: 1, paymentPayload: payload, paymentRequirements: req });
  if (!v || v.isValid !== true) return { ok: false as const, error: String(v?.invalidReason ?? "Payment could not be verified") };
  return { ok: true as const, payload };
}

/** Settle after the tool ran successfully; returns the X-PAYMENT-RESPONSE header value. */
export async function settle(payload: unknown, req: Requirements) {
  const s = await call("settle", { x402Version: 1, paymentPayload: payload, paymentRequirements: req });
  if (!s || s.success !== true) return null;
  return Buffer.from(JSON.stringify({ success: true, transaction: s.transaction, network: s.network ?? req.network, payer: s.payer })).toString("base64");
}
