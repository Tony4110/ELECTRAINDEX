import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeView, type HomeSP } from "@/components/views/home";
import { robotsFor, alternatesFor, dict, isLang, OG_LOCALE, OTHER_LANGS } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const dynamicParams = false;
export function generateStaticParams() { return OTHER_LANGS.map((lang) => ({ lang })); }

export async function generateMetadata({ params, searchParams }: { params: P; searchParams: HomeSP }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang) || lang === "en") return {};
  const t = dict(lang).home;
  const sp = await searchParams;
  return {
    title: { absolute: t.metaTitle }, description: t.metaDesc,
    alternates: sp.theme || sp.sort ? { canonical: `/${lang}` } : alternatesFor("/", lang),
    robots: robotsFor(lang), openGraph: { locale: OG_LOCALE[lang], title: t.metaTitle, description: t.metaDesc },
  };
}

export default async function LocalizedHome({ params, searchParams }: { params: P; searchParams: HomeSP }) {
  const { lang } = await params;
  if (!isLang(lang) || lang === "en") notFound();
  return <HomeView searchParams={searchParams} lang={lang} />;
}
