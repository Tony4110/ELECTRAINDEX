import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppPageView, appPageMeta } from "@/components/views/apps";
type P = Promise<{ lang: string; slug: string }>;
export const revalidate = 3600;
export async function generateMetadata({ params }: { params: P }): Promise<Metadata> { const p = await params; return p.lang === "fr" ? appPageMeta(p.slug, "fr") : {}; }
export default async function Page({ params }: { params: P }) { const p = await params; if (p.lang !== "fr") notFound(); return <AppPageView slug={p.slug} lang="fr" />; }
