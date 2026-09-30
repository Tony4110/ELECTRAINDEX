import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, getTasks, type ThemeRanking, type Theme } from "@/lib/db";
import { num, timeAgo } from "@/lib/format";
import { Tri, SetupNotice, Empty } from "@/components/ui";
import { Trust, ProviderCell } from "@/components/rank";

type P = Promise<{ slug: string }>;
type SP = Promise<{ page?: string }>;
const PAGE = 50;

async function theme(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_theme_overview").select("*").eq("theme_slug", slug).maybeSingle();
  return data as Theme | null;
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const t = await theme((await params).slug);
  return t ? { title: `Best AI agents & tools for ${t.theme}`, description: `${t.theme}: AI agents and tools ranked by how many ${t.theme.toLowerCase()} tasks they cover, from sourced data.` } : { title: "Not found" };
}

export default async function ThemePage({ params, searchParams }: { params: P; searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const slug = (await params).slug;
  const t = await theme(slug);
  if (!t) notFound();
  const page = Math.max(1, parseInt((await searchParams).page ?? "1", 10) || 1);
  const [{ data, count }, tasks] = await Promise.all([
    c.from("v_theme_rankings").select("*", { count: "exact" }).eq("theme_slug", slug)
      .order("coverage_score", { ascending: false }).order("tasks_fully_covered", { ascending: false }).order("last_seen_at", { ascending: false })
      .range((page - 1) * PAGE, page * PAGE - 1),
    getTasks(),
  ]);
  const rows = (data as ThemeRanking[] | null) ?? [];
  const themeTasks = tasks.filter((x) => x.category_slug === slug);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/themes">Themes</Link><span>/</span><span className="ink">{t.theme}</span></nav>
      <div className="eyebrow">Ranking · {t.theme}</div>
      <h1>Best AI agents &amp; tools for {t.theme}</h1>
      <p className="lede">{num(count)} agents and tools cover at least one of the {t.tasks} {t.theme.toLowerCase()} tasks. Ranked by coverage score: how much of the theme&apos;s tasks each one covers, summed across all tasks.</p>
      <div className="chips">
        <span className="small muted">Tasks in this theme:</span>
        {themeTasks.map((x) => <Link key={x.slug} href={`/tasks/${x.slug}`} className="chip">{x.name}</Link>)}
      </div>

      <div className="card table-wrap" style={{ marginTop: 24 }}>
        {rows.length === 0 ? <div className="card-body"><Empty title="Ranking in progress">Our robots are still classifying agents and tools for this theme.</Empty></div> : (
          <table>
            <thead><tr><th>#</th><th>Agent / tool</th><th>Coverage score</th><th>Tasks covered</th><th>Best at</th><th>Access</th><th>Trust</th><th>Seen</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.provider_id}>
                  <td className="rank-num">{(page - 1) * PAGE + i + 1}</td>
                  <ProviderCell type={r.provider_type} slug={r.provider_slug} name={r.provider_name} desc={r.short_description} />
                  <td className="mono" title="Sum of task coverage across the theme">{Number(r.coverage_score).toFixed(1)}</td>
                  <td className="mono">{r.tasks_touched} / {t.tasks}</td>
                  <td className="small">{(r.top_tasks ?? []).join(" · ")}</td>
                  <td><span className="pills"><Tri label="REMOTE" value={r.remote} /><Tri label="LOCAL" value={r.local} /></span></td>
                  <td><Trust level={r.trust_level} /></td>
                  <td className="mono small muted">{timeAgo(r.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="pager">
        {page > 1 ? <Link className="btn" href={`/themes/${slug}?page=${page - 1}`}>← Previous</Link> : null}
        <span className="mono small muted">Page {page} / {pages}</span>
        {page < pages ? <Link className="btn" href={`/themes/${slug}?page=${page + 1}`}>Next →</Link> : null}
      </div>
      <p className="note">Capabilities are matched automatically from each publisher&apos;s own description (keyword method v1, low confidence) and will be refined. Price and quality columns appear as soon as pricing and verification robots cover this theme.</p>
    </>
  );
}
