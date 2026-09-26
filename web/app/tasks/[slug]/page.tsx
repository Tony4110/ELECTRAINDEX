import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, type Task } from "@/lib/db";
import { Empty, SetupNotice } from "@/components/ui";

type P = Promise<{ slug: string }>;
type Match = { agent_slug: string; agent_name: string; matched: number; n_req: number; coverage_pct: number; declared_for_task: boolean };

async function load(slug: string) {
  const c = db();
  if (!c) return null;
  const { data } = await c.from("v_tasks").select("*").eq("slug", slug).maybeSingle();
  return data as Task | null;
}

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const t = await load((await params).slug);
  return t ? { title: `Best AI agents to ${t.name.toLowerCase()}`, description: `Which AI agents can ${t.name.toLowerCase()}? Ranked by capability coverage, from sourced data.` } : { title: "Not found" };
}

export default async function TaskPage({ params }: { params: P }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const t = await load((await params).slug);
  if (!t) notFound();
  const { data } = await c.from("v_task_matches").select("*").eq("task_slug", t.slug).order("coverage_pct", { ascending: false }).limit(50);
  const matches = (data as Match[] | null) ?? [];
  const { data: related } = await c.from("v_tasks").select("slug,name").eq("category_slug", t.category_slug ?? "").neq("slug", t.slug).limit(6);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/tasks">Tasks</Link><span>/</span><span>{t.category}</span><span>/</span><span className="ink">{t.name}</span></nav>
      <div className="eyebrow">Task · {t.category}</div>
      <h1>Best AI agents to {t.name.toLowerCase()}</h1>
      <p className="lede">This task needs {t.capabilities.length} capabilities. Agents are ranked by how many of them they document, with a source for each one.</p>
      <div className="chips">
        <span className="small muted">Required capabilities:</span>
        {t.capabilities.map((x) => <Link key={x.slug} href={`/capabilities#${x.slug}`} className="chip acc">{x.name}</Link>)}
      </div>

      <section className="grid cols-3" style={{ marginTop: 28 }}>
        <div className="card span-2">
          <div className="card-head"><h2>Matching agents</h2></div>
          {matches.length === 0 ? (
            <div className="card-body">
              <Empty title="No verified agent yet">
                Our robots are classifying agents and MCP servers by capability. Agents appear here only once each capability is backed by a source. Nothing is listed on guesswork.
              </Empty>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Agent</th><th>Coverage</th><th>Declared for this task</th></tr></thead>
                <tbody>
                  {matches.map((m, i) => (
                    <tr key={m.agent_slug}>
                      <td className="mono muted">{i + 1}</td>
                      <td className="strong">{m.agent_name}</td>
                      <td className="mono">{m.coverage_pct}% <span className="muted small">({m.matched}/{m.n_req})</span></td>
                      <td>{m.declared_for_task ? "yes" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    </>
  );
}
