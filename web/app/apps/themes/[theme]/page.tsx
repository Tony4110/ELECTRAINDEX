import type { Metadata } from "next";
import { AppThemeView, appThemeMeta } from "@/components/views/apps";
import { APP_THEMES } from "@/lib/apps";
export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return APP_THEMES.map((t) => ({ theme: t.slug })); }
type P = Promise<{ theme: string }>;
export async function generateMetadata({ params }: { params: P }): Promise<Metadata> { return appThemeMeta((await params).theme, "en"); }
export default async function Page({ params }: { params: P }) { return <AppThemeView slug={(await params).theme} lang="en" />; }
