import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomeDashboard } from "@/components/views/home-dashboard";
import { type HomeSP } from "@/components/views/home";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = {
  title: { absolute: "Electra Index — MCP servers, AI agents and agent payments, tested live" },
  description: "The trust layer for the agent economy: 59,000 MCP servers and 21,000 x402 paid services tested live, 450 AI agents compared on price and quality. Every fact sourced and dated.",
  alternates: alternatesFor("/", "en"),
};

export default async function Home({ searchParams }: { searchParams: HomeSP }) {
  // the agent ranking moved to /agents; keep old links working
  const sp = await searchParams;
  if (sp.theme) redirect(`/themes/${encodeURIComponent(sp.theme)}`);
  if (sp.sort) redirect(`/agents?sort=${encodeURIComponent(sp.sort)}`);
  return <HomeDashboard />;
}
