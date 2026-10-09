import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, providerHref, type Task, type TaskRanking } from "@/lib/db";
import { num, timeAgo, lowerFirst } from "@/lib/format";
import { pairSlug } from "@/lib/compare";
import { taskIntro, taskMetaDescription } from "@/lib/taskcopy";
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
  return t ? { title: `Best AI agents to ${lowerFirst(t.name)}`, description: taskMetaDescription(t.name, t.capabilities), alternates: { canonical: `/tasks/${t.slug}` } } : { title: "Not found" };
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
  // Display tie-break: at equal coverage, a well-verified (high-confidence) match
  // ranks above a keyword-guessed (medium/low) one, then by Agent Score.
  // Scores and the ranking formula are unchanged; this only orders the display.
  if (kind === "agents") {
    const CONF: Record<string, number> = { high: 3, medium: 2, low: 1 };
    rows.sort((a, b) =>
      b.coverage_pct - a.coverage_pct
      || (CONF[b.match_confidence] ?? 0) - (CONF[a.match_confidence] ?? 0)
      || (b.quality_score ?? -1) - (a.quality_score ?? -1));
  }
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number, full = onlyFull) => `/tasks/${t.slug}?${new URLSearchParams({ ...(kind === "tools" ? { kind } : {}), ...(p > 1 ? { page: String(p) } : {}), ...(full ? { full: "1" } : {}) })}`;
  const what = kind === "agents" ? "AI agents" : "tools";
  const fullRows = page === 1 ? rows.filter((r) => r.coverage_pct === 100) : [];
  const leaders = fullRows.slice(0, 2).map((r) => r.provider_name);
  const cmp = kind === "agents" ? fullRows.filter((r) => r.quality_score != null).slice(0, 2) : [];
  const comparePair = cmp.length === 2
    ? { href: `/compare/${pairSlug(cmp[0].provider_slug, cmp[1].provider_slug)}`, a: cmp[0].provider_name, b: cmp[1].provider_name }
    : null;

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/tasks">Tasks</Link><span>/</span>
        {t.category_slug ? <Link href={`/themes/${t.category_slug}`}>{t.category}</Link> : <span>{t.category}</span>}<span>/</span><span className="ink">{t.name}</span></nav>
      <div className="eyebrow">Task · {t.category}</div>
      <h1>Best AI agents to {lowerFirst(t.name)}</h1>
      <p className="lede">{kind === "agents"
        ? taskIntro(t.name, t.capabilities, fullCount ?? 0, leaders)
        : `This task needs ${t.capabilities.length} capabilities. ${num(fullCount ?? 0)} ${what} cover all of them; ${num(count ?? 0)} ${onlyFull ? "shown" : "cover at least one"}.`}</p>
      <div className="chips">
        <span className="small muted">Required capabilities:</span>
        {t.capabilities.map((x) => <Link key={x.slug} href={`/capabilities#${x.slug}`} className="chip acc">{x.name}</Link>)}
      </div>
      {comparePair ? <p className="small"><Link href={comparePair.href}>Compare the top two: {comparePair.a} vs {comparePair.b} →</Link></p> : null}
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
                    <td>
                      <Coverage pct={r.coverage_pct} />
                      {(r.matched_capabilities?.length ?? 0) > 0
                        ? <div className="small muted">{r.matched_capabilities.join(" · ")}{r.match_confidence && r.match_confidence !== "high" ? ` · ${r.match_confidence} match` : ""}</div>
                        : null}
                    </td>
                    {kind === "agents" ? <>
                      <td><Quality score={r.quality_score} /></td>
                      <td><Price from={r.from_usd_month} free={r.has_free} hasPricing={r.has_pricing} /></td>
                      <td><Value label={r.value_label} /></td>
                    </> : <>
                      <td><span className="pills"><Tri label="REMOTE" value={r.remote} /><Tri label="LOCAL" value={r.local} /></span></td>
                    </>}
                    <td><Trust level={r.trust_level} />{kind === "agents" ? <> <Link className="small faint" href={providerHref("agent", r.provider_slug)}>why →</Link></> : null}</td>
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
      <p className="note">Coverage = share of this task&apos;s required capabilities that an agent or tool documents. Agents are ranked by coverage, then by how well-verified the capability match is, then by Agent Score. For AI agents, capabilities are those stated on the vendor&apos;s website; for tools, they are matched automatically from the publisher&apos;s description (keyword method, low confidence). Each agent&apos;s capabilities, trust level, sources and verification dates are shown on its own page.</p>
    </>
  );
}
