import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppsIndexView, appsIndexMeta } from "@/components/views/apps";
type P = Promise<{ lang: string }>;
export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return [{ lang: "fr" }]; }
export function generateMetadata(): Metadata { return appsIndexMeta("fr"); }
export default async function Page({ params }: { params: P }) { if ((await params).lang !== "fr") notFound(); return <AppsIndexView lang="fr" />; }
