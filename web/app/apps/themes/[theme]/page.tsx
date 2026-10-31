import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupNotice, Empty } from "@/components/ui";
import { AppCards, AppThemePills, appVars } from "@/components/app-list";
import { APP_THEMES, appTheme, loadApps } from "@/lib/apps";

export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return APP_THEMES.map((t) => ({ theme: t.slug })); }
type P = Promise<{ theme: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const t = appTheme((await params).theme);
  if (!t) return {};
  return { title: `${t.title} 2026: compared with prices`, description: `${t.intro} Publisher, platforms and prices read on each official page.`, alternates: { canonical: `/apps/themes/${t.slug}` } };
}

export default async function AppTheme({ params }: { params: P }) {
  const t = appTheme((await params).theme);
  if (!t) notFound();
  const rows = await loadApps(t.slug);
  if (rows === null) return <SetupNotice />;
  const all = (await loadApps()) ?? [];
  const counts = Object.fromEntries(APP_THEMES.map((x) => [x.slug, all.filter((r) => r.theme === x.slug).length]));
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/apps">AI apps</Link><span>/</span><span className="ink">{t.name}</span></nav>
      <section className="tb-hero ln-hero tk-hero" style={appVars(t.slug)}>
        <div className="eyebrow">AI apps · {t.name}</div>
        <h1>{t.title}</h1>
        <div className="ln-hero-row">
          <p className="lede">{t.intro} {rows.length ? `${rows.length} apps, with publisher, platforms and prices read on their official pages.` : ""}</p>
          <Link href="/submit" className="btn primary">Submit your app, free →</Link>
        </div>
      </section>
      <AppThemePills current={t.slug} counts={counts} />
      {rows.length === 0 ? <div className="card" style={{ marginTop: 16 }}><div className="card-body"><Empty title="No app yet">Apps appear here once their official pages have been read.</Empty></div></div>
        : <div style={{ marginTop: 18 }}><AppCards rows={rows} /></div>}
      <p className="note" style={{ marginTop: 28 }}>Listed alphabetically: AI apps are not scored or ranked. Every app shown has an identifiable publisher, a public price (or a free plan) and a privacy policy.</p>
    </>
  );
}
