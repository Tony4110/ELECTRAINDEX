import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEdition, getEditions, weekLabel, rangeLabel } from "@/lib/pulse";
import { PulseView } from "@/components/pulse";
import { SetupNotice, Empty } from "@/components/ui";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const e = await getEdition();
  const sub = e ? `${weekLabel(e.week)} (${rangeLabel(e.data.from, e.data.to)})` : "weekly";
  return {
    title: "MCP & Agent Pulse — this week in the agent economy",
    description: e ? `${sub}: ${e.data.totals.new_servers} new MCP servers, live check results, agent price changes and new AI agents. Counted from the Electra Index database.` : "Weekly edition: new MCP servers, live check results, price changes and new AI agents.",
    alternates: { canonical: "/pulse" },
  };
}

export default async function PulsePage() {
  if (!db()) return <SetupNotice />;
  const [e, editions] = await Promise.all([getEdition(), getEditions()]);
  if (!e) return <><h1>MCP &amp; Agent Pulse</h1><Empty title="First edition coming Monday">The weekly edition is built every Monday from the Electra Index database.</Empty></>;
  if (!e.data) notFound();
  return <PulseView e={e} editions={editions} />;
}
