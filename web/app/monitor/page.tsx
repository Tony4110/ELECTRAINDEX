import type { Metadata } from "next";
import { MonitorView, MONITOR_META } from "@/components/views/monitor-page";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = { ...MONITOR_META.en, alternates: alternatesFor("/monitor", "en") };
export const dynamic = "force-dynamic";

export default function MonitorPage({ searchParams }: { searchParams: Promise<{ server?: string }> }) {
  return <MonitorView searchParams={searchParams} />;
}
