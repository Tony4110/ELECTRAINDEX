import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppThemeView, appThemeMeta } from "@/components/views/apps";
import { APP_THEMES } from "@/lib/apps";
type P = Promise<{ lang: string; theme: string }>;
export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return APP_THEMES.map((t) => ({ lang: "fr", theme: t.slug })); }
export async function generateMetadata({ params }: { params: P }): Promise<Metadata> { return appThemeMeta((await params).theme, "fr"); }
export default async function Page({ params }: { params: P }) { const p = await params; if (p.lang !== "fr") notFound(); return <AppThemeView slug={p.theme} lang="fr" />; }
