import { db } from "@/lib/db";

export type IndexDay = {
  day: string; computed_at: string; backfilled: boolean;
  d_checks: number; d_answers: number; d_failures: number; d_servers: number; d_global: number | null; d_server_avg: number | null;
  w_checks: number; w_answers: number; w_failures: number; w_servers: number; w_global: number | null; w_server_avg: number | null;
  excluded: number; insufficient: boolean; method_version: string;
};

/** Published days of the Electra MCP Reliability Index, newest first. Empty if not installed yet. */
export async function loadIndex(limit = 400): Promise<IndexDay[]> {
  const c = db();
  if (!c) return [];
  try {
    const { data, error } = await c.from("reliability_index_daily").select("*").order("day", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return (data as IndexDay[]).map((d) => ({ ...d, d_global: d.d_global == null ? null : Number(d.d_global), d_server_avg: d.d_server_avg == null ? null : Number(d.d_server_avg),
      w_global: d.w_global == null ? null : Number(d.w_global), w_server_avg: d.w_server_avg == null ? null : Number(d.w_server_avg) }));
  } catch { return []; }
}
