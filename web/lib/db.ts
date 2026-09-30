import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Read-only client (anon / publishable key). The database only exposes published rows. */
export function db(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export type McpServer = {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  website: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  last_verified_at: string | null;
  version: string | null;
  remote: boolean | null;
  local: boolean | null;
  packages: string[] | null;
  repository_url: string | null;
  registry_status: string | null;
  registry_name: string | null;
};

export type SiteStats = {
  mcp_servers: number;
  agents: number;
  tasks: number;
  capabilities: number;
  active_sources: number;
  mapped_sources: number;
  signals_24h: number;
  last_update: string | null;
};

export type Signal = {
  id: string;
  detected_at: string;
  event_type: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  importance: number;
  entity_type: string;
  entity_slug: string;
  entity_name: string;
  source_name: string | null;
};

export type Task = {
  id: string;
  slug: string;
  name: string;
  category_slug: string | null;
  category: string | null;
  capabilities: { slug: string; name: string }[];
};

export type Capability = { id: string; slug: string; name: string; tasks_count: number; providers_count: number };

export async function getStats(): Promise<SiteStats | null> {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_site_stats").select("*").single();
  return (data as SiteStats) ?? null;
}

export async function getSignals(limit = 20): Promise<Signal[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c.from("v_signals").select("*").order("detected_at", { ascending: false }).limit(limit);
  return (data as Signal[]) ?? [];
}

export async function getTasks(): Promise<Task[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c.from("v_tasks").select("*").order("category").order("name");
  return (data as Task[]) ?? [];
}

export type TaskRanking = {
  task_slug: string; task_name: string; provider_id: string; provider_type: string; provider_slug: string; provider_name: string;
  short_description: string | null; last_seen_at: string; version: string | null; remote: boolean | null; local: boolean | null;
  matched: number; n_req: number; coverage_pct: number; matched_capabilities: string[]; match_confidence: string;
  trust_level: "declared" | "verified" | "proven"; quality_score: number | null;
};

export type ThemeRanking = {
  theme_slug: string; theme: string; provider_id: string; provider_type: string; provider_slug: string; provider_name: string;
  short_description: string | null; version: string | null; remote: boolean | null; local: boolean | null;
  trust_level: "declared" | "verified" | "proven"; quality_score: number | null; last_seen_at: string;
  tasks_fully_covered: number; tasks_touched: number; best_coverage: number; top_tasks: string[];
};

export type Theme = { theme_slug: string; theme: string; tasks: number; providers: number };

export async function getThemes(): Promise<Theme[]> {
  const c = db();
  if (!c) return [];
  const { data } = await c.from("v_theme_overview").select("*").order("theme");
  return (data as Theme[]) ?? [];
}

export const providerHref = (type: string, slug: string) => (type === "agent" ? `/agents/${slug}` : `/mcp/${slug}`);
