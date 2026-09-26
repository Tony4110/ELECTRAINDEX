import Link from "next/link";
import type { Metadata } from "next";
import { getTasks, db } from "@/lib/db";
import { SetupNotice } from "@/components/ui";

export const metadata: Metadata = { title: "Tasks", description: "What do you need done? 100 tasks mapped to the capabilities an AI agent needs." };

export default async function Tasks() {
  if (!db()) return <SetupNotice />;
  const tasks = await getTasks();
  const groups = new Map<string, typeof tasks>();
  tasks.forEach((t) => { const k = t.category ?? "Other"; groups.set(k, [...(groups.get(k) ?? []), t]); });

  return (
    <>
      <div className="eyebrow">Tasks</div>
      <h1>What do you need done?</h1>
      <p className="lede">{tasks.length} tasks, each mapped to the capabilities an agent needs to do it. Pick one to see which agents cover it.</p>
      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 12 }}>{cat} <span className="muted small mono">· {list.length}</span></h2>
          <div className="tiles">
            {list.map((t) => (
              <Link key={t.slug} href={`/tasks/${t.slug}`} className="tile">
                <span className="name">{t.name}</span>
                <span className="small muted">{t.capabilities.map((c) => c.name).join(" · ")}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
