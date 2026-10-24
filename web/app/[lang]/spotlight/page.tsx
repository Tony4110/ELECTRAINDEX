import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpotlightView, SPOTLIGHT_META } from "@/components/views/spotlight-page";
import { I18N_ROBOTS, alternatesFor, OG_LOCALE } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...SPOTLIGHT_META.fr, alternates: alternatesFor("/spotlight", "fr"), robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE.fr } };

export default async function FrSpotlight({ params, searchParams }: { params: P; searchParams: Promise<{ product?: string }> }) {
  if ((await params).lang !== "fr") notFound();
  return <SpotlightView searchParams={searchParams} lang="fr" />;
}
