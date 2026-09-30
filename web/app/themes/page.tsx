import Link from "next/link";
import type { Metadata } from "next";
import { db, getThemes } from "@/lib/db";
import { num } from "@/lib/format";
import { SetupNotice } from "@/components/ui";

export const metadata: Metadata = { title: "Themes", description: "AI agents and tools ranked by theme: sales, marketing, coding, finance, data and more." };

export default async function Themes() {
  if (!db()) return <SetupNotice />;
  const themes = await getThemes();
  return (
    <>
      <div className="eyebrow">Themes</div>
      <h1>Rankings by theme</h1>
      <p className="lede">Ten themes, each ranked on the tasks it contains. Pick one to see the agents and tools that cover the most.</p>
      <div className="themes" style={{ marginTop: 24 }}>
        {themes.map((t) => (
          <Link key={t.theme_slug} href={`/themes/${t.theme_slug}`} className="theme">
            <span className="name">{t.theme}</span>
            <span className="small muted">{num(t.providers)} agents &amp; tools · {t.tasks} tasks</span>
          </Link>
        ))}
      </div>
    </>
  );
}
