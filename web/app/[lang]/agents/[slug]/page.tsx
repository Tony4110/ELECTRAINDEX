import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AgentView, loadAgent, loadAgentText } from "@/components/views/agent";
import { I18N_ROBOTS, alternatesFor, isLang, isLocalized, OG_LOCALE } from "@/lib/i18n";
import { agentT } from "@/lib/i18n-agent";

type P = Promise<{ lang: string; slug: string }>;

export const revalidate = 3600;
export async function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLang(lang) || lang === "en") return {};
  const [a, text] = await Promise.all([loadAgent(slug), loadAgentText(slug, lang)]);
  if (!a || !text) return {};
  const t = agentT(lang);
  return { title: t.metaTitle(a.name), description: text, alternates: alternatesFor(`/agents/${a.slug}`, lang), robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE[lang] } };
}

/** An agent page exists in a language only when it is fully translated; otherwise the English page is served. */
export default async function LocalizedAgentPage({ params }: { params: P }) {
  const { lang, slug } = await params;
  if (!isLang(lang) || lang === "en") notFound();
  if (!/^[a-z0-9-]{1,200}$/.test(slug)) notFound();
  if (!isLocalized(lang, `/agents/${slug}`)) redirect(`/agents/${slug}`);
  const [a, text] = await Promise.all([loadAgent(slug), loadAgentText(slug, lang)]);
  if (!a) notFound();
  if (!text) redirect(`/agents/${slug}`);
  return <AgentView a={a} lang={lang} text={text} />;
}
