import type { Metadata } from "next";
import { PricingView, PRICING_META } from "@/components/views/pricing";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = { ...PRICING_META.en, alternates: alternatesFor("/pricing", "en") };

export default function PricingPage() {
  return <PricingView />;
}
