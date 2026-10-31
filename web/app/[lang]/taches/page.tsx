import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { robotsFor, alternatesFor, OG_LOCALE } from "@/lib/i18n";
import { TasksIndexView } from "@/components/views/tasks-index";

type P = Promise<{ lang: string }>;
export const revalidate = 3600;
export async function generateStaticParams() { return [{ lang: "fr" }]; }
export const dynamicParams = false;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Agents IA par tâche : que voulez-vous faire ?",
    description: "Choisissez une tâche (e-mails, factures, relecture de code, prospection…) et voyez quels agents IA savent vraiment la faire, classés par qualité, avec des prix vérifiés.",
    alternates: alternatesFor("/tasks", "fr"), robots: robotsFor("fr"), openGraph: { locale: OG_LOCALE.fr },
  };
}

export default async function FrTasks({ params }: { params: P }) {
  if ((await params).lang !== "fr") notFound();
  return <TasksIndexView lang="fr" />;
}
