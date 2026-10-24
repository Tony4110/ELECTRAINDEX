import type { Metadata } from "next";
import { SpotlightView, SPOTLIGHT_META } from "@/components/views/spotlight-page";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = { ...SPOTLIGHT_META.en, alternates: alternatesFor("/spotlight", "en") };
export const dynamic = "force-dynamic";

export default function SpotlightPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  return <SpotlightView searchParams={searchParams} />;
}
