import type { Metadata } from "next";
import { HomeView, type HomeSP } from "@/components/views/home";
import { alternatesFor } from "@/lib/i18n";

export async function generateMetadata({ searchParams }: { searchParams: HomeSP }): Promise<Metadata> {
  const sp = await searchParams;
  return sp.theme || sp.sort ? { alternates: { canonical: sp.theme ? `/themes/${sp.theme}` : "/" } } : { alternates: alternatesFor("/", "en") };
}

export default async function Home({ searchParams }: { searchParams: HomeSP }) {
  return <HomeView searchParams={searchParams} lang="en" />;
}
