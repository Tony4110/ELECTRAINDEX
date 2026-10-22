/** Electra Index MCP server: the tools AI assistants can call. Read-only, public data only. */
import { db } from "@/lib/db";

const SITE = "https://electraindex.com";
type Json = Record<string, unknown>;
export type ToolDef = { name: string; title: string; description: string; inputSchema: Json; paid?: boolean; priceUsd?: number; run: (args: Json) => Promise<unknown> };

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};
const slugOf = (v: unknown) => str(v, 160).toLowerCase().replace(/[^a-z0-9-]/g, "");

function client() {
  const c = db();
  if (!c) throw new Error("Electra Index data is temporarily unavailable.");
  return c;
}

async function liveFor(slugs: string[]) {
  if (!slugs.length) return new Map<string, Json>();
  const { data } = await client().from("v_mcp_live").select("slug,status,tool_count,tools_more,checked_at,protocol_version").in("slug", slugs);
  return new Map(((data as Json[] | null) ?? []).map((r) => [String(r.slug), r]));
}
const liveSummary = (l?: Json) => (l ? { status: l.status, tools: l.tool_count ?? null, more_tools: l.tools_more ?? false, checked_at: l.checked_at } : null);

export const TOOLS: ToolDef[] = [
  {
    name: "search_mcp_servers",
    title: "Search MCP servers",
    description: "Search the Electra Index catalogue of MCP servers (from the Official MCP Registry, tested live by Electra Index). Returns name, description, hosted or local, live check status and the Electra Index page. Use it to find a server for a task, e.g. 'web scraping', 'invoices', 'postgres'.",
    inputSchema: { type: "object", properties: {
      query: { type: "string", description: "What the server should do, or its name." },
      limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
      hosted_only: { type: "boolean", default: false, description: "Only servers usable through a hosted endpoint (nothing to install)." },
    }, required: ["query"] },
    async run(a) {
      const q = str(a.query); if (!q) throw new Error("query is required");
      const limit = int(a.limit, 5, 1, 10);
      const { data } = await client().rpc("search_entities", { p_q: q, p_type: "mcp_server", p_limit: 40 });
      const hits = ((data as Json[] | null) ?? []);
      const { data: srv } = await client().from("v_mcp_servers").select("slug,name,short_description,remote,local,version").in("slug", hits.map((h) => String(h.slug)));
      const bySlug = new Map(((srv as Json[] | null) ?? []).map((s) => [String(s.slug), s]));
      let rows = hits.map((h) => bySlug.get(String(h.slug))).filter(Boolean) as Json[];
      if (a.hosted_only === true) rows = rows.filter((r) => r.remote === true);
      rows = rows.slice(0, limit);
      const live = await liveFor(rows.map((r) => String(r.slug)));
      return { query: q, results: rows.map((r) => ({
        name: r.name, slug: r.slug, description: r.short_description, version: r.version,
        hosted: r.remote ?? null, installable: r.local ?? null, live_check: liveSummary(live.get(String(r.slug))),
        page: `${SITE}/mcp/${r.slug}` })), source: "Electra Index (electraindex.com), data from the Official MCP Registry" };
    },
  },
  {
    name: "get_mcp_server",
    title: "Get an MCP server",
    description: "Everything Electra Index knows about one MCP server: description, hosted endpoints and required headers (names only), install packages and required environment variables, live check result, capabilities. Use the slug returned by search_mcp_servers.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    async run(a) {
      const slug = slugOf(a.slug); if (!slug) throw new Error("slug is required");
      const c = client();
      const { data: m } = await c.from("v_mcp_servers").select("*").eq("slug", slug).maybeSingle();
      if (!m) throw new Error(`No MCP server with slug "${slug}" on Electra Index.`);
      const s = m as Json;
      const [{ data: caps }, live] = await Promise.all([
        c.from("v_provider_capabilities").select("capability_slug,capability").eq("provider_slug", slug).eq("provider_type", "mcp_server"),
        liveFor([slug]),
      ]);
      const remotes = Array.isArray(s.remotes) ? (s.remotes as Json[]) : [];
      const pkgs = Array.isArray(s.package_list) ? (s.package_list as Json[]) : [];
      return {
        name: s.name, slug, description: s.description ?? s.short_description, version: s.version,
        website: s.website, repository: s.repository_url, registry_name: s.registry_name,
        hosted_endpoints: remotes.map((r) => ({ url: r.url, transport: r.type, required_headers: ((r.headers as Json[] | null) ?? []).filter((h) => h.required).map((h) => h.name) })),
        packages: pkgs.map((p) => ({ registry: p.registry, identifier: p.identifier, version: p.version, transport: p.transport, required_env: ((p.env as Json[] | null) ?? []).filter((e) => e.required).map((e) => e.name) })),
        live_check: liveSummary(live.get(slug)),
        capabilities: ((caps as Json[] | null) ?? []).map((x) => x.capability),
        first_seen: s.first_seen_at, last_seen_in_registry: s.last_seen_at,
        page: `${SITE}/mcp/${slug}`,
        note: "Facts as declared in the Official MCP Registry; live check = the server answered an MCP connection at that time, not a guarantee of quality or security.",
      };
    },
  },
  {
    name: "best_mcp_servers_for",
    title: "Best MCP servers for a use case",
    description: "Ranked MCP servers for a use case (e.g. 'web-scraping', 'payments', 'sql-querying', 'seo-optimization'). Ranking uses public facts only (name match, breadth, hosted, open source, freshness), never payment. Call without use_case to get the list of use cases.",
    inputSchema: { type: "object", properties: { use_case: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 15, default: 10 } } },
    async run(a) {
      const c = client();
      const want = str(a.use_case, 80).toLowerCase();
      const { data: ov } = await c.from("v_capability_overview").select("capability_slug,capability,tools,hosted_tools").order("tools", { ascending: false });
      const list = ((ov as Json[] | null) ?? []);
      const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const hit = want ? list.find((x) => x.capability_slug === norm(want)) ?? list.find((x) => String(x.capability).toLowerCase().includes(want)) : undefined;
      if (!hit) return { use_cases: list.map((x) => ({ use_case: x.capability_slug, name: x.capability, servers: x.tools, hosted: x.hosted_tools })), hint: "Call again with one of these use_case values." };
      const { data } = await c.from("v_capability_tools").select("tool_slug,tool_name,short_description,remote,has_source,last_seen_at")
        .eq("capability_slug", hit.capability_slug).order("name_match", { ascending: false }).order("breadth", { ascending: false, nullsFirst: false })
        .order("remote", { ascending: false }).order("has_source", { ascending: false }).order("last_seen_at", { ascending: false }).limit(int(a.limit, 10, 1, 15));
      const rows = ((data as Json[] | null) ?? []);
      const live = await liveFor(rows.map((r) => String(r.tool_slug)));
      return { use_case: hit.capability, servers_in_category: hit.tools, page: `${SITE}/mcp/best/${hit.capability_slug}`,
        results: rows.map((r, i) => ({ rank: i + 1, name: r.tool_name, slug: r.tool_slug, description: r.short_description, hosted: r.remote, open_source: r.has_source, live_check: liveSummary(live.get(String(r.tool_slug))), page: `${SITE}/mcp/${r.tool_slug}` })),
        method: `${SITE}/sources` };
    },
  },
  {
    name: "search_ai_agents",
    title: "Search AI agents",
    description: "Search ready-made AI agents (products) on Electra Index: Agent Score (0-100, public data only), starting price per month, free plan, themes and page. E.g. 'sales outreach', 'customer support', 'coding'.",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 10, default: 5 } }, required: ["query"] },
    async run(a) {
      const q = str(a.query); if (!q) throw new Error("query is required");
      const c = client();
      const { data } = await c.rpc("search_entities", { p_q: q, p_type: "agent", p_limit: 30 });
      const slugs = ((data as Json[] | null) ?? []).map((h) => String(h.slug));
      const { data: cards } = await c.from("v_agent_cards").select("slug,name,company,short_description,themes,quality_score,from_usd_month,has_free,pricing_verified,website").in("slug", slugs);
      const by = new Map(((cards as Json[] | null) ?? []).map((x) => [String(x.slug), x]));
      return { query: q, results: slugs.map((s) => by.get(s)).filter(Boolean).slice(0, int(a.limit, 5, 1, 10)).map((x) => {
        const r = x as Json;
        return { name: r.name, slug: r.slug, company: r.company, description: r.short_description, themes: r.themes,
          agent_score: r.quality_score, from_usd_per_month: r.from_usd_month, free_plan: r.has_free, price_verified: r.pricing_verified,
          website: r.website, page: `${SITE}/agents/${r.slug}` };
      }), note: "Agent Score measures observable public data, not performance. Paid partnerships never change a score." };
    },
  },
  {
    name: "get_agent_pricing",
    title: "Get an AI agent's pricing",
    description: "Current plans of an AI agent as read on its official pricing page, each with the date it was last confirmed. Use the slug from search_ai_agents.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    async run(a) {
      const slug = slugOf(a.slug); if (!slug) throw new Error("slug is required");
      const c = client();
      const { data: card } = await c.from("v_agent_cards").select("id,name,pricing_url,pricing_verified,from_usd_month,has_free").eq("slug", slug).maybeSingle();
      if (!card) throw new Error(`No AI agent with slug "${slug}" on Electra Index.`);
      const k = card as Json;
      const { data: plans } = await c.from("v_current_prices").select("plan_name,billing_model,amount,currency,interval,unit,is_trial,last_confirmed_at").eq("entity_id", k.id).order("amount", { ascending: true, nullsFirst: false });
      return { name: k.name, slug, pricing_page: k.pricing_url, verified_on_official_page: k.pricing_verified,
        from_usd_per_month: k.from_usd_month, free_plan: k.has_free,
        plans: ((plans as Json[] | null) ?? []).map((p) => ({ plan: p.plan_name, billing: p.billing_model, amount: p.amount, currency: p.currency, interval: p.interval, unit: p.unit, trial: p.is_trial, last_confirmed: p.last_confirmed_at })),
        page: `${SITE}/agents/${slug}` };
    },
  },
  {
    name: "get_mcp_server_tools",
    title: "List an MCP server's tools (live)",
    description: "The tools an MCP server actually offers, as listed to Electra Index's robot during its last live connection (names and descriptions, up to 100), with the date. Saves you connecting to the server yourself. Paid per call (x402, USDC on Base).",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    paid: true,
    priceUsd: 0.002,
    async run(a) {
      const slug = slugOf(a.slug); if (!slug) throw new Error("slug is required");
      const { data } = await client().from("v_mcp_live").select("status,tool_count,tools_more,tools,checked_at,protocol_version,server_name,server_version").eq("slug", slug).maybeSingle();
      if (!data) throw new Error(`No live check yet for "${slug}". Hosted servers are tested every few days.`);
      const l = data as Json;
      return { slug, status: l.status, checked_at: l.checked_at, protocol_version: l.protocol_version, server: { name: l.server_name, version: l.server_version },
        tool_count: l.tool_count, more_tools_not_listed: l.tools_more, tools: l.tools ?? [], page: `${SITE}/mcp/${slug}` };
    },
  },
];
