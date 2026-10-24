import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTasks, db } from "@/lib/db";
import { SetupNotice } from "@/components/ui";
import { I18N_ROBOTS, alternatesFor, lhref, OG_LOCALE, themeName } from "@/lib/i18n";
import { capName } from "@/lib/i18n-agent";
import { TASKS_FR } from "@/lib/i18n-paths";

type P = Promise<{ lang: string }>;
export const revalidate = 3600;
export async function generateStaticParams() { return [{ lang: "fr" }]; }
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Tâches", description: "De quoi avez-vous besoin ? 100 tâches reliées aux fonctionnalités dont un agent IA a besoin.", alternates: alternatesFor("/tasks", "fr"), robots: I18N_ROBOTS, openGraph: { locale: OG_LOCALE.fr } };
}

export default async function FrTasks({ params }: { params: P }) {
  if ((await params).lang !== "fr") notFound();
  if (!db()) return <SetupNotice />;
  const tasks = (await getTasks()).filter((t) => TASKS_FR[t.slug]);
  const groups = new Map<string, typeof tasks>();
  tasks.forEach((t) => { const k = t.category_slug ? themeName("fr", t.category_slug, t.category ?? "") : t.category ?? "Autres"; groups.set(k, [...(groups.get(k) ?? []), t]); });
  return (
    <>
      <div className="eyebrow">Tâches</div>
      <h1>De quoi avez-vous besoin ?</h1>
      <p className="lede">{tasks.length} tâches, chacune reliée aux fonctionnalités dont un agent a besoin pour la réaliser. Choisissez-en une pour voir quels agents la couvrent.</p>
      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 12 }}>{cat} <span className="muted small mono">· {list.length}</span></h2>
          <div className="tiles">
            {list.sort((a, b) => TASKS_FR[a.slug][1].localeCompare(TASKS_FR[b.slug][1], "fr")).map((t) => (
              <Link key={t.slug} href={lhref("fr", `/tasks/${t.slug}`)} className="tile">
                <span className="name">{TASKS_FR[t.slug][1]}</span>
                <span className="small muted">{t.capabilities.map((c) => capName("fr", c.slug, c.name)).join(" · ")}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
