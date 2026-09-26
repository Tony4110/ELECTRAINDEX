// Intendex — Robot #1 : Discovery · Official MCP Registry (SRC-001)
// Supabase Edge Function (Deno). Deploy with JWT verification OFF (the cron calls it without a key).
//
// What it does, each call (every 15 min via pg_cron):
//   1. opens a crawl run (skips if one is already running)
//   2. reads registry pages (latest versions only), 100 servers per page
//      - first time: full crawl, resumable with a saved cursor across calls
//      - afterwards: only servers updated since the last complete crawl
//   3. sends each page to the SQL function ingest_mcp_servers() (dedupe, history, change events)
//   4. saves progress and closes the run with counts
// It never writes tables directly: all rules live in SQL.

const REGISTRY = "https://registry.modelcontextprotocol.io/v0.1/servers";
const SOURCE = "SRC-001";
const STATE_KEY = "bot.mcp_registry";
const PAGE_SIZE = 100;
const TIME_BUDGET_MS = 100_000; // stay under the Edge Function wall-clock limit
const USER_AGENT = "IntendexBot/0.1 (+https://github.com/Tony4110/intendex)";

type Env = { url: string; key: string; cronSecret?: string };
type State = { cursor?: string | null; mode?: "full" | "incremental"; updated_since?: string | null; last_complete?: string | null };
type Fetch = typeof fetch;

function serviceKey(get: (k: string) => string | undefined): string {
  const direct = get("SUPABASE_SERVICE_ROLE_KEY") || get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  const many = get("SUPABASE_SECRET_KEYS"); // new-style keys, JSON object {name: key}
  if (many) { try { const v = Object.values(JSON.parse(many))[0]; if (typeof v === "string") return v; } catch { /* ignore */ } }
  throw new Error("No service key available in the function environment");
}

async function rpc(env: Env, fn: string, args: Record<string, unknown>, f: Fetch): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: env.key };
  if (!env.key.startsWith("sb_")) headers.Authorization = `Bearer ${env.key}`; // legacy JWT keys
  const res = await f(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function getPage(params: URLSearchParams, f: Fetch): Promise<{ servers: unknown[]; next: string | null }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await f(`${REGISTRY}?${params}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (res.ok) {
      const j = await res.json() as { servers?: unknown[]; metadata?: { nextCursor?: string; next_cursor?: string } };
      return { servers: j.servers ?? [], next: j.metadata?.nextCursor ?? j.metadata?.next_cursor ?? null };
    }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
    throw new Error(`registry ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  throw new Error("registry unavailable after 3 attempts");
}

export async function runOnce(env: Env, f: Fetch = fetch, budgetMs = TIME_BUDGET_MS) {
  const t0 = Date.now();
  const startedIso = new Date().toISOString();
  const run = await rpc(env, "start_crawl_run", { p_bot: "discovery", p_source_code: SOURCE }, f) as string | null;
  if (!run) return { skipped: true, reason: "a run is already in progress" };

  const state = ((await rpc(env, "get_state", { p_key: STATE_KEY }, f)) ?? {}) as State;
  let mode: "full" | "incremental";
  let updatedSince: string | null = null;
  if (state.cursor) { mode = state.mode ?? "full"; updatedSince = state.updated_since ?? null; }
  else if (state.last_complete) {
    mode = "incremental";
    updatedSince = new Date(Date.parse(state.last_complete) - 60 * 60 * 1000).toISOString(); // 1 h overlap
  } else mode = "full";

  let cursor: string | null = state.cursor ?? null;
  const totals = { seen: 0, new: 0, changed: 0, errors: 0, pages: 0 };
  const samples: unknown[] = [];
  let finished = false;

  try {
    while (true) { // always at least one page, then continue while time remains
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), version: "latest" });
      if (cursor) params.set("cursor", cursor);
      if (updatedSince) params.set("updated_since", updatedSince);
      const page = await getPage(params, f);
      if (page.servers.length) {
        const r = await rpc(env, "ingest_mcp_servers", { p_items: page.servers, p_run: run }, f) as
          { seen: number; new: number; changed: number; errors: number; error_samples: unknown[] };
        totals.seen += r.seen; totals.new += r.new; totals.changed += r.changed; totals.errors += r.errors;
        if (samples.length < 5) samples.push(...(r.error_samples ?? []).slice(0, 5 - samples.length));
      }
      totals.pages++;
      cursor = page.next;
      if (!cursor || page.servers.length === 0) { finished = true; break; }
      if (Date.now() - t0 >= budgetMs) break;
    }

    const newState: State = finished
      ? { cursor: null, mode: undefined, updated_since: null,
          last_complete: startedIso }
      : { ...state, cursor, mode, updated_since: updatedSince };
    await rpc(env, "set_state", { p_key: STATE_KEY, p_value: newState }, f);
    await rpc(env, "finish_crawl_run", {
      p_run: run, p_status: finished ? "success" : "partial",
      p_seen: totals.seen, p_new: totals.new, p_changed: totals.changed, p_errors: totals.errors,
      p_log: { mode, pages: totals.pages, finished, updated_since: updatedSince, error_samples: samples, ms: Date.now() - t0 },
    }, f);
    return { run, mode, finished, ...totals };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // keep the cursor so the next call resumes where this one stopped
    await rpc(env, "set_state", { p_key: STATE_KEY, p_value: { ...state, cursor, mode, updated_since: updatedSince } }, f).catch(() => {});
    await rpc(env, "finish_crawl_run", {
      p_run: run, p_status: "failed", p_seen: totals.seen, p_new: totals.new, p_changed: totals.changed,
      p_errors: totals.errors + 1, p_log: { mode, pages: totals.pages, error: msg },
    }, f).catch(() => {});
    throw e;
  }
}

// ---- Deno entry point -------------------------------------------------
// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D) {
  D.serve(async (req: Request) => {
    const get = (k: string): string | undefined => D.env.get(k);
    const secret = get("CRON_SECRET");
    if (secret && req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });
    try {
      const out = await runOnce({ url: get("SUPABASE_URL")!, key: serviceKey(get) });
      return Response.json(out);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  });
}
