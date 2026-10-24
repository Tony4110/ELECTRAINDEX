import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AlternativesView, alternativesMeta, buildAlternatives } from "@/components/views/alternatives";
import { loadAgentText } from "@/components/views/agent";
import { robotsFor, alternatesFor, isLang, isLocalized, OG_LOCALE } from "@/lib/i18n";

export const revalidate = 3600;
export async function generateStaticParams() { return []; }
type P = Promise<{ lang: string; slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang) || lang === "en" || !(await loadAgentText(slug, lang))) return {};
  const r = await buildAlternatives(slug, lang);
  if (!r) return {};
  const m = alternativesMeta(r, lang);
  return { ...m, alternates: alternatesFor(`/agents/${slug}/alternatives`, lang), robots: robotsFor(lang) ?? m.robots, openGraph: { locale: OG_LOCALE[lang] } };
}

export default async function LocalizedAlternatives({ params }: { params: P }) {
  const { lang, slug } = await params;
  if (!isLang(lang) || lang === "en" || !/^[a-z0-9-]{1,200}$/.test(slug)) notFound();
  if (!isLocalized(lang, `/agents/${slug}/alternatives`) || !(await loadAgentText(slug, lang))) redirect(`/agents/${slug}/alternatives`);
  const r = await buildAlternatives(slug, lang);
  if (!r) notFound();
  return <AlternativesView r={r} lang={lang} />;
}
