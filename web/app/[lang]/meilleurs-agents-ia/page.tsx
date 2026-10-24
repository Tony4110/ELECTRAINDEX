import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BestAgentsFr, BEST_META } from "@/components/views/fr-guides";
import { robotsFor, OG_LOCALE } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return [{ lang: "fr" }]; }

export function generateMetadata(): Metadata {
  return { title: { absolute: `${BEST_META.title()} · Electra Index` }, description: BEST_META.description, alternates: { canonical: "/fr/meilleurs-agents-ia" }, robots: robotsFor("fr"), openGraph: { locale: OG_LOCALE.fr } };
}

export default async function Page({ params }: { params: P }) {
  if ((await params).lang !== "fr") notFound();
  return <BestAgentsFr />;
}
