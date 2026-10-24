import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { taskMetaDescription } from "@/lib/taskcopy";
import { TaskView, loadTask, taskTitle, type TaskSP } from "@/components/views/task";
import { alternatesFor } from "@/lib/i18n";

type P = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const t = await loadTask((await params).slug);
  return t ? { title: taskTitle(t, "en"), description: taskMetaDescription(t.name, t.capabilities), alternates: alternatesFor(`/tasks/${t.slug}`, "en") } : { title: "Not found" };
}

export default async function TaskPage({ params, searchParams }: { params: P; searchParams: TaskSP }) {
  const t = await loadTask((await params).slug);
  if (!t) notFound();
  return <TaskView t={t} searchParams={searchParams} />;
}
