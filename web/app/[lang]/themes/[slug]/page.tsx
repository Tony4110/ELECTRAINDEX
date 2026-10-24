import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ThemeView, loadTheme, themeTitle, type ThemeSP } from "@/components/views/theme";
import { I18N_ROBOTS, alternatesFor, OG_LOCALE, themeName } from "@/lib/i18n";
import { frThemeToEn } from "@/lib/i18n-paths";

type P = Promise<{ lang: string; slug: string }>;

async function load(lang: string, slug: string) {
  if (lang !== "fr") return null;
  const en = frThemeToEn(slug);
  return en ? loadTheme(en) : null;
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { lang, slug } = await params;
  const t = await load(lang, slug);
  if (!t) return {};
  const n = themeName("fr", t.theme_slug, t.theme);
  return {
    title: themeTitle(t, "fr"), description: `${n} : les agents IA classés par qualité, prix vérifiés et rapport qualité-prix, à partir de données sourcées.`,
    alternates: alternatesFor(`/themes/${t.theme_slug}`, "fr"), robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE.fr },
  };
}

export default async function FrThemePage({ params, searchParams }: { params: P; searchParams: ThemeSP }) {
  const { lang, slug } = await params;
  const t = await load(lang, slug);
  if (!t) notFound();
  return <ThemeView t={t} searchParams={searchParams} lang="fr" />;
}
