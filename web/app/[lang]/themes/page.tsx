import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, getThemes } from "@/lib/db";
import { num } from "@/lib/format";
import { SetupNotice } from "@/components/ui";
import { I18N_ROBOTS, alternatesFor, lhref, OG_LOCALE, themeName } from "@/lib/i18n";

type P = Promise<{ lang: string }>;
export const revalidate = 3600;
export async function generateStaticParams() { return [{ lang: "fr" }]; }
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Thèmes", description: "Les agents IA classés par thème : ventes, marketing, développement, finance, données et plus.", alternates: alternatesFor("/themes", "fr"), robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE.fr } };
}

export default async function FrThemes({ params }: { params: P }) {
  if ((await params).lang !== "fr") notFound();
  if (!db()) return <SetupNotice />;
  const themes = (await getThemes()).map((t) => ({ ...t, fr: themeName("fr", t.theme_slug, t.theme) })).sort((a, b) => a.fr.localeCompare(b.fr, "fr"));
  return (
    <>
      <div className="eyebrow">Thèmes</div>
      <h1>Classements par thème</h1>
      <p className="lede">Dix thèmes, chacun classé selon les tâches qu&apos;il contient. Choisissez-en un pour voir les agents qui en couvrent le plus.</p>
      <div className="themes" style={{ marginTop: 24 }}>
        {themes.map((t) => (
          <Link key={t.theme_slug} href={lhref("fr", `/themes/${t.theme_slug}`)} className="theme">
            <span className="name">{t.fr}</span>
            <span className="small muted">{num(t.providers)} agents et outils · {t.tasks} tâches</span>
          </Link>
        ))}
      </div>
    </>
  );
}
