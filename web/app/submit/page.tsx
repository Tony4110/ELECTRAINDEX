import type { Metadata } from "next";
import { SubmitView, type SubmitSP } from "@/components/views/submit";
import { alternatesFor } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "List your AI agent",
  description: "Submit your AI agent or tool to Electra Index. Free. A listing never changes a score.",
  alternates: alternatesFor("/submit", "en"),
};

export default async function SubmitPage({ searchParams }: { searchParams: SubmitSP }) {
  return <SubmitView searchParams={searchParams} lang="en" />;
}
