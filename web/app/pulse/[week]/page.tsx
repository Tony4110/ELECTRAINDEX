import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEdition, getEditions, weekLabel, rangeLabel } from "@/lib/pulse";
import { PulseView } from "@/components/pulse";
import { SetupNotice } from "@/components/ui";
import { db } from "@/lib/db";

type P = Promise<{ week: string }>;
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { week } = await params;
  const e = await getEdition(week);
  if (!e) return { title: "Not found" };
  return {
    title: `MCP & Agent Pulse, ${weekLabel(e.week)}`,
    description: `${rangeLabel(e.data.from, e.data.to)}: ${e.data.totals.new_servers} new MCP servers, ${e.data.totals.new_agents} new AI agents, ${e.data.totals.price_changes} price changes, live check results.`,
    alternates: { canonical: `/pulse/${e.week}` },
  };
}

export default async function PulseWeekPage({ params }: { params: P }) {
  if (!db()) return <SetupNotice />;
  const { week } = await params;
  if (!/^\d{4}-W\d{2}$/.test(week)) notFound();
  const [e, editions] = await Promise.all([getEdition(week), getEditions()]);
  if (!e) notFound();
  return <PulseView e={e} editions={editions} />;
}
