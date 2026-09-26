import pg from "pg";
import { runOnce } from "../supabase/functions/discovery-mcp-registry/index.ts";
const db = new pg.Client({ host: "/tmp", port: 5433, user: "postgres", database: process.env.DB ?? "t_bot" });
await db.connect();
const meta = (o: any = {}) => ({ "io.modelcontextprotocol.registry/official": { status: "active", publishedAt: "2026-04-13T17:32:20Z", updatedAt: "2026-04-13T17:32:20Z", isLatest: true, ...o } });
const e = (server: any, m: any = {}) => ({ server, _meta: meta(m) });
let PAGES: Record<string, any> = {
  "": { servers: [
      e({ name: "ac.inference.sh/mcp", title: "inference.sh", description: "Run 150+ AI apps", version: "1.0.0", remotes: [{ type: "streamable-http", url: "https://api.inference.sh/mcp" }] }),
      e({ name: "io.github.modelcontextprotocol/filesystem", description: "Filesystem", version: "0.6.0", repository: { url: "https://github.com/modelcontextprotocol/servers", source: "github", subfolder: "src/filesystem" }, packages: [{ registryType: "npm", identifier: "@modelcontextprotocol/server-filesystem", version: "0.6.0" }] }),
      e({ name: "io.github.modelcontextprotocol/git", description: "Git", version: "0.6.0", repository: { url: "https://github.com/modelcontextprotocol/servers", source: "github", subfolder: "src/git" }, packages: [{ registryType: "pypi", identifier: "mcp-server-git", version: "0.6.0" }] }),
    ], metadata: { nextCursor: "p2", count: 3 } },
  "p2": { servers: [
      e({ name: "io.github.acme/weather", description: "Weather", version: "2.0.0", repository: { url: "https://github.com/acme/weather.git", source: "github" }, websiteUrl: "https://acme.dev", packages: [{ registryType: "oci", identifier: "docker.io/acme/weather" }] }),
      e({ name: "io.github.acme/weather", description: "Weather old", version: "1.0.0" }, { isLatest: false }),
      e({ name: "com.old/tool", description: "Deprecated", version: "0.1.0" }, { status: "deleted" }),
      { server: { description: "broken entry without name" } },
    ], metadata: { count: 4 } },
};
const calls: string[] = [];
const mockFetch = async (url: any, init?: any) => {
  const u = new URL(String(url));
  if (u.host === "registry.modelcontextprotocol.io") {
    calls.push(u.search);
    const page = PAGES[u.searchParams.get("cursor") ?? ""];
    return new Response(JSON.stringify(page), { status: 200 });
  }
  const fn = u.pathname.split("/").pop()!;
  const args = JSON.parse(init.body);
  const keys = Object.keys(args);
  const vals = keys.map((k) => (typeof args[k] === "object" && args[k] !== null ? JSON.stringify(args[k]) : args[k]));
  const sql = `select to_jsonb(${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})) as r`;
  try { const r = await db.query(sql, vals); return new Response(JSON.stringify(r.rows[0]?.r ?? null), { status: 200 }); }
  catch (err: any) { return new Response(err.message, { status: 400 }); }
};
const env = { url: "http://local", key: "test-legacy-jwt" };
const q = async (s: string) => (await db.query(s)).rows;

console.log("RUN A (budget 1ms):", await runOnce(env, mockFetch as any, 1)); console.log(await q("select value from engine_config where key='bot.mcp_registry'")); console.log("RUN B:", await runOnce(env, mockFetch as any));
console.log(await q("select name, status, slug from entities where type='mcp_server' order by name"));
console.log(await q("select alias_type, value from entity_aliases order by alias_type, value"));
console.log(await q("select value from engine_config where key='bot.mcp_registry'"));
// RUN 2: incremental, weather bumps to 2.1.0 and gains remote
PAGES = { "": { servers: [ e({ name: "io.github.acme/weather", description: "Weather", version: "2.1.0", repository: { url: "https://github.com/acme/weather", source: "github" }, remotes: [{ type: "sse", url: "https://acme.dev/sse" }], packages: [{ registryType: "oci", identifier: "docker.io/acme/weather" }] }) ], metadata: {} } };
console.log("RUN 2 (incremental):", await runOnce(env, mockFetch as any));
console.log("registry query params:", calls);
console.log(await q("select e.name, c.event_type, c.field, c.old_value, c.new_value from change_events c join entities e on e.id=c.entity_id where c.event_type<>'new_entity' order by c.detected_at"));
console.log(await q("select bot, status, items_seen, items_new, items_changed, errors, log->>'mode' mode, log->'error_samples' samples from crawl_runs order by started_at"));
console.log(await q("select count(*) n_entities from entities where type='mcp_server'"));
await db.end();
