import Link from "next/link";
import type { Metadata } from "next";
import { SetupNotice, Empty } from "@/components/ui";
import { AppTable } from "@/components/app-list";
import { APP_THEMES, loadApps } from "@/lib/apps";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "AI apps 2026: coaching, learning, creativity & more, with prices",
  description: "Consumer AI apps for coaching, journaling, languages, photos, music and accessibility. Publisher, platforms and prices read on each official page.",
  alternates: { canonical: "/apps" },
};

export default async function AppsPage() {
  const rows = await loadApps();
  if (rows === null) return <SetupNotice />;
  return (
    <>
      <div className="eyebrow">Index · AI apps</div>
      <h1>AI apps, with publisher and prices</h1>
      <p className="lede">{rows.length} AI apps for everyday life: coaching, journaling, languages, photos, music, accessibility. For each one we show who publishes it, where it runs and what it costs, read on its official pages. Looking for AI agents that do a job for you? See <Link href="/">AI agents</Link>.</p>
      <div className="filters">
        {APP_THEMES.map((t) => <Link key={t.slug} href={`/apps/themes/${t.slug}`} className="chip">{t.name} ({rows.filter((r) => r.theme === t.slug).length})</Link>)}
      </div>
      {rows.length === 0
        ? <div className="card"><div className="card-body"><Empty title="No app yet">Apps appear here once their official pages have been read.</Empty></div></div>
        : APP_THEMES.map((t) => {
            const list = rows.filter((r) => r.theme === t.slug);
            if (!list.length) return null;
            return (
              <section key={t.slug} style={{ marginTop: 28 }}>
                <h2><Link href={`/apps/themes/${t.slug}`}>{t.name}</Link></h2>
                <div className="card table-wrap"><AppTable rows={list} showTheme={false} /></div>
              </section>
            );
          })}
      <p className="note">AI apps are listed apart from AI agents and never enter the agent rankings. Every app shown has an identifiable publisher, a public price (or a free plan) and a privacy policy. Prices are read on the official pricing page or app store listing, with the date. Publishers can <Link href="/submit">submit their app</Link>.</p>
    </>
  );
}
