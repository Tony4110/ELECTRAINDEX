import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AlternativesView, alternativesMeta, buildAlternatives } from "@/components/views/alternatives";
import { alternatesFor } from "@/lib/i18n";

export const revalidate = 3600;
export async function generateStaticParams() { return []; }
type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const r = await buildAlternatives((await params).slug);
  return r ? { ...alternativesMeta(r), alternates: alternatesFor(`/agents/${r.agent.slug}/alternatives`, "en") } : { title: "Not found" };
}

export default async function Alternatives({ params }: { params: P }) {
  const r = await buildAlternatives((await params).slug);
  if (!r) notFound();
  return <AlternativesView r={r} />;
}
