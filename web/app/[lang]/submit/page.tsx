import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubmitView, type SubmitSP } from "@/components/views/submit";
import { I18N_ROBOTS, alternatesFor, dict, isLang, OG_LOCALE, OTHER_LANGS } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const dynamicParams = false;
export function generateStaticParams() { return OTHER_LANGS.map((lang) => ({ lang })); }

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang) || lang === "en") return {};
  const t = dict(lang).submit;
  return { title: t.metaTitle, description: t.metaDesc, alternates: alternatesFor("/submit", lang), robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE[lang] } };
}

export default async function LocalizedSubmit({ params, searchParams }: { params: P; searchParams: SubmitSP }) {
  const { lang } = await params;
  if (!isLang(lang) || lang === "en") notFound();
  return <SubmitView searchParams={searchParams} lang={lang} />;
}
