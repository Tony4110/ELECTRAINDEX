/**
 * Agent payments (x402), tested live by the Electra Finance robot.
 * Read-only: public views of the Electra Finance database (anon key, public read).
 * Env: EF_SUPABASE_ANON_KEY (server side). Without it, every function returns empty data.
 */
const EF_URL = process.env.EF_SUPABASE_URL ?? "https://wnyjjjkotgjqwvpdganf.supabase.co";

export type X402Service = {
  id: string; url: string; method: string; service_name: string | null; description: string | null; tags: string[] | null;
  network: string | null; asset: string | null; price_usd: number | null; x402_version: number | null;
  first_seen_at: string; last_checked_at: string | null; last_verdict: string | null;
  checks_7d: number | null; passed_7d: number | null; success_7d_pct: number | null; median_latency_ms: number | null;
};
export type X402Summary = {
  services: number; checked_24h: number; passing_now: number; passing_now_pct: number | null; median_price_usd: number | null; last_check: string | null;
};

const NETWORKS: Record<string, string> = {
  "eip155:8453": "Base", "eip155:137": "Polygon", "eip155:43114": "Avalanche", "eip155:1": "Ethereum", "eip155:42161": "Arbitrum",
  "eip155:10": "Optimism", "eip155:1329": "Sei", "eip155:4689": "IoTeX", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "Solana",
};
export const networkName = (n: string | null) => (n ? NETWORKS[n] ?? n : "—");

export const VERDICT: Record<string, { label: string; tone: "pos" | "neg" | "" }> = {
  pass: { label: "Payable", tone: "pos" },
  invalid_402: { label: "Invalid payment terms", tone: "neg" },
  no_paywall: { label: "No paywall", tone: "" },
  needs_input: { label: "Needs input", tone: "" },
  gone: { label: "Gone", tone: "neg" },
  server_error: { label: "Server error", tone: "neg" },
  timeout: { label: "Timeout", tone: "neg" },
  down: { label: "Unreachable", tone: "neg" },
};

export function priceText(p: number | null | undefined) {
  if (p == null) return "—";
  const v = Number(p);
  return v >= 1 ? `$${v.toFixed(2)}` : v >= 0.01 ? `$${v.toFixed(3).replace(/0$/, "")}` : `$${v.toPrecision(2)}`;
}

async function ef<T>(path: string, revalidate = 900): Promise<T | null> {
  const key = process.env.EF_SUPABASE_ANON_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch(`${EF_URL}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      next: { revalidate },
    });
    if (!res.ok) { console.error("x402", res.status, path.slice(0, 80)); return null; }
    return (await res.json()) as T;
  } catch (e) { console.error("x402", e instanceof Error ? e.message : e); return null; }
}

const COLS = "id,url,method,service_name,description,tags,network,asset,price_usd,x402_version,first_seen_at,last_checked_at,last_verdict,checks_7d,passed_7d,success_7d_pct,median_latency_ms";

export async function getX402Summary(): Promise<X402Summary | null> {
  const r = await ef<X402Summary[]>("v_x402_summary?select=*");
  return r?.[0] ?? null;
}

export async function getX402List(sort: "reliable" | "cheapest" | "newest", limit = 100): Promise<X402Service[]> {
  const order = sort === "cheapest" ? "price_usd.asc.nullslast" : sort === "newest" ? "first_seen_at.desc" : "success_7d_pct.desc.nullslast,checks_7d.desc.nullslast";
  const filter = sort === "newest" ? "" : "&last_verdict=eq.pass";
  return (await ef<X402Service[]>(`v_x402_services?select=${COLS}${filter}&order=${order}&limit=${limit}`)) ?? [];
}

/** Hosts shared by many unrelated products: never used to match a product to an x402 service. */
const SHARED = new Set(["github.com", "github.io", "gitlab.com", "npmjs.com", "vercel.app", "netlify.app", "pages.dev", "workers.dev",
  "huggingface.co", "replit.app", "notion.site", "medium.com", "x.com", "twitter.com", "google.com", "railway.app", "onrender.com",
  "fly.dev", "herokuapp.com", "supabase.co", "smithery.ai", "glama.ai", "modelcontextprotocol.io", "amazonaws.com", "azurewebsites.net"]);

export function hostOf(u: string | null | undefined): string | null {
  if (!u) return null;
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** x402 services published on the product's own domain (or a sub-domain of it). */
export async function getX402ForHosts(urls: (string | null | undefined)[]): Promise<X402Service[] | null> {
  const hosts = Array.from(new Set(urls.map(hostOf).filter((h): h is string => !!h && h.includes(".") && !SHARED.has(h)))).slice(0, 4);
  if (!hosts.length) return [];
  const or = hosts.flatMap((h) => [`url.ilike.*://${h}/*`, `url.ilike.*.${h}/*`, `url.ilike.*://${h}`]).join(",");
  return (await ef<X402Service[]>(`v_x402_services?select=${COLS}&or=(${encodeURIComponent(or)})&order=success_7d_pct.desc.nullslast&limit=12`, 3600));
}

/** Every host with a payable x402 service (for the "x402" pill in lists). */
export async function getX402PayableHosts(): Promise<Set<string>> {
  const rows = (await ef<{ url: string }[]>("v_x402_services?select=url&last_verdict=eq.pass&limit=20000", 3600)) ?? [];
  const out = new Set<string>();
  for (const r of rows) { const h = hostOf(r.url); if (h) { out.add(h); const p = h.split("."); if (p.length > 2) out.add(p.slice(-2).join(".")); } }
  return out;
}
export function hostsMatch(set: Set<string>, urls: (string | null | undefined)[]) {
  return urls.some((u) => { const h = hostOf(u); return !!h && !SHARED.has(h) && set.has(h); });
}
