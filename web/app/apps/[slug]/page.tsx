import type { Metadata } from "next";
import { AppPageView, appPageMeta } from "@/components/views/apps";
export const revalidate = 3600;
type P = Promise<{ slug: string }>;
export async function generateMetadata({ params }: { params: P }): Promise<Metadata> { return appPageMeta((await params).slug, "en"); }
export default async function Page({ params }: { params: P }) { return <AppPageView slug={(await params).slug} lang="en" />; }
