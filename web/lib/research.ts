/**
 * Electra Research — frozen, citable snapshots. Numbers come from REPORT_DATA_STORY.sql run on the date below;
 * they are never recomputed on the fly, so a journalist quoting them always finds the same figures.
 */
export const MCP_NOV_2026 = {
  slug: "state-of-mcp-november-2026",
  title: "The State of MCP — November 2026",
  date: "2026-11-11",
  dateLabel: "11 November 2026",
  servers: 53954,
  remote: 36861,
  tested: 35576,
  onlineTools: 20999,
  onlineNoTools: 148,
  auth: 11252,
  noAnswer: 3177,
  tools: 350980,
  medianTools: 7,
  agents: 303,
  agentsPaidPrice: 148,
  agentsFree: 128,
  medianEntryUsd: 25,
  apps: 49,
  tasks: 100,
  csv: "/research/state-of-mcp-2026-11.csv",
};

export const pct = (a: number, b: number) => `${(Math.round((a / b) * 1000) / 10).toLocaleString("en-US")}%`;
export const n = (x: number) => x.toLocaleString("en-US");
