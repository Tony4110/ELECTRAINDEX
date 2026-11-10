// Electra Index — Robot "signals-adoption" (Trending 24H / 7D / 30D)
// Supabase Edge Function (Deno), one file. Deploy with JWT verification OFF (the cron calls it without a key).
//
// Each call (every hour via pg_cron):
//   1. GitHub (SRC-018, official GraphQL API): stars + forks of the products we know a repository for
//   2. npm (SRC-019, official downloads API): daily downloads of the products we know a package for
//      (first check: last 60 days, so 7D and 30D work right away; then the last 8 days)
//   3. recomputes the 24H / 7D / 30D ranking (refresh_trends)
// Official APIs only. No scraping. It never writes tables directly: all rules live in SQL.
//
// Secrets (Edge Functions > Secrets):
//   GITHUB_TOKEN  required for GitHub (a fine-grained token with no permission at all is enough: public data only)
//   CRON_SECRET   optional; if set, calls must send the header x-cron-secret
//
// Test by hand:  …/functions/v1/signals-adoption?job=npm&limit=20

const TIME_BUDGET_MS = 110_000;
const USER_AGENT = "ElectraIndexBot/1.0 (+https://electraindex.com/sources)";
const GH_BATCH = 50;
const NPM_BULK = 100; // the API accepts up to 128 unscoped packages per call

type Env = { url: string; key: string; githubToken?: string };
type Target = { entity_id: string; ids: string[]; first: boolean };
type Point = { entity_id: string; metric: string; value: number; observed_at: string };
type Fetched = { entity_id: string; ok: boolean; note?: string | null };

function serviceKey(get: (k: string) => string | undefined): string {
  const direct = get("SUPABASE_SERVICE_ROLE_KEY") || get("SUPABASE_SECRET_KEY");
  if (direct) return direct;
  const many = get("SUPABASE_SECRET_KEYS");
  if (many) { try { const v = Object.values(JSON.parse(many))[0]; if (typeof v === "string") return v; } catch { /* ignore */ } }
  throw new Error("No service key available in the function environment");
}

async function rpc(env: Env, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: env.key };
  if (!env.key.startsWith("sb_")) headers.Authorization = `Bearer ${env.key}`;
  const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dayIso = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------- GitHub
async function githubJob(env: Env, limit: number, deadline: number) {
  if (!env.githubToken) return { skipped: "GITHUB_TOKEN secret not set" };
  const run = await rpc(env, "start_crawl_run", { p_bot: "scoring", p_source_code: "SRC-018" }) as string | null;
  if (!run) return { skipped: "a GitHub run is already in progress" };
  const targets = (await rpc(env, "signal_targets", { p_family: "github", p_limit: limit }) ?? []) as Target[];
  const observed = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const totals = { targets: targets.length, checked: 0, found: 0, points: 0, errors: 0 };
  let stopped: string | null = null;

  for (let i = 0; i < targets.length; i += GH_BATCH) {
    if (Date.now() > deadline) { stopped = "time budget"; break; }
    const batch = targets.slice(i, i + GH_BATCH);
    const parts: string[] = [];
    const map: { alias: string; t: Target }[] = [];
    batch.forEach((t, k) => {
      const [owner, name] = (t.ids[0] ?? "").split("/");
      if (!owner || !name || !/^[A-Za-z0-9_.-]+$/.test(owner + name)) return;
      const alias = `r${k}`;
      parts.push(`${alias}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { stargazerCount forkCount }`);
      map.push({ alias, t });
    });
    const bad = batch.filter((t) => !map.some((m) => m.t === t)).map((t) => ({ entity_id: t.entity_id, ok: false, note: "invalid repository id" }));
    if (!parts.length) { await rpc(env, "ingest_signals", { p_family: "github", p_points: [], p_fetched: bad, p_run: run }); continue; }

    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${env.githubToken}`, "Content-Type": "application/json", "User-Agent": USER_AGENT },
      body: JSON.stringify({ query: `query { ${parts.join("\n")} rateLimit { remaining } }` }),
    });
    if (!res.ok) { totals.errors++; stopped = `github ${res.status}`; break; }
    const j = await res.json() as { data?: Record<string, { stargazerCount: number; forkCount: number } | null> & { rateLimit?: { remaining: number } } };
    const points: Point[] = [];
    const fetched: Fetched[] = [...bad];
    for (const { alias, t } of map) {
      const r = j.data?.[alias] as { stargazerCount: number; forkCount: number } | null | undefined;
      if (r && typeof r.stargazerCount === "number") {
        points.push({ entity_id: t.entity_id, metric: "github_stars", value: r.stargazerCount, observed_at: observed });
        points.push({ entity_id: t.entity_id, metric: "github_forks", value: r.forkCount, observed_at: observed });
        fetched.push({ entity_id: t.entity_id, ok: true });
        totals.found++;
      } else fetched.push({ entity_id: t.entity_id, ok: false, note: "repository not found" });
    }
    const out = await rpc(env, "ingest_signals", { p_family: "github", p_points: points, p_fetched: fetched, p_run: run }) as { points: number; checked: number };
    totals.points += out.points; totals.checked += out.checked;
    if ((j.data?.rateLimit?.remaining ?? 1000) < 200) { stopped = "GitHub rate limit almost used"; break; }
  }
  await rpc(env, "finish_crawl_run", {
    p_run: run, p_status: stopped && totals.errors ? "partial" : "success",
    p_seen: totals.checked, p_new: totals.points, p_changed: 0, p_errors: totals.errors, p_log: { job: "github", stopped, ...totals },
  });
  return { ...totals, stopped };
}

// ---------------------------------------------------------------- npm
type NpmRange = { downloads?: { day: string; downloads: number }[]; package?: string } | null;

async function npmRange(pkgs: string[], start: string, end: string): Promise<Record<string, NpmRange> | null> {
  const path = pkgs.length === 1 ? pkgs[0] : pkgs.join(",");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://api.npmjs.org/downloads/range/${start}:${end}/${path}`, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 404) return pkgs.length === 1 ? { [pkgs[0]]: null } : {};
    if (res.status === 429 || res.status >= 500) { await sleep(1500 * attempt); continue; }
    if (!res.ok) return null;
    const j = await res.json() as unknown;
    if (pkgs.length === 1) return { [pkgs[0]]: j as NpmRange };
    return j as Record<string, NpmRange>;
  }
  return null;
}

