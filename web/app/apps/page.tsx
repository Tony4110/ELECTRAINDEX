import Link from "next/link";
import type { Metadata } from "next";
import { SetupNotice, Empty } from "@/components/ui";
import { AppCards, AppThemePills, appVars } from "@/components/app-list";
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
  const counts = Object.fromEntries(APP_THEMES.map((t) => [t.slug, rows.filter((r) => r.theme === t.slug).length]));
  return (
    <>
      <section className="tb-hero ln-hero">
        <div className="eyebrow">AI apps</div>
        <h1>AI apps for everyday life</h1>
        <div className="ln-hero-row">
          <p className="lede">Coaching, journaling, languages, photos, music, accessibility. For each app: who publishes it, where it runs and what it really costs, checked on its official pages.</p>
          <Link href="/submit" className="btn primary">Submit your app, free →</Link>
        </div>
      </section>
      <AppThemePills counts={counts} />
      {rows.length === 0
        ? <div className="card" style={{ marginTop: 16 }}><div className="card-body"><Empty title="No app yet">Apps appear here once their official pages have been read.</Empty></div></div>
        : APP_THEMES.map((t) => {
            const list = rows.filter((r) => r.theme === t.slug);
            if (!list.length) return null;
            return (
              <section key={t.slug} className="tb-group" style={appVars(t.slug)}>
                <header className="tb-head">
                  <span className="tb-bar" />
                  <div><h2><Link href={`/apps/themes/${t.slug}`} className="ink">{t.name}</Link></h2><p>{t.intro}</p></div>
                  <span className="tb-count">{list.length}</span>
                </header>
                <AppCards rows={list} />
              </section>
            );
          })}
      <p className="note" style={{ marginTop: 32 }}>AI apps are listed apart from AI agents and never enter the agent rankings. Every app shown has an identifiable publisher, a public price (or a free plan) and a privacy policy. Prices are read on the official pricing page or app store listing, with the date.</p>
    </>
  );
}
