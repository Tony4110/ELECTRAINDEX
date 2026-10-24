import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { taskMetaDescriptionFr } from "@/lib/taskcopy";
import { TaskView, loadTask, taskTitle, type TaskSP } from "@/components/views/task";
import { robotsFor, alternatesFor, OG_LOCALE } from "@/lib/i18n";
import { frTaskToEn } from "@/lib/i18n-paths";
import { capName } from "@/lib/i18n-agent";

type P = Promise<{ lang: string; slug: string }>;

async function load(lang: string, slug: string) {
  if (lang !== "fr") return null;
  const en = frTaskToEn(slug);
  return en ? loadTask(en) : null;
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { lang, slug } = await params;
  const t = await load(lang, slug);
  if (!t) return {};
  return {
    title: taskTitle(t, "fr"), description: taskMetaDescriptionFr(taskTitle(t, "fr").replace(/^Meilleurs agents IA pour /, ""), t.capabilities.map((x) => capName("fr", x.slug, x.name))),
    alternates: alternatesFor(`/tasks/${t.slug}`, "fr"), robots: robotsFor("fr"), openGraph: { locale: OG_LOCALE.fr },
  };
}

export default async function FrTaskPage({ params, searchParams }: { params: P; searchParams: TaskSP }) {
  const { lang, slug } = await params;
  const t = await load(lang, slug);
  if (!t) notFound();
  return <TaskView t={t} searchParams={searchParams} lang="fr" />;
}
