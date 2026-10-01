import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, type Task, type TaskRanking } from "@/lib/db";
import { num, timeAgo } from "@/lib/format";
import { Tri, Empty, SetupNotice } from "@/components/ui";
import { Trust, Coverage, ProviderCell, Quality, Price, Value, KindTabs } from "@/components/rank";

type P = Promise<{ slug: string }>;
type SP = Promise<{ page?: string; full?: string; kind?: string }>;
const PAGE = 50;

async function load(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_tasks").select("*").eq("slug", slug).maybeSingle();
  return data as Task | null;
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const t = await load((await params).slug);
  return t ? { title: `Best AI agents to ${t.name.toLowerCase()}`, description: `Which AI agents and tools can ${t.name.toLowerCase()}? Ranked by capability coverage, from sourced data.` } : { title: "Not found" };
}

export default async function TaskPage({ params, searchParams }: { params: P; searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const t = await load((await params).slug);
  if (!t) notFound();
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const onlyFull = sp.full === "1";

  const kind = sp.kind === "tools" ? "tools" : "agents";
  const op = kind === "agents" ? "eq" : "neq";

  let q = c.from("v_task_rankings").select("*", { count: "exact" }).eq("task_slug", t.slug).filter("provider_type", op, "agent");
  if (onlyFull) q = q.eq("coverage_pct", 100);
  q = kind === "agents"
    ? q.order("coverage_pct", { ascending: false }).order("quality_score", { ascending: false, nullsFirst: false })
    : q.order("coverage_pct", { ascending: false }).order("matched", { ascending: false }).order("last_seen_at", { ascending: false });
  const [{ data, count }, { count: fullCount }, { data: related }, { count: nAgents }, { count: nTools }] = await Promise.all([
    q.range((page - 1) * PAGE, page * PAGE - 1),
    c.from("v_task_rankings").select("provider_id", { count: "exact", head: true }).eq("task_slug", t.slug).eq("coverage_pct", 100).filter("provider_type", op, "agent"),
    c.from("v_tasks").select("slug,name").eq("category_slug", t.category_slug ?? "").neq("slug", t.slug).limit(6),
    c.from("v_task_rankings").select("provider_id", { count: "exact", head: true }).eq("task_slug", t.slug).eq("provider_type", "agent"),
    c.from("v_task_rankings").select("provider_id", { count: "exact", head: true }).eq("task_slug", t.slug).neq("provider_type", "agent"),
  ]);
  const rows = (data as TaskRanking[] | null) ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number, full = onlyFull) => `/tasks/${t.slug}?${new URLSearchParams({ ...(kind === "tools" ? { kind } : {}), ...(p > 1 ? { page: String(p) } : {}), ...(full ? { full: "1" } : {}) })}`;
  const what = kind === "agents" ? "AI agents" : "tools";

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/tasks">Tasks</Link><span>/</span>
        {t.category_slug ? <Link href={`/themes/${t.category_slug}`}>{t.category}</Link> : <span>{t.category}</span>}<span>/</span><span className="ink">{t.name}</span></nav>
      <div className="eyebrow">Task · {t.category}</div>
      <h1>Best AI agents to {t.name.toLowerCase()}</h1>
      <p className="lede">This task needs {t.capabilities.length} capabilities. {num(fullCount ?? 0)} {what} cover all of them; {num(count ?? 0)} {onlyFull ? "shown" : "cover at least one"}.</p>
      <div className="chips">
        <span className="small muted">Required capabilities:</span>
        {t.capabilities.map((x) => <Link key={x.slug} href={`/capabilities#${x.slug}`} className="chip acc">{x.name}</Link>)}
      </div>
      <KindTabs base={`/tasks/${t.slug}`} kind={kind} counts={{ agents: nAgents ?? 0, tools: nTools ?? 0 }} />
      <div className="filters">
        <Link href={link(1, false)} className={`chip ${!onlyFull ? "on" : ""}`}>All matches</Link>
        <Link href={link(1, true)} className={`chip ${onlyFull ? "on" : ""}`}>Full coverage only</Link>
      </div>

      <section className="grid cols-3">
        <div className="card span-2 table-wrap">
          {rows.length === 0 ? (
            <div className="card-body">
              <Empty title="No match yet">Our robots are still classifying agents and tools by capability. Nothing is listed on guesswork.</Empty>
            </div>
          ) : (
            <table>
              <thead>{kind === "agents"
                ? <tr><th>#</th><th>Agent</th><th>Coverage</th><th>Quality</th><th>From</th><th>Value</th><th>Trust</th></tr>
                : <tr><th>#</th><th>Tool</th><th>Coverage</th><th>Access</th><th>Trust</th><th>Seen</th></tr>}</thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.provider_id}>
                    <td className="rank-num">{(page - 1) * PAGE + i + 1}</td>
                    <ProviderCell type={r.provider_type} slug={r.provider_slug} name={r.provider_name} desc={r.short_description} />
                    <td title={(r.matched_capabilities ?? []).join(", ")}><Coverage pct={r.coverage_pct} /></td>
                    {kind === "agents" ? <>
                      <td><Quality score={r.quality_score} /></td>
                      <td><Price from={r.from_usd_month} free={r.has_free} hasPricing={r.has_pricing} /></td>
                      <td><Value label={r.value_label} /></td>
                    </> : <>
                      <td><span className="pills"><Tri label="REMOTE" value={r.remote} /><Tri label="LOCAL" value={r.local} /></span></td>
                    </>}
                    <td><Trust level={r.trust_level} /></td>
                    {kind === "tools" ? <td className="mono small muted">{timeAgo(r.last_seen_at)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Related tasks</h2></div>
          <ul className="signals">
            {((related as { slug: string; name: string }[] | null) ?? []).map((r) => (
              <li className="signal" key={r.slug}><Link href={`/tasks/${r.slug}`}>{r.name}</Link></li>
            ))}
          </ul>
        </div>
      </section>
      <div className="pager">
        {page > 1 ? <Link className="btn" href={link(page - 1)}>← Previous</Link> : null}
        <span className="mono small muted">Page {page} / {pages}</span>
        {page < pages ? <Link className="btn" href={link(page + 1)}>Next →</Link> : null}
      </div>
      <p className="note">Coverage = share of this task&apos;s required capabilities that an agent or tool documents. For AI agents, capabilities are those stated on the vendor&apos;s website; for tools, they are matched automatically from the publisher&apos;s description (keyword method, low confidence).</p>
    </>
  );
}
