import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SetupNotice, Empty } from "@/components/ui";
import { AppTable } from "@/components/app-list";
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
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/apps">AI apps</Link><span>/</span><span className="ink">{t.name}</span></nav>
      <div className="eyebrow">AI apps · {t.name}</div>
      <h1>{t.title}</h1>
      <p className="lede">{t.intro} {rows.length ? `${rows.length} apps, with publisher, platforms and prices read on their official pages.` : ""}</p>
      <div className="filters">
        {APP_THEMES.map((x) => <Link key={x.slug} href={`/apps/themes/${x.slug}`} className={`chip ${x.slug === t.slug ? "on" : ""}`}>{x.name}</Link>)}
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? <div className="card-body"><Empty title="No app yet">Apps appear here once their official pages have been read.</Empty></div> : <AppTable rows={rows} showTheme={false} />}
      </div>
      <p className="note">Listed alphabetically: AI apps are not scored or ranked. Every app shown has an identifiable publisher, a public price (or a free plan) and a privacy policy.</p>
    </>
  );
}
