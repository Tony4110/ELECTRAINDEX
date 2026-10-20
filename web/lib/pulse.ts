import { db } from "@/lib/db";

export type PulseItem = { slug: string; name: string; description?: string | null; remote?: boolean | null; live?: string | null; tools?: number | null; more?: boolean; last_online_at?: string | null };
export type PulsePrice = { slug: string; name: string; event: string; field: string | null; old: unknown; new: unknown; at: string };
export type PulseData = {
  week: string; from: string; to: string; collected_at: string;
  totals: { servers_listed: number; new_servers: number; new_hosted: number; new_versions: number; agents_listed: number; new_agents: number; price_changes: number };
  live: { tested: number; online: number; auth_required: number; down: number; stopped_answering: PulseItem[]; back_online: PulseItem[]; most_tools: PulseItem[] };
  new_servers: PulseItem[]; prices: PulsePrice[]; new_agents: PulseItem[];
  use_cases: { slug: string; name: string; new_servers: number }[];
};
export type PulseEdition = { week: string; week_start: string; data: PulseData; built_at: string };

export async function getEditions(): Promise<{ week: string; week_start: string }[]> {
  const c = db();
  if (!c) return [];
  const { data, error } = await c.from("v_pulse_editions").select("week,week_start").order("week_start", { ascending: false }).limit(60);
  return error ? [] : ((data as { week: string; week_start: string }[] | null) ?? []);
}

export async function getEdition(week?: string): Promise<PulseEdition | null> {
  const c = db();
  if (!c) return null;
  let q = c.from("v_pulse_editions").select("*");
  q = week ? q.eq("week", week) : q.order("week_start", { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  return error ? null : ((data as PulseEdition | null) ?? null);
}

/** "2026-W42" -> "Week 42, 2026" */
export function weekLabel(week: string) {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  return m ? `Week ${Number(m[2])}, ${m[1]}` : week;
}
export function rangeLabel(from: string, to: string) {
  const f = new Date(from + "T00:00:00Z"), t = new Date(to + "T00:00:00Z");
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  return `${f.toLocaleDateString("en-GB", o)} – ${t.toLocaleDateString("en-GB", { ...o, year: "numeric" })}`;
}
