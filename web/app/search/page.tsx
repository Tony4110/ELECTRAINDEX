import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Empty, SetupNotice } from "@/components/ui";

export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };
type SP = Promise<{ q?: string }>;
type Hit = { id: string; type: string; slug: string; name: string; short_description: string | null; rank: number };

const HREF: Record<string, string> = { mcp_server: "/mcp/", task: "/tasks/", capability: "/capabilities#", agent: "/agents/" };
const LABEL: Record<string, string> = { mcp_server: "MCP server", task: "Task", capability: "Capability", agent: "Agent", category: "Category", protocol: "Protocol" };

export default async function Search({ searchParams }: { searchParams: SP }) {
  const c = db();
  if (!c) return <SetupNotice />;
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  let hits: Hit[] = [];
  if (q) {
    const { data } = await c.rpc("search_entities", { p_q: q, p_type: null, p_limit: 60 });
    hits = (data as Hit[] | null) ?? [];
  }
  const tasks = hits.filter((h) => h.type === "task");
  const others = hits.filter((h) => h.type !== "task" && h.type !== "category" && h.type !== "protocol");

  return (
    <>
      <div className="eyebrow">Search</div>
      <h1>{q ? <>Results for “{q}”</> : "Search the index"}</h1>
      <form action="/search" method="get" className="search" role="search">
        <label htmlFor="sq" className="sr-only">What do you need an AI agent to do?</label>
        <input id="sq" name="q" type="search" defaultValue={q} placeholder="What do you need an AI agent to do?" />
        <button type="submit">Search →</button>
      </form>
      {q && hits.length === 0 ? <div style={{ marginTop: 24 }}><Empty title="Nothing found">Try a simpler phrase, like “leads”, “SEO” or “database”.</Empty></div> : null}
      {tasks.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Matching tasks</h2>
          <div className="tiles">{tasks.map((t) => <Link key={t.id} href={`/tasks/${t.slug}`} className="tile"><span className="cat">Task</span><span className="name">{t.name}</span></Link>)}</div>
        </section>
      ) : null}
      {others.length > 0 ? (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Servers, agents &amp; capabilities</h2>
          <div className="card table-wrap">
            <table>
              <tbody>
                {others.map((h) => (
                  <tr key={h.id}>
                    <td style={{ width: 140 }}><span className="badge">{(LABEL[h.type] ?? h.type).toUpperCase()}</span></td>
                    <td><Link href={`${HREF[h.type] ?? "/"}${h.slug}`} className="strong ink">{h.name}</Link><div className="desc">{h.short_description}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
