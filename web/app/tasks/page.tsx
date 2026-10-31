import type { Metadata } from "next";
import { alternatesFor } from "@/lib/i18n";
import { TasksIndexView } from "@/components/views/tasks-index";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "AI agents by task: what do you want done?",
  description: "Pick a job (emails, invoices, code review, lead generation…) and see which AI agents can really do it, ranked by quality, with verified prices.",
  alternates: alternatesFor("/tasks", "en"),
};

export default function Tasks() {
  return <TasksIndexView lang="en" />;
}
