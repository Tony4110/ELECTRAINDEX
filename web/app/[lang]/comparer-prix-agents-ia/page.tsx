import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComparePricesFr, PRICES_META } from "@/components/views/fr-guides";
import { I18N_ROBOTS, OG_LOCALE } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return [{ lang: "fr" }]; }

export function generateMetadata(): Metadata {
  return { title: { absolute: `${PRICES_META.title()} · Electra Index` }, description: PRICES_META.description, alternates: { canonical: "/fr/comparer-prix-agents-ia" }, robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE.fr } };
}

export default async function Page({ params }: { params: P }) {
  if ((await params).lang !== "fr") notFound();
  return <ComparePricesFr />;
}
