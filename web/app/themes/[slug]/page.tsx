import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ThemeView, loadTheme, themeTitle, type ThemeSP } from "@/components/views/theme";
import { alternatesFor } from "@/lib/i18n";

type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const t = await loadTheme((await params).slug);
  return t ? { title: themeTitle(t, "en"), description: `${t.theme}: AI agents and tools ranked by how many ${t.theme.toLowerCase()} tasks they cover, from sourced data.`, alternates: alternatesFor(`/themes/${t.theme_slug}`, "en") } : { title: "Not found" };
}

export default async function ThemePage({ params, searchParams }: { params: P; searchParams: ThemeSP }) {
  const t = await loadTheme((await params).slug);
  if (!t) notFound();
  return <ThemeView t={t} searchParams={searchParams} />;
}
