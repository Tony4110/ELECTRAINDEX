/** "Find an MCP tool": search the tools that online MCP servers really expose (search_mcp_tools in Supabase). */
import { db } from "@/lib/db";

export type ToolHit = {
  tool: string; description: string | null; server: string; slug: string; registry_name: string | null;
  official: boolean; status: string | null; checked_at: string | null; tool_count: number | null;
  uptime_30d: number | null; checks_30d: number; capabilities: string[];
};
export type ToolSearch = { results: ToolHit[]; total: number; error?: string };

export async function searchTools(opts: { q: string; client: string; capability?: string; access?: string; official?: boolean | null; limit?: number; dailyCap?: number }): Promise<ToolSearch> {
  const c = db();
  if (!c) return { results: [], total: 0, error: "unavailable" };
  const { data, error } = await c.rpc("search_mcp_tools", {
    p_secret: process.env.MCP_API_SECRET ?? "",
    p_client: opts.client,
    p_q: opts.q.slice(0, 120),
    p_capability: opts.capability || null,
    p_access: opts.access === "open" || opts.access === "key" ? opts.access : null,
    p_official: opts.official ?? null,
    p_limit: opts.limit ?? 20,
    p_daily_cap: opts.dailyCap ?? 200,
  });
  if (error) { console.error("search_mcp_tools", error.message); return { results: [], total: 0, error: "unavailable" }; }
  const d = (data ?? {}) as Partial<ToolSearch>;
  return { results: d.results ?? [], total: d.total ?? 0, error: d.error };
}
