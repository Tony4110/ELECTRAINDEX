import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MonitorView, MONITOR_META } from "@/components/views/monitor-page";
import { robotsFor, alternatesFor, OG_LOCALE } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...MONITOR_META.fr, alternates: alternatesFor("/monitor", "fr"), robots: robotsFor("fr"), openGraph: { locale: OG_LOCALE.fr } };

export default async function FrMonitor({ params, searchParams }: { params: P; searchParams: Promise<{ server?: string }> }) {
  if ((await params).lang !== "fr") notFound();
  return <MonitorView searchParams={searchParams} lang="fr" />;
}