async function npmJob(env: Env, limit: number, deadline: number) {
  const run = await rpc(env, "start_crawl_run", { p_bot: "scoring", p_source_code: "SRC-019" }) as string | null;
  if (!run) return { skipped: "an npm run is already in progress" };
  const targets = (await rpc(env, "signal_targets", { p_family: "npm", p_limit: limit }) ?? []) as Target[];
  const totals = { targets: targets.length, checked: 0, found: 0, points: 0, errors: 0 };
  let stopped: string | null = null;
  const end = new Date(Date.now() - 86400000); // yesterday: the last complete day
  const endIso = dayIso(end);

  // first checks need 60 days of history, later checks only 8 days
  for (const first of [true, false]) {
    const group = targets.filter((t) => t.first === first);
    const startIso = dayIso(new Date(end.getTime() - (first ? 59 : 7) * 86400000));
    const unscoped = group.filter((t) => t.ids.every((p) => !p.startsWith("@")));
    const scoped = group.filter((t) => !unscoped.includes(t));
    const chunks: Target[][] = [];
    for (let i = 0; i < unscoped.length; i += Math.floor(NPM_BULK / 2)) chunks.push(unscoped.slice(i, i + Math.floor(NPM_BULK / 2)));
    for (const t of scoped) chunks.push([t]);

    for (const chunk of chunks) {
      if (Date.now() > deadline) { stopped = "time budget"; break; }
      const pkgs = Array.from(new Set(chunk.flatMap((t) => t.ids))).slice(0, NPM_BULK);
      let data: Record<string, NpmRange> | null = {};
      if (pkgs.length === 1 || pkgs.every((p) => !p.startsWith("@"))) data = await npmRange(pkgs, startIso, endIso);
      else { // scoped packages: one call each
        for (const p of pkgs) { const r = await npmRange([p], startIso, endIso); if (r && data) Object.assign(data, r); else data = null; }
      }
      if (!data) { totals.errors++; continue; }
      const points: Point[] = [];
      const fetched: Fetched[] = [];
      for (const t of chunk) {
        const perDay = new Map<string, number>();
        let any = false;
        for (const p of t.ids) {
          const r = data[p];
          if (!r?.downloads) continue;
          any = true;
          for (const d of r.downloads) perDay.set(d.day, (perDay.get(d.day) ?? 0) + (d.downloads ?? 0));
        }
        if (any) {
          for (const [day, v] of perDay) points.push({ entity_id: t.entity_id, metric: "npm_downloads_day", value: v, observed_at: `${day}T00:00:00Z` });
          fetched.push({ entity_id: t.entity_id, ok: true });
          totals.found++;
        } else fetched.push({ entity_id: t.entity_id, ok: false, note: "package not found on npm" });
      }
      const out = await rpc(env, "ingest_signals", { p_family: "npm", p_points: points, p_fetched: fetched, p_run: run }) as { points: number; checked: number };
      totals.points += out.points; totals.checked += out.checked;
      await sleep(300); // stay gentle with the public API
    }
    if (stopped) break;
  }
  await rpc(env, "finish_crawl_run", {
    p_run: run, p_status: totals.errors ? "partial" : "success",
    p_seen: totals.checked, p_new: totals.points, p_changed: 0, p_errors: totals.errors, p_log: { job: "npm", stopped, ...totals },
  });
  return { ...totals, stopped };
}

// ---------------------------------------------------------------- entry point
// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D) {
  D.serve(async (req: Request) => {
    const get = (k: string): string | undefined => D.env.get(k);
    const secret = get("CRON_SECRET");
    if (secret && req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });
    const u = new URL(req.url);
    const job = u.searchParams.get("job") ?? "all";
    const limit = Math.min(3000, Math.max(1, Number(u.searchParams.get("limit") ?? 1500) || 1500));
    const env: Env = { url: get("SUPABASE_URL")!, key: serviceKey(get), githubToken: get("GITHUB_TOKEN") };
    const t0 = Date.now();
    const out: Record<string, unknown> = {};
    try {
      if (job === "all" || job === "github") out.github = await githubJob(env, limit, t0 + TIME_BUDGET_MS * 0.45);
      if (job === "all" || job === "npm") out.npm = await npmJob(env, Math.min(limit, 800), t0 + TIME_BUDGET_MS * 0.9);
      out.trends = await rpc(env, "refresh_trends", {});
      out.ms = Date.now() - t0;
      return Response.json(out);
    } catch (e) {
      return Response.json({ ...out, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  });
}
