import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PricingView, PRICING_META } from "@/components/views/pricing";
import { I18N_ROBOTS, alternatesFor, OG_LOCALE } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const dynamicParams = false;
export function generateStaticParams() { return [{ lang: "fr" }]; }
export const metadata: Metadata = { ...PRICING_META.fr, alternates: alternatesFor("/pricing", "fr"), robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE.fr } };

export default async function FrPricing({ params }: { params: P }) {
  if ((await params).lang !== "fr") notFound();
  return <PricingView lang="fr" />;
}
