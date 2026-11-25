import { loadIndex } from "@/lib/reliability-index";

export const revalidate = 3600;

/** Electra MCP Reliability Index, one row per UTC day. CC BY 4.0: credit "Electra Index" with a link to https://electraindex.com/mcp-reliability-index */
export async function GET() {
  const rows = (await loadIndex(5000)).slice().reverse();
  const cols = ["day", "daily_global_success_rate_pct", "daily_server_reliability_average_pct", "daily_conclusive_checks", "daily_answers", "daily_failures", "daily_servers",
    "stability_7d_global_success_rate_pct", "stability_7d_server_reliability_average_pct", "stability_7d_conclusive_checks", "stability_7d_servers",
    "daily_inconclusive_not_counted", "insufficient_sample", "backfilled", "computed_at_utc", "method_version"];
  const lines = rows.map((r) => [r.day, r.d_global ?? "", r.d_server_avg ?? "", r.d_checks, r.d_answers, r.d_failures, r.d_servers,
    r.w_global ?? "", r.w_server_avg ?? "", r.w_checks, r.w_servers, r.excluded, r.insufficient, r.backfilled, r.computed_at, r.method_version].join(","));
  const head = "# Electra MCP Reliability Index · source: Electra Index (https://electraindex.com/mcp-reliability-index) · CC BY 4.0 · observations of Electra Index, not a guarantee of future availability";
  return new Response([head, cols.join(","), ...lines].join("\n") + "\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'inline; filename="reliability-index-daily.csv"', "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
