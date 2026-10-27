import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AgentView, agentMeta, loadAgent } from "@/components/views/agent";
import { alternatesFor } from "@/lib/i18n";
import { agentT } from "@/lib/i18n-agent";

type P = Promise<{ slug: string }>;

// rendered on first visit, then cached and refreshed hourly
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const a = await loadAgent((await params).slug);
  const t = agentT("en");
  return a ? { ...agentMeta(a, "en"), alternates: alternatesFor(`/agents/${a.slug}`, "en") } : { title: "Not found" };
}

export default async function AgentPage({ params }: { params: P }) {
  const a = await loadAgent((await params).slug);
  if (!a) notFound();
  return <AgentView a={a} />;
}
